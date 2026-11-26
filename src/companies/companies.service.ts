import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { IUser } from 'src/users/user.interface';
import {
  andFilter,
  buildKeywordFilter,
  buildPaginationMeta,
  parseListQuery,
  resolvePagination,
} from 'src/utils/helpers/list-query.helper';
import { FilesService } from 'src/files/files.service';
import { IBulkDeleteResult } from 'src/utils/interfaces/bulk-delete-result.interface';
import { ERole } from 'src/casl';
import { CompanyRepository } from './repositories/company.repository';
import { CompanyDocument } from './schemas/company.schema';
import { StatisticsCacheService } from 'src/statistics/statistics-cache.service';
import { TopHiringCompanyDto } from './dto/top-hiring-company.dto';
import { ListCacheService } from 'src/redis/list-cache.service';
import {
  LIST_CACHE_ENDPOINTS,
  LIST_CACHE_SCOPES,
  LIST_CACHE_TAGS,
  LIST_CACHE_TTL,
} from 'src/redis/list-cache.constants';
import { CronLockService } from 'src/redis/cron-lock.service';
import { SkillsService } from 'src/skills/skills.service';
import { UploadFolderType } from 'src/files/constants/upload-policy';

const ORPHANED_LOGO_CLEANUP_CRON = 'cleanup-orphaned-company-logos';
// Audit fields (admin/HR emails and IDs) are only for SUPER_ADMIN and the company's own HR.
const PUBLIC_COMPANY_PROJECTION = '-createdBy -updatedBy -deletedBy -isDeleted -deletedAt -__v';
const COVER_IS_LOGO_MESSAGE = 'Ảnh bìa phải khác logo';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);
  private readonly DEFAULT_TOP_HIRING_LIMIT = 8;
  private readonly MAX_TOP_HIRING_LIMIT = 12;
  private readonly ALLOWED_FILTER_FIELDS = new Set([
    'name',
    'address',
    'website',
    'numberOfEmployees',
    'createdAt',
    'industry',
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
    private readonly statisticsCacheService: StatisticsCacheService,
    private readonly listCacheService: ListCacheService,
    private readonly cronLockService: CronLockService,
    private readonly skillsService: SkillsService,
  ) {}

  async create(createCompanyDto: CreateCompanyDto, user: IUser) {
    const exists = await this.companyRepository.existsByName(createCompanyDto.name);
    if (exists) {
      throw new BadRequestException(`Công ty có tên ${createCompanyDto.name} đã tồn tại`);
    }
    await this.assertFileNotTaken(createCompanyDto.logo);
    await this.assertCoverUsable(createCompanyDto.coverImage, createCompanyDto.logo);
    const prepared = await this.prepareProfile(createCompanyDto);

    const company = await this.companyRepository.create({
      ...prepared,
      createdBy: { _id: user._id, email: user.email },
    });

    await this.clearCompanyListCaches();

    return company;
  }

  async findAll(page?: unknown, limit?: unknown, query?: string, user?: IUser, keyword?: string) {
    const { filter, sort } = parseListQuery(query, {
      filterFields: this.ALLOWED_FILTER_FIELDS,
      sortFields: this.ALLOWED_SORT_FIELDS,
    });

    // HR role restriction: restrict listing to the HR's own company
    if (user && user.role === ERole.HR && user.company?._id) {
      filter._id = user.company._id;
    }
    andFilter(filter, buildKeywordFilter(keyword, ['name']));

    const { page: safePage, limit: safeLimit, offset } = resolvePagination(page, limit);
    const cacheScope = this.resolveCompaniesListCacheScope(user);

    return this.listCacheService.getOrSet({
      keyInput: {
        endpoint: LIST_CACHE_ENDPOINTS.COMPANIES,
        scope: cacheScope,
        payload: {
          filter,
          limit: safeLimit,
          page: safePage,
          sort,
        },
      },
      ttlMs: LIST_CACHE_TTL.COMPANIES,
      tags: response => this.buildCompaniesListCacheTags(cacheScope, filter, response.result),
      loader: async () => {
        const { result, totalItems } = await this.companyRepository.findPaginated(
          filter,
          offset,
          safeLimit,
          sort,
          cacheScope === LIST_CACHE_SCOPES.PUBLIC ? PUBLIC_COMPANY_PROJECTION : undefined,
        );

        const companyIds = result.map((company: any) => company._id);
        const jobCountMap = await this.companyRepository.getJobCountsForCompanies(companyIds);

        const resultWithCount = result.map((company: any) => ({
          ...company,
          totalJobs: jobCountMap.get(company._id.toString()) || 0,
        }));

        return {
          result: resultWithCount,
          meta: buildPaginationMeta(safePage, safeLimit, totalItems),
        };
      },
    });
  }

  async findTopHiringCompanies(limit?: number): Promise<TopHiringCompanyDto[]> {
    const safeLimit = this.normalizeTopHiringLimit(limit);
    const { value } = await this.statisticsCacheService.getOrSetTopHiringCompanies(safeLimit, () =>
      this.companyRepository.findTopHiringCompanies(safeLimit),
    );

    return value;
  }

  async findOne(id: string, user?: IUser) {
    this.companyRepository.validateObjectId(id);

    const isHr = user?.role === ERole.HR && !!user.company?._id;
    const notFound = new NotFoundException(`Không tìm thấy công ty có id = ${id}`);

    // HR can only view their own company; same 404 as a missing ID so IDs cannot be probed.
    if (isHr && id !== user.company._id.toString()) {
      throw notFound;
    }

    const company = await this.companyRepository.findById(
      id,
      isHr || user?.role === ERole.SUPER_ADMIN ? undefined : PUBLIC_COMPANY_PROJECTION,
    );
    if (!company) {
      throw notFound;
    }

    return company;
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto, user: IUser) {
    this.companyRepository.validateObjectId(id);

    // Always fetch the company first so we can enforce HR ownership before mutating
    const company = await this.companyRepository.findById(id);
    await this.assertHrOwnership(company, id, user);
    if (updateCompanyDto.logo !== company?.logo) {
      await this.assertFileNotTaken(updateCompanyDto.logo, id);
    }
    const logo =
      updateCompanyDto.logo !== undefined ? updateCompanyDto.logo : (company.logo ?? null);
    const coverImage =
      updateCompanyDto.coverImage !== undefined
        ? updateCompanyDto.coverImage
        : (company.coverImage ?? null);
    if (coverImage !== (company.coverImage ?? null)) {
      await this.assertCoverUsable(coverImage, logo, id);
    } else if (coverImage && coverImage === logo) {
      throw new BadRequestException(COVER_IS_LOGO_MESSAGE);
    }
    const prepared = await this.prepareProfile(updateCompanyDto);

    const result = await this.companyRepository.updateOne(
      { _id: id },
      { ...prepared, updatedBy: { _id: user._id, email: user.email } },
    );

    const name = updateCompanyDto.name ?? company.name;
    const snapshotChanged = name !== company.name || logo !== (company.logo ?? null);
    if (snapshotChanged) {
      // Jobs and HR users embed {_id, name, logo}; they showed the old name and a deleted logo.
      await this.companyRepository.syncCompanySnapshot(id, { name, logo });
    }

    // Last, once nothing in the DB points at the old file any more. A file may have moved between
    // logo and cover, so skip any that is still in use.
    for (const oldFile of [company.logo, company.coverImage]) {
      if (oldFile && oldFile !== logo && oldFile !== coverImage) {
        await this.deleteCompanyFileQuietly(oldFile);
      }
    }

    await this.statisticsCacheService.clearTopHiringCompanies();
    await this.clearCompanyListCaches();
    if (snapshotChanged) await this.clearJobListCaches();

    return result;
  }

  async remove(id: string, user: IUser) {
    this.companyRepository.validateObjectId(id);

    const company = await this.companyRepository.findById(id);
    if (!company) {
      throw new NotFoundException(`Không tìm thấy công ty có id = ${id}`);
    }

    // Same cascade as bulkRemove: jobs of a deleted company must leave the public site
    await this.companyRepository.deactivateJobsForCompanies([id]);
    const result = await this.companyRepository.softDeleteById(id, {
      _id: user._id,
      email: user.email,
    });

    await this.statisticsCacheService.clearTopHiringCompanies();
    await this.clearCompanyListCaches();
    await this.clearJobListCaches();

    return result;
  }

  // A logo or cover file belongs to one company: replacing it deletes the old file, so taking another
  // company's file name would let the next update delete that company's image.
  private async assertFileNotTaken(fileName: string | null | undefined, exceptCompanyId?: string) {
    if (
      fileName &&
      (await this.companyRepository.isFileUsedByAnotherCompany(fileName, exceptCompanyId))
    ) {
      throw new ConflictException('Ảnh này đang được công ty khác sử dụng');
    }
  }

  private async assertCoverUsable(
    cover: string | null | undefined,
    logo: string | null | undefined,
    exceptCompanyId?: string,
  ) {
    if (!cover) return;
    if (cover === logo) {
      throw new BadRequestException(COVER_IS_LOGO_MESSAGE);
    }
    const files = await this.filesService.listFilesWithAge(UploadFolderType.COMPANY);
    if (!files.some(file => file.fileName === cover)) {
      throw new BadRequestException('Không tìm thấy ảnh bìa đã tải lên');
    }
    await this.assertFileNotTaken(cover, exceptCompanyId);
  }

  // Normalizes the tech stack against the skills catalog and checks the benefit list.
  private async prepareProfile<T extends UpdateCompanyDto>(dto: T): Promise<T> {
    const prepared = { ...dto };

    if (dto.techStack !== undefined) {
      prepared.techStack = await this.skillsService.normalizeControlledSkills(dto.techStack ?? []);
    }

    if (dto.benefits !== undefined) {
      const benefits = dto.benefits ?? [];
      if (new Set(benefits.map(benefit => benefit.type)).size !== benefits.length) {
        throw new BadRequestException('Mỗi loại phúc lợi chỉ được chọn một lần');
      }
      prepared.benefits = benefits.map(benefit => ({
        type: benefit.type,
        note: benefit.note || null,
      }));
    }

    return prepared;
  }

  private async deleteCompanyFileQuietly(fileName: string): Promise<void> {
    try {
      await this.filesService.deleteFile(UploadFolderType.COMPANY, fileName);
    } catch (error) {
      this.logger.warn(
        `Could not delete old company file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async bulkRemove(
    ids: string[],
    user: IUser,
  ): Promise<IBulkDeleteResult & { deactivatedJobsCount: number }> {
    // Cascade: deactivate all active jobs for the deleted companies before soft-deleting
    const deactivatedJobsCount = await this.companyRepository.deactivateJobsForCompanies(ids);
    const result = await this.companyRepository.bulkSoftDelete(ids, user);
    await this.statisticsCacheService.clearTopHiringCompanies();
    await Promise.all([this.clearCompanyListCaches(), this.clearJobListCaches()]);

    return {
      ...result,
      deactivatedJobsCount,
    };
  }

  @Cron('0 2 * * *', {
    name: ORPHANED_LOGO_CLEANUP_CRON,
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async runOrphanedLogoCleanupCron(): Promise<void> {
    await this.cronLockService.runExclusive(ORPHANED_LOGO_CLEANUP_CRON, () =>
      this.cleanupOrphanedLogos(),
    );
  }

  async cleanupOrphanedLogos(): Promise<{ scanned: number; deleted: number; errors: number }> {
    this.logger.log('Starting orphaned company file cleanup');

    try {
      const allFiles = await this.companyRepository.findFileReferences();
      const referencedFiles = new Set<string>(allFiles);

      const stats = await this.filesService.cleanupOrphanedFiles(
        UploadFolderType.COMPANY,
        referencedFiles,
      );

      this.logger.log(
        `Orphaned company file cleanup complete: scanned=${stats.scanned}, deleted=${stats.deleted}, errors=${stats.errors}`,
      );

      return stats;
    } catch (error) {
      this.logger.error(
        `Orphaned company file cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
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
  private normalizeTopHiringLimit(limit?: number): number {
    const parsedLimit = Number(limit);

    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      return this.DEFAULT_TOP_HIRING_LIMIT;
    }

    return Math.min(parsedLimit, this.MAX_TOP_HIRING_LIMIT);
  }

  private async assertHrOwnership(
    company: CompanyDocument | null,
    companyId: string,
    user: IUser,
  ): Promise<void> {
    if (!company) {
      throw new NotFoundException(`Không tìm thấy công ty có id = ${companyId}`);
    }

    if (user.role === ERole.HR) {
      if (!user.company?._id) {
        throw new ForbiddenException('Tài khoản HR phải được gắn với một công ty');
      }
      if (company._id.toString() !== user.company._id.toString()) {
        throw new ForbiddenException('Bạn chỉ có thể sửa công ty của mình');
      }
    }
  }

  private resolveCompaniesListCacheScope(user?: IUser): string {
    if (user?.role === ERole.HR && user.company?._id) {
      return LIST_CACHE_SCOPES.hr(user.company._id.toString());
    }

    if (user?.role === ERole.SUPER_ADMIN) {
      return LIST_CACHE_SCOPES.SUPER_ADMIN;
    }

    return LIST_CACHE_SCOPES.PUBLIC;
  }

  private buildCompaniesListCacheTags(
    scope: string,
    filter: Record<string, any>,
    companies: any[],
  ): string[] {
    const tags = [
      LIST_CACHE_TAGS.companies.all,
      LIST_CACHE_TAGS.companies.scope(scope),
      ...Object.keys(filter).map(field => LIST_CACHE_TAGS.companies.filter(field)),
    ];

    const scopedCompanyId = this.toIdString(filter._id);
    if (scopedCompanyId) {
      tags.push(LIST_CACHE_TAGS.companies.company(scopedCompanyId));
    }

    for (const company of companies) {
      const companyId = this.toIdString(company?._id);
      if (companyId) {
        tags.push(LIST_CACHE_TAGS.companies.company(companyId));
      }
    }

    return tags;
  }

  private async clearCompanyListCaches(): Promise<void> {
    await this.listCacheService.reclaimByTags([LIST_CACHE_TAGS.companies.all]);
  }

  private async clearJobListCaches(): Promise<void> {
    await this.listCacheService.reclaimByTags([LIST_CACHE_TAGS.jobs.all]);
  }

  private toIdString(value: unknown): string | undefined {
    if (!value) {
      return undefined;
    }

    return value.toString();
  }
}
