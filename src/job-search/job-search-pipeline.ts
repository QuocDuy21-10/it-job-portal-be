import { PipelineStage } from 'mongoose';
import { VISIBLE_EXTERNAL_JOB_STATUSES } from 'src/job-ingestion/job-ingestion.constants';
import { EJobFormOfWork } from 'src/jobs/enums/job-form-of-work.enum';
import { buildPublicJobVisibilityFilter } from 'src/jobs/job-visibility.util';
import { INormalizedJobSearch } from './interfaces/job-search-item.interface';
import { JobSearchSort } from './job-search.constants';

// Stages allowed inside $unionWith sub-pipelines.
type SubPipelineStage = Exclude<PipelineStage, PipelineStage.Out | PipelineStage.Merge>;

type Match = Record<string, any>;

export type JobSearchPlan =
  | {
      target: 'internal' | 'external';
      pipeline: PipelineStage[];
      // What to count for the total; null when the plan leaves that collection out.
      internalMatch: Match | null;
      externalMatch: Match | null;
    }
  | { target: 'empty' };

// hasSalary keeps salary-less (external) jobs last in both salary directions.
const SORT_STAGES: Record<JobSearchSort, Record<string, 1 | -1>> = {
  newest: { postedAt: -1, id: 1 },
  oldest: { postedAt: 1, id: 1 },
  salary_desc: { hasSalary: -1, salary: -1, postedAt: -1, id: 1 },
  salary_asc: { hasSalary: -1, salary: 1, postedAt: -1, id: 1 },
};

// The same orders on stored fields, so a branch can use an index and stop after page * limit rows.
// _id orders like the hex id of SORT_STAGES.
const INTERNAL_SORT_STAGES: Record<JobSearchSort, Record<string, 1 | -1>> = {
  newest: { createdAt: -1, _id: 1 },
  oldest: { createdAt: 1, _id: 1 },
  salary_desc: { salary: -1, createdAt: -1, _id: 1 },
  salary_asc: { salary: 1, createdAt: -1, _id: 1 },
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildKeywordRegex = (keyword: string): RegExp => new RegExp(escapeRegex(keyword), 'i');

// Exact tag match, so "Java" does not return JavaScript jobs.
const buildSkillRegex = (skill: string): RegExp => new RegExp(`^${escapeRegex(skill)}$`, 'i');

const hasSalaryFilter = (search: INormalizedJobSearch): boolean =>
  search.salaryMin !== undefined || search.salaryMax !== undefined;

const rowsToKeep = (search: INormalizedJobSearch): number => search.page * search.limit;

export const buildInternalMatch = (search: INormalizedJobSearch, now: Date): Match => {
  // aggregate() bypasses the soft-delete plugin, so isDeleted must be explicit.
  const match: Match = {
    ...buildPublicJobVisibilityFilter(now),
    isDeleted: { $ne: true },
  };

  if (search.keyword) {
    const regex = buildKeywordRegex(search.keyword);
    match.$and = [{ $or: [{ name: regex }, { skills: regex }, { 'company.name': regex }] }];
  }

  if (search.skills) {
    match.skills = buildSkillRegex(search.skills);
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

  return match;
};

export const buildInternalStages = (
  search: INormalizedJobSearch,
  match: Match,
): SubPipelineStage[] => [
  { $match: match },
  { $sort: INTERNAL_SORT_STAGES[search.sort] },
  { $limit: rowsToKeep(search) },
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

export const buildExternalMatch = (
  search: INormalizedJobSearch,
  now: Date,
  hiddenSourceKeys: string[],
): Match | null => {
  // External jobs carry no salary or form of work, so they cannot satisfy those filters.
  if (
    hasSalaryFilter(search) ||
    (search.formOfWork && search.formOfWork !== EJobFormOfWork.REMOTE)
  ) {
    return null;
  }

  // Expiry is checked here too, so a job past expiresAt disappears before the next sync closes it.
  const conditions: Record<string, any>[] = [
    { $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }] },
  ];

  if (search.keyword) {
    const regex = buildKeywordRegex(search.keyword);
    conditions.push({ $or: [{ title: regex }, { skills: regex }, { companyName: regex }] });
  }

  const match: Match = {
    status: { $in: VISIBLE_EXTERNAL_JOB_STATUSES },
    $and: conditions,
  };

  if (search.skills) {
    match.skills = buildSkillRegex(search.skills);
  }

  if (hiddenSourceKeys.length > 0) {
    match.sourceKey = { $nin: hiddenSourceKeys };
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

  return match;
};

// postedAt is publishedAt, or createdAt when there is none. One branch per case keeps both sorts on
// stored fields; external jobs have no salary, so the salary sorts order them by newest.
export const buildExternalStages = (
  search: INormalizedJobSearch,
  match: Match,
): SubPipelineStage[][] => {
  const direction = search.sort === 'oldest' ? 1 : -1;

  return [
    buildExternalBranch(
      search,
      { ...match, publishedAt: { $ne: null } },
      { publishedAt: direction },
    ),
    buildExternalBranch(search, { ...match, publishedAt: null }, { createdAt: direction }),
  ];
};

const buildExternalBranch = (
  search: INormalizedJobSearch,
  match: Match,
  sort: Record<string, 1 | -1>,
): SubPipelineStage[] => [
  { $match: match },
  { $sort: { ...sort, _id: 1 } },
  { $limit: rowsToKeep(search) },
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

export const buildTailStages = (search: INormalizedJobSearch): PipelineStage[] => [
  { $sort: SORT_STAGES[search.sort] },
  { $skip: (search.page - 1) * search.limit },
  { $limit: search.limit },
  { $project: { hasSalary: 0 } },
];

export const buildJobSearchPlan = (
  search: INormalizedJobSearch,
  now: Date,
  externalCollectionName: string,
  hiddenSourceKeys: string[],
): JobSearchPlan => {
  const internalMatch = search.source === 'external' ? null : buildInternalMatch(search, now);
  const externalMatch =
    search.source === 'internal' ? null : buildExternalMatch(search, now, hiddenSourceKeys);
  const branches = [
    ...(internalMatch ? [buildInternalStages(search, internalMatch)] : []),
    ...(externalMatch ? buildExternalStages(search, externalMatch) : []),
  ];

  if (branches.length === 0) {
    return { target: 'empty' };
  }

  // Every branch after the first reads the external collection.
  const [first, ...rest] = branches;

  return {
    target: internalMatch ? 'internal' : 'external',
    pipeline: [
      ...first,
      ...rest.map(pipeline => ({ $unionWith: { coll: externalCollectionName, pipeline } })),
      ...buildTailStages(search),
    ],
    internalMatch,
    externalMatch,
  };
};
