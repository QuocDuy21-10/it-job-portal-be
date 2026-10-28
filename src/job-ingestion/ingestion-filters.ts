import { decode, escape } from 'he';
import sanitizeHtml from 'sanitize-html';
import { EJobLevel } from 'src/jobs/enums/job-level.enum';
import { resolveLocationFromInput } from 'src/utils/location-catalog';
import { IRawAtsJob } from './adapters/ats-adapter.interface';

const IT_TITLE_PATTERN =
  /\b(engineer|engineering|developer|devops|sre|data|qa|test|software|frontend|front-end|backend|back-end|full[- ]?stack|mobile|android|ios|security|architect|machine learning|ml|ai|firmware|embedded)\b/i;
const IT_TITLE_PATTERN_VI =
  /lập trình|phần mềm|kiểm thử|dữ liệu|quản trị mạng|an ninh mạng|bảo mật|công nghệ thông tin|\bcntt\b/iu;
// Tokens are matched against whole slug segments so "ba" in "ba-ria" never counts.
const IT_SLUG_KEYWORDS = [
  'engineer',
  'developer',
  'devops',
  'devsecops',
  'sre',
  'tester',
  'qa',
  'software',
  'frontend',
  'backend',
  'fullstack',
  'full-stack',
  'java',
  'python',
  'golang',
  'php',
  'nodejs',
  'react',
  'android',
  'ios',
  'flutter',
  'blockchain',
  'it',
  'ai',
  'ml',
  'machine-learning',
  'data-engineer',
  'data-analyst',
  'data-scientist',
  'cloud',
  'automation',
  'embedded',
  'firmware',
  'game',
  'unity',
  'dotnet',
  'net',
  'sap',
  'erp',
  'business-analyst',
  'lap-trinh',
  'phan-mem',
  'kiem-thu',
  'cntt',
  'cong-nghe-thong-tin',
  'bao-mat',
  'an-ninh-mang',
  'quan-tri-mang',
  'he-thong',
];
const IT_SLUG_PATTERN = new RegExp(`(?:^|-)(?:${IT_SLUG_KEYWORDS.join('|')})(?:-|$)`);
const EXCERPT_LENGTH = 300;
const VN_LOCATION_PATTERN = /viet ?nam|ho chi minh|hcmc|saigon|ha ?noi|da ?nang/i;
const REMOTE_PATTERN = /remote/i;
const REMOTE_ONLY_PATTERN = /^\s*remote\s*$/i;
const REMOTE_REGION_PATTERN = /apac|asia|worldwide|anywhere|global/i;
const MIN_SKILL_ALIAS_LENGTH = 2;

// Order matters: the first matching rule wins.
const LEVEL_RULES: Array<[RegExp, EJobLevel]> = [
  [/\bmanager\b/i, EJobLevel.MANAGER],
  [/\b(lead|principal|staff)\b/i, EJobLevel.LEAD],
  [/\b(senior|sr)\b/i, EJobLevel.SENIOR],
  [/\bintern(ship)?\b/i, EJobLevel.INTERN],
  [/\bjunior\b/i, EJobLevel.JUNIOR],
  [/\bI$/, EJobLevel.JUNIOR],
];

const ALLOWED_DESCRIPTION_TAGS = [
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'strong',
  'b',
  'em',
  'i',
  'h2',
  'h3',
  'h4',
  'a',
];

export const hasRequiredFields = (raw: IRawAtsJob): boolean =>
  [raw.externalId, raw.title, raw.sourceUrl].every(value => Boolean(value?.trim()));

export const isItJob = (title: string): boolean => {
  const normalizedTitle = title.normalize('NFC');
  return IT_TITLE_PATTERN.test(normalizedTitle) || IT_TITLE_PATTERN_VI.test(normalizedTitle);
};

// shortcut: slug includes company name, so this over-matches; title filter in syncSource is the real gate
export const isLikelyItSlug = (slug: string): boolean => IT_SLUG_PATTERN.test(slug);

export const isRemote = (job: Pick<IRawAtsJob, 'location' | 'isRemoteHint'>): boolean =>
  Boolean(job.isRemoteHint) || REMOTE_PATTERN.test(job.location);

export const isVnOrRemote = (
  job: Pick<IRawAtsJob, 'location' | 'country' | 'isRemoteHint'>,
): boolean => {
  if (job.country === 'VN' || VN_LOCATION_PATTERN.test(job.location)) {
    return true;
  }

  if (!isRemote(job)) {
    return false;
  }

  return REMOTE_ONLY_PATTERN.test(job.location) || REMOTE_REGION_PATTERN.test(job.location);
};

export const resolveLocationCode = (location: string): string | undefined => {
  for (const part of location.split(',')) {
    const match = resolveLocationFromInput(part.trim());

    if (match) {
      return match.code;
    }
  }

  return undefined;
};

export const inferLevel = (title: string): EJobLevel | undefined => {
  const trimmedTitle = title.trim();
  return LEVEL_RULES.find(([pattern]) => pattern.test(trimmedTitle))?.[1];
};

export const levelFromExperience = (months?: number): EJobLevel | undefined => {
  if (months === undefined || !Number.isFinite(months) || months < 0) {
    return undefined;
  }

  if (months < 12) {
    return EJobLevel.JUNIOR;
  }

  if (months < 36) {
    return EJobLevel.MID_LEVEL;
  }

  return months < 60 ? EJobLevel.SENIOR : EJobLevel.LEAD;
};

const toAmount = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return typeof value === 'string' && /^\d+(\.\d+)?$/.test(value.trim())
    ? Number(value)
    : undefined;
};

export const formatSalaryText = (baseSalary: unknown): string | undefined => {
  const salary = baseSalary as { currency?: unknown; value?: Record<string, unknown> } | null;
  const value = salary?.value;
  const currency =
    typeof salary?.currency === 'string' && salary.currency.trim() ? salary.currency.trim() : 'VND';
  const formatNumber = (amount: number) => new Intl.NumberFormat('vi-VN').format(amount);
  const min = toAmount(value?.minValue);
  const max = toAmount(value?.maxValue);

  if (min !== undefined && max !== undefined) {
    return `${formatNumber(min)} – ${formatNumber(max)} ${currency}`;
  }

  if (min !== undefined) {
    return `Từ ${formatNumber(min)} ${currency}`;
  }

  if (max !== undefined) {
    return `Đến ${formatNumber(max)} ${currency}`;
  }

  const single = toAmount(value?.value);

  if (single !== undefined) {
    return `${formatNumber(single)} ${currency}`;
  }

  return typeof value?.value === 'string' && value.value.trim() ? value.value.trim() : undefined;
};

const normalizeSkillText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^\w\s+#.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const extractSkills = (text: string, aliasMap: Record<string, string>): string[] => {
  const haystack = normalizeSkillText(text);
  const found = new Set<string>();

  for (const [alias, label] of Object.entries(aliasMap)) {
    // shortcut: alias matching misfires on short/common words (Go, R); upgrade to curated per-skill patterns if precision matters
    if (alias.length < MIN_SKILL_ALIAS_LENGTH || found.has(label)) {
      continue;
    }

    const pattern = new RegExp(`(?<![\\w+#.])${escapeRegExp(alias)}(?![\\w+#])`);

    if (pattern.test(haystack)) {
      found.add(label);
    }
  }

  return [...found];
};

// Same normalization as SkillsService.normalizeForLookup, which builds the alias map keys.
const normalizeSkillKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s+#.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const mapSkillsToCatalog = (
  rawSkills: string[],
  aliasMap: Record<string, string>,
): string[] => [
  ...new Set(
    rawSkills
      .map(skill => aliasMap[normalizeSkillKey(skill)])
      .filter((label): label is string => Boolean(label)),
  ),
];

export const sanitizeDescription = (html: string): string =>
  sanitizeHtml(html, {
    allowedTags: ALLOWED_DESCRIPTION_TAGS,
    allowedAttributes: { a: ['href', 'rel', 'target'] },
    allowedSchemes: ['http', 'https'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer nofollow',
        target: '_blank',
      }),
    },
  });

// Only for skill matching on already-sanitized HTML, never for rendering.
export const htmlToText = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const buildExcerpt = (html: string, maxLength = EXCERPT_LENGTH): string => {
  const text = decode(htmlToText(html)).replace(/\s+/g, ' ').trim();

  if (!text) {
    return '';
  }

  const excerpt =
    text.length > maxLength ? `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}…` : text;
  return `<p>${escape(excerpt)}</p>`;
};
