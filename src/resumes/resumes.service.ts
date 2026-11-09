import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserCvDto } from './dto/create-resume.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { IUser } from 'src/users/user.interface';
import { IBulkDeleteResult } from 'src/utils/interfaces/bulk-delete-result.interface';
import { ERole } from 'src/casl/enums/role.enum';
import aqp from 'api-query-params';
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import { EResumeStatus } from './enums/resume-status.enum';
import { ResumeRepository } from './repositories/resume.repository';
import { ApplicationNotificationService } from './services/application-notification.service';
import { StatisticsCacheService } from 'src/statistics/statistics-cache.service';
import { assertCompanyAccess } from 'src/companies/company-access.util';
import { rethrowDuplicateApplication } from './duplicate-application.util';
import { RESUME_FILE_CONTENT_TYPES, resolveResumeFilePath } from './resume-storage.util';

// Fixed server-side population: the list UI only needs these names, and client-controlled
// populate/projection would let callers read any referenced collection.
const RESUME_LIST_POPULATION = [
  { path: 'companyId', select: { name: 1 } },
  { path: 'jobId', select: { name: 1 } },
];

const SAFE_VALUE_OPERATORS = new Set(['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin']);

@Injectable()
export class ResumesService {
  private readonly logger = new Logger(ResumesService.name);

  private readonly ALLOWED_FILTER_FIELDS = new Set([
    'status',
    'priority',
    'companyId',
    'jobId',
    'userId',
    'isParsed',
    'isAnalyzed',
    'email',
    'createdAt',
    'updatedAt',
    'aiAnalysis.matchingScore',
  ]);

  private readonly DANGEROUS_OPERATORS = new Set([
    '$where',
    '$function',
    '$expr',
    '$accumulator',
    '$jsReduce',
  ]);

  private readonly ALLOWED_SORT_FIELDS = new Set([
    'status',
    'priority',
    'createdAt',
    'updatedAt',
    'aiAnalysis.matchingScore',
  ]);

  constructor(
    private readonly resumeRepository: ResumeRepository,
    private readonly applicationNotificationService: ApplicationNotificationService,
    private readonly statisticsCacheService: StatisticsCacheService,
  ) {}

  async create(createUserCvDto: CreateUserCvDto, user: IUser) {
    const newResume = await this.resumeRepository
      .create({
        email: user.email,
        userId: user._id,
        status: EResumeStatus.PENDING,
        histories: [
          {
            status: EResumeStatus.PENDING,
            updatedAt: new Date(),
            updatedBy: { _id: user._id, email: user.email },
          },
        ],
        ...createUserCvDto,
        createdBy: { _id: user._id, email: user.email },
      })
      .catch(rethrowDuplicateApplication);

    await this.clearDashboardCachesForCompany(newResume.companyId?.toString());

    return { _id: newResume?._id, createdAt: newResume?.createdAt };
  }

  async findAll(page?: number, limit?: number, query?: string, user?: IUser) {
    const { filter: rawFilter, sort: rawSort } = aqp(query);
    const { filter, sort } = this.sanitizeAqpQuery(rawFilter, rawSort);

    // Role-based scope applied after sanitization — cannot be overridden by query string
    if (user?.role === ERole.HR) {
      assertCompanyAccess(user, user.company?._id);
      filter.companyId = user.company._id;
    }

    const safeLimit = limit > 0 ? limit : 10;
    const safeOffset = ((page > 0 ? page : 1) - 1) * safeLimit;

    const { result, totalItems, totalPages } = await this.resumeRepository.findPaginated(
      filter,
      safeOffset,
      safeLimit,
      sort,
      RESUME_LIST_POPULATION,
    );

    return {
      result,
      meta: {
        pagination: {
          current_page: page,
          per_page: safeLimit,
          total_pages: totalPages,
          total: totalItems,
        },
      },
    };
  }

  async findOne(id: string, user?: IUser) {
    this.validateObjectId(id);

    const resume = await this.resumeRepository.findById(id);

    if (!resume) {
      throw new NotFoundException(`Resume with ID ${id} not found`);
    }

    // HR users may only view resumes belonging to their company
    if (user?.role === ERole.HR) {
      assertCompanyAccess(user, resume.companyId, 'You can only view resumes of your own company');
    }

    return resume;
  }

  /** Read access for candidate-facing routes: owner, HR of the resume's company, or SUPER_ADMIN. */
  async findOneForRead(id: string, user: IUser) {
    const resume = await this.findOne(id);
    const isOwner = resume.userId?.toString() === user._id.toString();

    if (!isOwner) {
      assertCompanyAccess(user, resume.companyId, 'You do not have permission to view this resume');
    }

    return resume;
  }

  async getFileForRead(id: string, user: IUser) {
    const resume = await this.findOneForRead(id, user);
    if (!resume.url) {
      throw new NotFoundException('No CV file found for this resume');
    }

    const filePath = resolveResumeFilePath(resume.url);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('CV file not found');
    }

    const fileName = path.basename(filePath);
    return {
      filePath,
      fileName,
      contentType:
        RESUME_FILE_CONTENT_TYPES[path.extname(fileName).toLowerCase()] ??
        'application/octet-stream',
    };
  }

  async update(id: string, updateResumeDto: UpdateResumeDto, user?: IUser) {
    this.validateObjectId(id);

    // Verify the resume exists and that the HR user owns it before mutating
    const existing = await this.resumeRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Resume with ID ${id} not found`);
    }

    if (user?.role === ERole.HR) {
      assertCompanyAccess(
        user,
        existing.companyId,
        'You can only update resumes that belong to your company',
      );
    }

    const { status } = updateResumeDto;
    const updateData: any = { ...updateResumeDto };

    if (status) {
      updateData.status = status;
      if (user) {
        updateData.updatedBy = { _id: user._id, email: user.email };
        updateData.$push = {
          histories: {
            status,
            updatedAt: new Date(),
            updatedBy: { _id: user._id, email: user.email },
          },
        };
      }
    } else if (user) {
      updateData.updatedBy = { _id: user._id, email: user.email };
    }

    const result = await this.resumeRepository.updateOne({ _id: id }, updateData);

    if (status && user) {
      this.applicationNotificationService
        .sendStatusChangeNotification(id, status, user)
        .catch(err =>
          this.logger.error(`Failed to send status change notification: ${err.message}`),
        );
    }

    await this.clearDashboardCachesForCompany(existing.companyId?.toString());

    return result;
  }

  async remove(id: string, user: IUser) {
    this.validateObjectId(id);

    const existing = await this.resumeRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Resume with ID ${id} not found`);
    }

    if (user?.role === ERole.HR) {
      assertCompanyAccess(
        user,
        existing.companyId,
        'You can only delete resumes that belong to your company',
      );
    }

    const result = await this.resumeRepository.softDeleteById(id, {
      _id: user._id,
      email: user.email,
    });

    await this.clearDashboardCachesForCompany(existing.companyId?.toString());

    return result;
  }

  async bulkRemove(ids: string[], user: IUser): Promise<IBulkDeleteResult> {
    const affectedCompanyIds = user.company?._id
      ? [user.company._id.toString()]
      : await this.resumeRepository.findCompanyIdsByResumeIds(ids);

    if (user.role === ERole.HR) {
      if (!user.company?._id) {
        throw new ForbiddenException('HR user must be associated with a company');
      }

      const ownedCount = await this.resumeRepository.countOwnedByCompany(
        ids,
        user.company._id.toString(),
      );
      if (ownedCount !== ids.length) {
        throw new ForbiddenException('You can only delete resumes that belong to your company');
      }
    }

    const result = await this.resumeRepository.bulkSoftDelete(ids, user);

    await this.clearDashboardCachesForCompanies(affectedCompanyIds);

    return result;
  }

  async getResumeByUser(user: IUser) {
    return this.resumeRepository.findByUserId(user._id.toString());
  }

  async getResumeOfMe(user: IUser) {
    return this.resumeRepository.findUrlsByUserId(user._id.toString());
  }

  async notifyHrNewApplication(
    resumeId: string,
    jobName: string,
    companyName: string,
    companyId: string,
    candidateName: string,
    candidateEmail: string,
  ): Promise<void> {
    return this.applicationNotificationService.notifyHrNewApplication(
      resumeId,
      jobName,
      companyName,
      companyId,
      candidateName,
      candidateEmail,
    );
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
      const safeValue = this.sanitizeFilterValue(value);
      if (safeValue !== undefined) filter[key] = safeValue;
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

  private sanitizeFilterValue(value: unknown): unknown {
    if (value instanceof RegExp) {
      // Treat client regex as a literal substring search to avoid ReDoS.
      return new RegExp(this.escapeRegex(value.source), value.flags.includes('i') ? 'i' : '');
    }
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
      const entries = Object.entries(value).filter(([op]) => SAFE_VALUE_OPERATORS.has(op));
      return entries.length > 0 ? Object.fromEntries(entries) : undefined;
    }
    return value;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Not found Resume with id = ${id}`);
    }
  }

  private async clearDashboardCachesForCompany(companyId?: string): Promise<void> {
    await this.statisticsCacheService.clearScopedDashboards(companyId);
  }

  private async clearDashboardCachesForCompanies(companyIds: string[]): Promise<void> {
    await Promise.all([
      this.statisticsCacheService.clearAdminDashboard(),
      this.statisticsCacheService.clearHrDashboards(companyIds),
    ]);
  }
}
