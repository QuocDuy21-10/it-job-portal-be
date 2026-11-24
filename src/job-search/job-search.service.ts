import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { EExternalJobStatus } from 'src/job-ingestion/enums/external-job-status.enum';
import { EJobSourceDisplayPolicy } from 'src/job-ingestion/enums/job-source-display-policy.enum';
import { DEFAULT_DISPLAY_POLICY } from 'src/job-ingestion/job-ingestion.constants';
import { ExternalJob, ExternalJobDocument } from 'src/job-ingestion/schemas/external-job.schema';
import { JobSource, JobSourceDocument } from 'src/job-ingestion/schemas/job-source.schema';
import { Job, JobDocument } from 'src/jobs/schemas/job.schema';
import {
  LIST_CACHE_ENDPOINTS,
  LIST_CACHE_SCOPES,
  LIST_CACHE_TAGS,
  LIST_CACHE_TTL,
} from 'src/redis/list-cache.constants';
import { ListCacheService } from 'src/redis/list-cache.service';
import { getLocationByCode, resolveLocationFromInput } from 'src/utils/location-catalog';
import { SearchJobsQueryDto } from './dto/search-jobs-query.dto';
import {
  IExternalJobDetail,
  IJobSearchItem,
  IJobSearchResponse,
  INormalizedJobSearch,
} from './interfaces/job-search-item.interface';
import {
  JOB_SEARCH_DEFAULT_LIMIT,
  JOB_SEARCH_DEFAULT_PAGE,
  JOB_SEARCH_MAX_PAGE,
} from './job-search.constants';
import { buildJobSearchPlan, JobSearchPlan } from './job-search-pipeline';

const EXTERNAL_DETAIL_FIELDS =
  'sourceKey title companyName location locationCode isRemote skills level descriptionHtml publishedAt createdAt expiresAt sourceUrl applyUrl status salaryText';

const toOptionalNumber = (value: unknown): number | undefined =>
  value === undefined || value === null || value === '' ? undefined : Number(value);

@Injectable()
export class JobSearchService {
  constructor(
    @InjectModel(Job.name) private readonly jobModel: Model<JobDocument>,
    @InjectModel(ExternalJob.name)
    private readonly externalJobModel: Model<ExternalJobDocument>,
    @InjectModel(JobSource.name)
    private readonly jobSourceModel: Model<JobSourceDocument>,
    private readonly listCacheService: ListCacheService,
  ) {}

  async search(query: SearchJobsQueryDto): Promise<IJobSearchResponse> {
    const search = this.normalize(query);
    const hiddenSourceKeys =
      search.source === 'internal'
        ? []
        : await this.jobSourceModel.distinct('key', {
            displayPolicy: EJobSourceDisplayPolicy.HIDDEN,
          });
    const plan = buildJobSearchPlan(
      search,
      new Date(),
      this.externalJobModel.collection.collectionName,
      hiddenSourceKeys,
    );

    const items = await this.findPage(plan);
    const skipped = (search.page - 1) * search.limit;
    // A short page is the last one, so its size already gives the total without a second scan.
    const isLastPage = items.length < search.limit && (items.length > 0 || search.page === 1);
    const total = isLastPage
      ? skipped + items.length
      : // The cached total can lag behind a job published in the last minute.
        Math.max(
          await this.countTotal(plan, search, hiddenSourceKeys),
          items.length > 0 ? skipped + items.length : 0,
        );

    return {
      result: items,
      meta: {
        pagination: {
          current_page: search.page,
          per_page: search.limit,
          total_pages: Math.min(Math.ceil(total / search.limit), JOB_SEARCH_MAX_PAGE),
          total,
        },
      },
    };
  }

  async findExternalJob(id: string): Promise<IExternalJobDetail> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('ID không đúng định dạng');
    }

    const job = await this.externalJobModel.findById(id).select(EXTERNAL_DETAIL_FIELDS).lean();

    if (!job) {
      throw new NotFoundException(`Không tìm thấy tin tuyển dụng bên ngoài có ID ${id}`);
    }

    const source = await this.jobSourceModel
      .findOne({ key: job.sourceKey })
      .select('displayPolicy')
      .lean();
    const displayPolicy = source?.displayPolicy ?? DEFAULT_DISPLAY_POLICY;

    if (displayPolicy === EJobSourceDisplayPolicy.HIDDEN) {
      throw new NotFoundException(`Không tìm thấy tin tuyển dụng bên ngoài có ID ${id}`);
    }

    // STALE is internal; an expired job is closed for the public even before the next sync.
    const isClosed =
      job.status === EExternalJobStatus.CLOSED ||
      (job.expiresAt != null && new Date(job.expiresAt).getTime() <= Date.now());

    return {
      id: String(job._id),
      sourceKey: job.sourceKey,
      title: job.title,
      companyName: job.companyName,
      location: job.location,
      locationCode: job.locationCode,
      isRemote: job.isRemote,
      skills: job.skills,
      level: job.level,
      salaryText: job.salaryText,
      descriptionHtml:
        displayPolicy === EJobSourceDisplayPolicy.LINK_ONLY ? '' : job.descriptionHtml,
      postedAt: job.publishedAt ?? job.createdAt,
      sourceUrl: job.sourceUrl,
      applyUrl: job.applyUrl ?? job.sourceUrl,
      status: isClosed ? 'CLOSED' : 'ACTIVE',
      displayPolicy,
    };
  }

  private async findPage(plan: JobSearchPlan): Promise<IJobSearchItem[]> {
    if (plan.target === 'empty') return [];

    return plan.target === 'internal'
      ? this.jobModel.aggregate<IJobSearchItem>(plan.pipeline)
      : this.externalJobModel.aggregate<IJobSearchItem>(plan.pipeline);
  }

  // Counting reads every match, so it is cached under the filters alone: all pages and sorts share it.
  private async countTotal(
    plan: JobSearchPlan,
    search: INormalizedJobSearch,
    hiddenSourceKeys: string[],
  ): Promise<number> {
    if (plan.target === 'empty') return 0;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { page: _page, limit: _limit, sort: _sort, ...filters } = search;

    return this.listCacheService.getOrSet({
      keyInput: {
        endpoint: LIST_CACHE_ENDPOINTS.JOB_SEARCH_TOTAL,
        scope: LIST_CACHE_SCOPES.PUBLIC,
        payload: { ...filters, hiddenSourceKeys },
      },
      ttlMs: LIST_CACHE_TTL.JOBS,
      tags: [LIST_CACHE_TAGS.jobs.all],
      loader: async () => {
        const counts = await Promise.all([
          plan.internalMatch ? this.countMatches(this.jobModel, plan.internalMatch) : 0,
          plan.externalMatch ? this.countMatches(this.externalJobModel, plan.externalMatch) : 0,
        ]);

        return counts[0] + counts[1];
      },
    });
  }

  private async countMatches(model: Model<any>, match: Record<string, any>): Promise<number> {
    const [row] = await model.aggregate<{ count: number }>([
      { $match: match },
      { $count: 'count' },
    ]);

    return row?.count ?? 0;
  }

  // Normalizes independently of ValidationPipe so the service is safe to call directly.
  private normalize(query: SearchJobsQueryDto): INormalizedJobSearch {
    const salaryMin = toOptionalNumber(query.salaryMin);
    const salaryMax = toOptionalNumber(query.salaryMax);

    if (salaryMin !== undefined && salaryMax !== undefined && salaryMin > salaryMax) {
      throw new BadRequestException('salaryMin không được lớn hơn salaryMax');
    }

    return {
      keyword: query.keyword?.trim() || undefined,
      skills: query.skills?.trim() || undefined,
      locationCode: this.normalizeLocationCode(query.locationCode),
      level: query.level,
      formOfWork: query.formOfWork,
      salaryMin,
      salaryMax,
      source: query.source ?? 'all',
      sort: query.sort ?? 'newest',
      page: toOptionalNumber(query.page) ?? JOB_SEARCH_DEFAULT_PAGE,
      limit: toOptionalNumber(query.limit) ?? JOB_SEARCH_DEFAULT_LIMIT,
    };
  }

  private normalizeLocationCode(value?: string): string | undefined {
    const trimmed = value?.trim().toLowerCase();

    if (!trimmed) {
      return undefined;
    }

    return (getLocationByCode(trimmed) ?? resolveLocationFromInput(trimmed))?.code ?? trimmed;
  }
}
