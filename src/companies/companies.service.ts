import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { IUser } from 'src/users/user.interface';
import aqp from 'api-query-params';
import { FilesService } from 'src/files/files.service';
import { IBulkDeleteResult } from 'src/utils/interfaces/bulk-delete-result.interface';
import { ERole } from 'src/casl';
import { CompanyRepository } from './repositories/company.repository';
import { CompanyDocument } from './schemas/company.schema';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);
  private readonly ALLOWED_FILTER_FIELDS = new Set([
    'name',
    'address',
    'website',
    'numberOfEmployees',
  ]);

  private readonly DANGEROUS_OPERATORS = new Set([
    '$where',
    '$function',
    '$expr',
    '$accumulator',
    '$jsReduce',
  ]);

  private readonly ALLOWED_SORT_FIELDS = new Set([
    'name',
    'address',
    'createdAt',
    'updatedAt',
    'numberOfEmployees',
  ]);

  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly filesService: FilesService,
  ) {}

  async create(createCompanyDto: CreateCompanyDto, user: IUser) {
    const exists = await this.companyRepository.existsByName(createCompanyDto.name);
    if (exists) {
      throw new BadRequestException(`Company with name = ${createCompanyDto.name} already exists`);
    }

    return this.companyRepository.create({
      ...createCompanyDto,
      createdBy: { _id: user._id, email: user.email },
    });
  }

  async findAll(page?: number, limit?: number, query?: string, user?: IUser) {
    const { filter: rawFilter, sort: rawSort } = aqp(query);
    delete rawFilter.page;
    delete rawFilter.limit;

    // Sanitize: strip dangerous operators and unknown fields before hitting Mongoose
    const { filter, sort } = this.sanitizeAqpQuery(rawFilter, rawSort);

    // HR role restriction: restrict listing to the HR's own company
    if (user && user.role?.name === ERole.HR && user.company?._id) {
      filter._id = user.company._id;
    }

    // Guard against NaN / non-positive values coming from the controller's `+page` / `+limit`
    const safeLimit = limit > 0 ? limit : 10;
    const safePage = page > 0 ? page : 1;
    const offset = (safePage - 1) * safeLimit;

    const { result, totalItems, totalPages } = await this.companyRepository.findPaginated(
      filter,
      offset,
      safeLimit,
      sort,
    );

    const companyIds = result.map((company: any) => company._id);
    const jobCountMap = await this.companyRepository.getJobCountsForCompanies(companyIds);

    const resultWithCount = result.map((company: any) => ({
      ...company,
      totalJobs: jobCountMap.get(company._id.toString()) || 0,
    }));

    return {
      result: resultWithCount,
      meta: {
        pagination: {
          current_page: safePage,
          per_page: safeLimit,
          total_pages: totalPages,
          total: totalItems,
        },
      },
    };
  }

  async findOne(id: string, user?: IUser) {
    this.companyRepository.validateObjectId(id);

    // HR can only view their own company
    if (user && user.role?.name === ERole.HR && user.company?._id) {
      if (id !== user.company._id.toString()) {
        throw new BadRequestException('You can only view your own company');
      }
    }

    return this.companyRepository.findById(id);
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto, user: IUser) {
    this.companyRepository.validateObjectId(id);

    // Always fetch the company first so we can enforce HR ownership before mutating
    const company = await this.companyRepository.findById(id);
    await this.assertHrOwnership(company, id, user);

    // Delete the old logo file only after ownership is confirmed
    if (updateCompanyDto.logo !== undefined) {
      if (company?.logo && company.logo !== updateCompanyDto.logo) {
        try {
          await this.filesService.deleteFile('company', company.logo);
        } catch (error) {
          this.logger.warn(
            `Could not delete old company logo: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    return this.companyRepository.updateOne(
      { _id: id },
      { ...updateCompanyDto, updatedBy: { _id: user._id, email: user.email } },
    );
  }

  async remove(id: string, user: IUser) {
    this.companyRepository.validateObjectId(id);

    const company = await this.companyRepository.findById(id);
    if (!company) {
      throw new NotFoundException(`Company with id = ${id} not found`);
    }

    return this.companyRepository.softDeleteById(id, { _id: user._id, email: user.email });
  }

  async bulkRemove(
    ids: string[],
    user: IUser,
  ): Promise<IBulkDeleteResult & { deactivatedJobsCount: number }> {
    // Cascade: deactivate all active jobs for the deleted companies before soft-deleting
    const deactivatedJobsCount = await this.companyRepository.deactivateJobsForCompanies(ids);
    const result = await this.companyRepository.bulkSoftDelete(ids, user);

    return {
      ...result,
      deactivatedJobsCount,
    };
  }

  @Cron('0 2 * * *', {
    name: 'cleanup-orphaned-company-logos',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async cleanupOrphanedLogos(): Promise<{ scanned: number; deleted: number; errors: number }> {
    this.logger.log('Starting orphaned company logo cleanup');

    try {
      const allLogos = await this.companyRepository.findLogoReferences();
      const referencedLogos = new Set<string>(allLogos);

      const stats = await this.filesService.cleanupOrphanedFiles('company', referencedLogos);

      this.logger.log(
        `Orphaned logo cleanup complete: scanned=${stats.scanned}, deleted=${stats.deleted}, errors=${stats.errors}`,
      );

      return stats;
    } catch (error) {
      this.logger.error(
        `Orphaned logo cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
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

    const companies = await this.companyRepository.findByNameRegex(escapedName, limit);
    if (companies.length === 0) return [];

    const companyIds = companies.map(c => c._id);
    const jobCountMap = await this.companyRepository.getJobCountsForCompanies(companyIds);

    return companies.map(c => ({
      _id: c._id.toString(),
      name: c.name,
      address: c.address,
      description: c.description?.slice(0, 200) || '',
      jobCount: jobCountMap.get(c._id.toString()) || 0,
    }));
  }

  // Private helpers
  private sanitizeAqpQuery(
    rawFilter: Record<string, any>,
    rawSort: Record<string, any>,
  ): { filter: Record<string, any>; sort: Record<string, any> } {
    const filter: Record<string, any> = {};
    for (const [key, value] of Object.entries(rawFilter)) {
      if (this.DANGEROUS_OPERATORS.has(key)) continue;
      if (!this.ALLOWED_FILTER_FIELDS.has(key)) continue;
      filter[key] = value;
    }

    const sort: Record<string, any> = {};
    if (rawSort && typeof rawSort === 'object') {
      for (const [key, value] of Object.entries(rawSort)) {
        if (!this.ALLOWED_SORT_FIELDS.has(key)) continue;
        if (value !== 1 && value !== -1) continue;
        sort[key] = value;
      }
    }

    return { filter, sort };
  }

  private async assertHrOwnership(
    company: CompanyDocument | null,
    companyId: string,
    user: IUser,
  ): Promise<void> {
    if (!company) {
      throw new NotFoundException(`Company with id = ${companyId} not found`);
    }

    if (user.role?.name === ERole.HR) {
      if (!user.company?._id) {
        throw new ForbiddenException('HR user must be associated with a company');
      }
      if (company._id.toString() !== user.company._id.toString()) {
        throw new ForbiddenException('You can only modify your own company');
      }
    }
  }
}
