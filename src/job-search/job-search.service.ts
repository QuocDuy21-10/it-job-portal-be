import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { EExternalJobStatus } from 'src/job-ingestion/enums/external-job-status.enum';
import { EJobSourceDisplayPolicy } from 'src/job-ingestion/enums/job-source-display-policy.enum';
import { DEFAULT_DISPLAY_POLICY } from 'src/job-ingestion/job-ingestion.constants';
import { ExternalJob, ExternalJobDocument } from 'src/job-ingestion/schemas/external-job.schema';
import { JobSource, JobSourceDocument } from 'src/job-ingestion/schemas/job-source.schema';
import { Job, JobDocument } from 'src/jobs/schemas/job.schema';
import { getLocationByCode, resolveLocationFromInput } from 'src/utils/location-catalog';
import { SearchJobsQueryDto } from './dto/search-jobs-query.dto';
import {
  IExternalJobDetail,
  IJobSearchItem,
  IJobSearchResponse,
  INormalizedJobSearch,
} from './interfaces/job-search-item.interface';
import { JOB_SEARCH_DEFAULT_LIMIT, JOB_SEARCH_DEFAULT_PAGE } from './job-search.constants';
import { buildJobSearchPlan } from './job-search-pipeline';

const EXTERNAL_DETAIL_FIELDS =
  'sourceKey title companyName location locationCode isRemote skills level descriptionHtml publishedAt createdAt expiresAt sourceUrl applyUrl status salaryText';

type JobSearchFacet = { items: IJobSearchItem[]; total: Array<{ count: number }> };

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
  ) {}

  async search(query: SearchJobsQueryDto): Promise<IJobSearchResponse> {
    const search = this.normalize(query);
    const hiddenSourceKeys =
      search.source === 'internal'
        ? []
        : await this.jobSourceModel.distinct('key', {
            displayPolicy: EJobSourceDisplayPolicy.HIDDEN,
          });
    // shortcut: uncached aggregate, add ListCacheService with ingestion-sync invalidation if p95 latency grows
    const plan = buildJobSearchPlan(
      search,
      new Date(),
      this.externalJobModel.collection.collectionName,
      hiddenSourceKeys,
    );

    let facet: JobSearchFacet | undefined;

    if (plan.target === 'internal') {
      [facet] = await this.jobModel.aggregate<JobSearchFacet>(plan.pipeline);
    } else if (plan.target === 'external') {
      [facet] = await this.externalJobModel.aggregate<JobSearchFacet>(plan.pipeline);
    }

    const total = facet?.total[0]?.count ?? 0;

    return {
      result: facet?.items ?? [],
      meta: {
        pagination: {
          current_page: search.page,
          per_page: search.limit,
          total_pages: Math.ceil(total / search.limit),
          total,
        },
      },
    };
  }

  async findExternalJob(id: string): Promise<IExternalJobDetail> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }

    const job = await this.externalJobModel.findById(id).select(EXTERNAL_DETAIL_FIELDS).lean();

    if (!job) {
      throw new NotFoundException(`External job with ID ${id} not found`);
    }

    const source = await this.jobSourceModel
      .findOne({ key: job.sourceKey })
      .select('displayPolicy')
      .lean();
    const displayPolicy = source?.displayPolicy ?? DEFAULT_DISPLAY_POLICY;

    if (displayPolicy === EJobSourceDisplayPolicy.HIDDEN) {
      throw new NotFoundException(`External job with ID ${id} not found`);
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

  // Normalizes independently of ValidationPipe so the service is safe to call directly.
  private normalize(query: SearchJobsQueryDto): INormalizedJobSearch {
    const salaryMin = toOptionalNumber(query.salaryMin);
    const salaryMax = toOptionalNumber(query.salaryMax);

    if (salaryMin !== undefined && salaryMax !== undefined && salaryMin > salaryMax) {
      throw new BadRequestException('salaryMin must not be greater than salaryMax');
    }

    return {
      keyword: query.keyword?.trim() || undefined,
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
