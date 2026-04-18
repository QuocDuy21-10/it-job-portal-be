import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company, CompanyDocument } from './schemas/company.schema';
import { SoftDeleteModel } from 'soft-delete-plugin-mongoose';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { IUser } from 'src/users/user.interface';
import aqp from 'api-query-params';
import { Job, JobDocument } from 'src/jobs/schemas/job.schema';
import { FilesService } from 'src/files/files.service';
import { buildEmbeddedCompanyIdsInCondition } from './company-snapshot.util';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(
    @InjectModel(Company.name) private companyModel: SoftDeleteModel<CompanyDocument>,
    @InjectModel(Job.name) private jobModel: SoftDeleteModel<JobDocument>,
    private readonly filesService: FilesService,
  ) {}
  async create(createCompanyDto: CreateCompanyDto, user: IUser) {
    const isExistName = await this.companyModel.find({
      name: createCompanyDto.name,
      isDeleted: false,
    });

    if (isExistName && isExistName.length > 0) {
      throw new BadRequestException(`Company with name = ${createCompanyDto.name} already exists`);
    }

    return await this.companyModel.create({
      ...createCompanyDto,
      createdBy: { _id: user._id, email: user.email },
    });
  }

  async findAll(page?: number, limit?: number, query?: string, user?: IUser) {
    const { filter, sort, population } = aqp(query);
    delete filter.page;
    delete filter.limit;

    // Filter theo companyId nếu user là HR
    if (user && user.role?.name === 'HR' && user.company?._id) {
      filter._id = user.company._id;
    }

    const offset = (page - 1) * limit;
    const defaultLimit = limit ? limit : 10;

    const totalItems = (await this.companyModel.find(filter)).length;
    const totalPages = Math.ceil(totalItems / defaultLimit);

    const result = await this.companyModel
      .find(filter)
      .skip(offset)
      .limit(defaultLimit)
      .sort(sort as any)
      .populate(population)
      .exec();

    // OPTIMIZED: Batch query for job counts using aggregation
    // Instead of N queries (one per company), use single aggregation query
    const companyIds = result.map(company => company._id);

    const jobCounts = await this.jobModel.aggregate<{
      _id: mongoose.Types.ObjectId;
      totalJobs: number;
    }>([
      {
        $match: {
          'company._id': buildEmbeddedCompanyIdsInCondition(companyIds),
          isActive: true,
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: '$company._id',
          totalJobs: { $sum: 1 },
        },
      },
    ]);

    // Create lookup map for O(1) access
    const jobCountMap = new Map<string, number>();
    jobCounts.forEach(item => {
      jobCountMap.set(item._id.toString(), item.totalJobs);
    });

    const resultWithCount = result.map(company => ({
      ...company.toObject(),
      totalJobs: jobCountMap.get(company._id.toString()) || 0,
    }));

    return {
      result: resultWithCount,
      meta: {
        pagination: {
          current_page: page,
          per_page: limit,
          total_pages: totalPages,
          total: totalItems,
        },
      },
    };
  }

  async findOne(id: string, user?: IUser) {
    this.validateObjectId(id);

    // Nếu user là HR, chỉ cho phép xem company của chính họ
    if (user && user.role?.name === 'HR' && user.company?._id) {
      if (id !== user.company._id.toString()) {
        throw new BadRequestException('You can only view your own company');
      }
    }

    return await this.companyModel.findById(id);
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto, user: IUser) {
    this.validateObjectId(id);

    // Delete the old logo file if a new logo is being set
    if (updateCompanyDto.logo !== undefined) {
      const currentCompany = await this.companyModel.findById(id).select('logo').lean();
      if (currentCompany?.logo && currentCompany.logo !== updateCompanyDto.logo) {
        try {
          await this.filesService.deleteFile('company', currentCompany.logo);
        } catch (error) {
          this.logger.warn(`Could not delete old company logo: ${error.message}`);
        }
      }
    }

    return await this.companyModel.updateOne(
      { _id: id },
      { ...updateCompanyDto, updatedBy: { _id: user._id, email: user.email } },
    );
  }

  async remove(id: string, user: IUser) {
    this.validateObjectId(id);
    await this.companyModel.updateOne(
      { _id: id },
      { deletedBy: { _id: user._id, email: user.email } },
    );
    return this.companyModel.softDelete({ _id: id });
  }

  @Cron('0 2 * * *', {
    name: 'cleanup-orphaned-company-logos',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async cleanupOrphanedLogos(): Promise<{ scanned: number; deleted: number; errors: number }> {
    this.logger.log('Starting orphaned company logo cleanup');

    try {
      // Collect logos from active companies
      const activeCompanies = await this.companyModel
        .find({ logo: { $ne: null } })
        .select('logo')
        .lean();

      // Collect logos from soft-deleted companies (plugin auto-filters; pass isDeleted: true)
      const deletedCompanies = await this.companyModel
        .find({ isDeleted: true, logo: { $ne: null } })
        .select('logo')
        .lean();

      const referencedLogos = new Set<string>();
      for (const company of [...activeCompanies, ...deletedCompanies]) {
        if (company.logo) {
          referencedLogos.add(company.logo);
        }
      }

      const stats = await this.filesService.cleanupOrphanedFiles('company', referencedLogos);

      this.logger.log(
        `Orphaned logo cleanup complete: scanned=${stats.scanned}, deleted=${stats.deleted}, errors=${stats.errors}`,
      );

      return stats;
    } catch (error) {
      this.logger.error(`Orphaned logo cleanup failed: ${error.message}`, error.stack);
      return { scanned: 0, deleted: 0, errors: 1 };
    }
  }

  async findByName(
    name: string,
    limit: number = 5,
  ): Promise<
    Array<{ _id: string; name: string; address: string; description: string; jobCount: number }>
  > {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const companies = await this.companyModel
      .find({
        name: { $regex: escapedName, $options: 'i' },
        isDeleted: { $ne: true },
      })
      .select('_id name address description website numberOfEmployees')
      .limit(limit)
      .lean()
      .exec();

    if (companies.length === 0) return [];

    const companyIds = companies.map(c => c._id);

    const jobCounts = await this.jobModel.aggregate<{
      _id: mongoose.Types.ObjectId;
      totalJobs: number;
    }>([
      {
        $match: {
          'company._id': buildEmbeddedCompanyIdsInCondition(companyIds),
          isActive: true,
          isDeleted: { $ne: true },
        },
      },
      { $group: { _id: '$company._id', totalJobs: { $sum: 1 } } },
    ]);

    const jobCountMap = new Map<string, number>();
    jobCounts.forEach(item => {
      jobCountMap.set(item._id.toString(), item.totalJobs);
    });

    return companies.map(c => ({
      _id: c._id.toString(),
      name: c.name,
      address: c.address,
      description: c.description?.slice(0, 200) || '',
      jobCount: jobCountMap.get(c._id.toString()) || 0,
    }));
  }

  private validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Not found Company with id = ${id}`);
    }
  }
}
