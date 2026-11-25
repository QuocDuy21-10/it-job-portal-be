import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { IUser } from 'src/users/user.interface';
import { IBulkDeleteResult } from 'src/utils/interfaces/bulk-delete-result.interface';
import { ERole } from 'src/casl/enums/role.enum';
import { EResumeStatus } from './enums/resume-status.enum';
import {
  andFilter,
  buildKeywordFilter,
  buildPaginationMeta,
  parseListQuery,
  resolvePagination,
} from 'src/utils/helpers/list-query.helper';
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import { ResumeRepository } from './repositories/resume.repository';
import { ApplicationNotificationService } from './services/application-notification.service';
import { StatisticsCacheService } from 'src/statistics/statistics-cache.service';
import { assertCompanyAccess } from 'src/companies/company-access.util';
import { RESUME_FILE_CONTENT_TYPES, resolveResumeFilePath } from './resume-storage.util';

// Fixed server-side population: the list UI only needs these names, and client-controlled
// populate/projection would let callers read any referenced collection.
const RESUME_LIST_POPULATION = [
  { path: 'companyId', select: { name: 1 } },
  { path: 'jobId', select: { name: 1 } },
];

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

  private readonly ALLOWED_SORT_FIELDS = new Set([
    'status',
    'priority',
    'createdAt',
    'updatedAt',
    'aiAnalysis.matchingScore',
  ]);

  private readonly KEYWORD_FIELDS = ['email', 'parsedData.fullName'];

  constructor(
    private readonly resumeRepository: ResumeRepository,
    private readonly applicationNotificationService: ApplicationNotificationService,
    private readonly statisticsCacheService: StatisticsCacheService,
  ) {}

  async findAll(page?: unknown, limit?: unknown, query?: string, user?: IUser, keyword?: string) {
    const { filter, sort } = this.buildListFilter(query, user, keyword);
    const pagination = resolvePagination(page, limit);

    const { result, totalItems } = await this.resumeRepository.findPaginated(
      filter,
      pagination.offset,
      pagination.limit,
      sort,
      RESUME_LIST_POPULATION,
    );

    return { result, meta: buildPaginationMeta(pagination.page, pagination.limit, totalItems) };
  }

  async countByStatus(
    query: unknown,
    user?: IUser,
    keyword?: string,
  ): Promise<Record<string, number>> {
    const { filter } = this.buildListFilter(query, user, keyword, ['status']);
    const statuses = Object.values(EResumeStatus);
    const [ALL, ...counts] = await Promise.all([
      this.resumeRepository.countDocuments(filter),
      ...statuses.map(status => this.resumeRepository.countDocuments({ ...filter, status })),
    ]);

    return { ALL, ...Object.fromEntries(statuses.map((status, i) => [status, counts[i]])) };
  }

  private buildListFilter(
    query: unknown,
    user?: IUser,
    keyword?: string,
    ignoredFields: string[] = [],
  ) {
    const { filter, sort } = parseListQuery(query, {
      filterFields: new Set(
        [...this.ALLOWED_FILTER_FIELDS].filter(field => !ignoredFields.includes(field)),
      ),
      sortFields: this.ALLOWED_SORT_FIELDS,
    });

    // Role-based scope applied after parsing — cannot be overridden by query string
    if (user?.role === ERole.HR) {
      assertCompanyAccess(user, user.company?._id);
      filter.companyId = user.company._id;
    }
    andFilter(filter, buildKeywordFilter(keyword, this.KEYWORD_FIELDS));

    return { filter, sort };
  }

  async findOne(id: string, user?: IUser) {
    this.validateObjectId(id);

    const resume = await this.resumeRepository.findById(id);

    if (!resume) {
      throw new NotFoundException(`Không tìm thấy hồ sơ ứng tuyển có ID ${id}`);
    }

    // HR users may only view resumes belonging to their company
    if (user?.role === ERole.HR) {
      assertCompanyAccess(
        user,
        resume.companyId,
        'Bạn chỉ có thể xem hồ sơ ứng tuyển của công ty mình',
      );
    }

    return resume;
  }

  /** Read access for candidate-facing routes: owner, HR of the resume's company, or SUPER_ADMIN. */
  async findOneForRead(id: string, user: IUser) {
    const resume = await this.findOne(id);
    const isOwner = resume.userId?.toString() === user._id.toString();

    if (!isOwner) {
      assertCompanyAccess(user, resume.companyId, 'Bạn không có quyền xem hồ sơ ứng tuyển này');
    }

    return resume;
  }

  async getFileForRead(id: string, user: IUser) {
    const resume = await this.findOneForRead(id, user);
    if (!resume.url) {
      throw new NotFoundException('Hồ sơ ứng tuyển này không có tệp CV');
    }

    const filePath = resolveResumeFilePath(resume.url);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Không tìm thấy tệp CV');
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
      throw new NotFoundException(`Không tìm thấy hồ sơ ứng tuyển có ID ${id}`);
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
      throw new NotFoundException(`Không tìm thấy hồ sơ ứng tuyển có ID ${id}`);
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
        throw new ForbiddenException('Tài khoản HR phải được gắn với một công ty');
      }

      const ownedCount = await this.resumeRepository.countOwnedByCompany(
        ids,
        user.company._id.toString(),
      );
      if (ownedCount !== ids.length) {
        throw new ForbiddenException('Bạn chỉ có thể xoá hồ sơ ứng tuyển của công ty mình');
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

  private validateObjectId(id: string): void {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Không tìm thấy hồ sơ ứng tuyển có id = ${id}`);
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
