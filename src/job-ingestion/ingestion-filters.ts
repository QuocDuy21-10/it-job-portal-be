import sanitizeHtml from 'sanitize-html';
import { EJobLevel } from 'src/jobs/enums/job-level.enum';
import { resolveLocationFromInput } from 'src/utils/location-catalog';
import { IRawAtsJob } from './adapters/ats-adapter.interface';

const IT_TITLE_PATTERN =
  /\b(engineer|engineering|developer|devops|sre|data|qa|test|software|frontend|front-end|backend|back-end|full[- ]?stack|mobile|android|ios|security|architect|machine learning|ml|ai|firmware|embedded)\b/i;
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

export const isItJob = (title: string): boolean => IT_TITLE_PATTERN.test(title);

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
