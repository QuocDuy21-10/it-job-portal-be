import { PipelineStage } from 'mongoose';
import { EExternalJobStatus } from 'src/job-ingestion/enums/external-job-status.enum';
import { EJobFormOfWork } from 'src/jobs/enums/job-form-of-work.enum';
import { buildPublicJobVisibilityFilter } from 'src/jobs/job-visibility.util';
import { INormalizedJobSearch } from './interfaces/job-search-item.interface';
import { JobSearchSort } from './job-search.constants';

// Stages allowed inside $unionWith / $facet sub-pipelines.
type SubPipelineStage = Exclude<PipelineStage, PipelineStage.Out | PipelineStage.Merge>;

export type JobSearchPlan =
  | { target: 'internal' | 'external'; pipeline: PipelineStage[] }
  | { target: 'empty' };

// hasSalary keeps salary-less (external) jobs last in both salary directions.
const SORT_STAGES: Record<JobSearchSort, Record<string, 1 | -1>> = {
  newest: { postedAt: -1, id: 1 },
  oldest: { postedAt: 1, id: 1 },
  salary_desc: { hasSalary: -1, salary: -1, postedAt: -1, id: 1 },
  salary_asc: { hasSalary: -1, salary: 1, postedAt: -1, id: 1 },
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildKeywordRegex = (keyword: string): RegExp => new RegExp(escapeRegex(keyword), 'i');

const hasSalaryFilter = (search: INormalizedJobSearch): boolean =>
  search.salaryMin !== undefined || search.salaryMax !== undefined;

export const buildInternalStages = (
  search: INormalizedJobSearch,
  now: Date,
): SubPipelineStage[] => {
  // aggregate() bypasses the soft-delete plugin, so isDeleted must be explicit.
  const match: Record<string, any> = {
    ...buildPublicJobVisibilityFilter(now),
    isDeleted: { $ne: true },
  };

  if (search.keyword) {
    const regex = buildKeywordRegex(search.keyword);
    match.$and = [{ $or: [{ name: regex }, { skills: regex }, { 'company.name': regex }] }];
  }

  if (search.locationCode) {
    match.locationCode = search.locationCode;
  }

  if (search.level) {
    match.level = search.level;
  }

  if (search.formOfWork) {
    match.formOfWork = search.formOfWork;
  }

  if (hasSalaryFilter(search)) {
    match.salary = {
      ...(search.salaryMin !== undefined && { $gte: search.salaryMin }),
      ...(search.salaryMax !== undefined && { $lte: search.salaryMax }),
    };
  }

  return [
    { $match: match },
    {
      $project: {
        _id: 0,
        id: { $toString: '$_id' },
        sourceType: { $literal: 'INTERNAL' },
        title: '$name',
        companyName: '$company.name',
        companyLogo: '$company.logo',
        location: 1,
        locationCode: 1,
        salary: 1,
        level: 1,
        formOfWork: 1,
        skills: 1,
        isRemote: {
          $or: [
            { $eq: ['$formOfWork', EJobFormOfWork.REMOTE] },
            { $eq: ['$locationCode', 'remote'] },
          ],
        },
        postedAt: '$createdAt',
        endDate: 1,
        applyMode: { $literal: 'INTERNAL' },
        hasSalary: { $literal: 1 },
      },
    },
  ];
};

export const buildExternalStages = (search: INormalizedJobSearch): SubPipelineStage[] | null => {
  // External jobs carry no salary or form of work, so they cannot satisfy those filters.
  if (
    hasSalaryFilter(search) ||
    (search.formOfWork && search.formOfWork !== EJobFormOfWork.REMOTE)
  ) {
    return null;
  }

  const match: Record<string, any> = { status: EExternalJobStatus.ACTIVE };

  if (search.keyword) {
    const regex = buildKeywordRegex(search.keyword);
    match.$or = [{ title: regex }, { skills: regex }, { companyName: regex }];
  }

  if (search.locationCode) {
    match.locationCode = search.locationCode;
  }

  if (search.level) {
    match.level = search.level;
  }

  if (search.formOfWork === EJobFormOfWork.REMOTE) {
    match.isRemote = true;
  }

  return [
    { $match: match },
    {
      $project: {
        _id: 0,
        id: { $toString: '$_id' },
        sourceType: { $literal: 'EXTERNAL' },
        sourceKey: 1,
        title: 1,
        companyName: 1,
        location: 1,
        locationCode: 1,
        level: 1,
        skills: 1,
        salaryText: 1,
        isRemote: 1,
        applyUrl: 1,
        postedAt: { $ifNull: ['$publishedAt', '$createdAt'] },
        applyMode: { $literal: 'EXTERNAL_REDIRECT' },
        hasSalary: { $literal: 0 },
      },
    },
  ];
};

export const buildTailStages = (search: INormalizedJobSearch): PipelineStage[] => [
  { $sort: SORT_STAGES[search.sort] },
  {
    $facet: {
      items: [
        { $skip: (search.page - 1) * search.limit },
        { $limit: search.limit },
        { $project: { hasSalary: 0 } },
      ],
      total: [{ $count: 'count' }],
    },
  },
];

export const buildJobSearchPlan = (
  search: INormalizedJobSearch,
  now: Date,
  externalCollectionName: string,
): JobSearchPlan => {
  const tail = buildTailStages(search);
  const external = search.source === 'internal' ? null : buildExternalStages(search);

  if (search.source === 'external') {
    return external
      ? { target: 'external', pipeline: [...external, ...tail] }
      : { target: 'empty' };
  }

  const internal = buildInternalStages(search, now);

  if (search.source === 'all' && external) {
    return {
      target: 'internal',
      pipeline: [
        ...internal,
        { $unionWith: { coll: externalCollectionName, pipeline: external } },
        ...tail,
      ],
    };
  }

  return { target: 'internal', pipeline: [...internal, ...tail] };
};
