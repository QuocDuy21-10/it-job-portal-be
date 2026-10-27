import { EJobLevel } from 'src/jobs/enums/job-level.enum';
import { IRawAtsJob } from './adapters/ats-adapter.interface';
import {
  extractSkills,
  hasRequiredFields,
  htmlToText,
  inferLevel,
  isItJob,
  isRemote,
  isVnOrRemote,
  resolveLocationCode,
  sanitizeDescription,
} from './ingestion-filters';

const HCM = 'Ho Chi Minh City, Ho Chi Minh City, Vietnam';

const buildRaw = (overrides: Partial<IRawAtsJob> = {}): IRawAtsJob => ({
  externalId: '1',
  title: 'Backend Software Engineer',
  location: HCM,
  sourceUrl: 'https://job-boards.greenhouse.io/axon/jobs/1',
  descriptionHtml: '<p>Node.js</p>',
  ...overrides,
});

describe('ingestion-filters', () => {
  describe('hasRequiredFields', () => {
    it('accepts a complete raw job', () => {
      expect(hasRequiredFields(buildRaw())).toBe(true);
    });

    it.each([{ externalId: '' }, { title: '   ' }, { sourceUrl: '' }])(
      'rejects missing field %j',
      overrides => {
        expect(hasRequiredFields(buildRaw(overrides))).toBe(false);
      },
    );
  });

  describe('isItJob', () => {
    it.each([
      ['Backend Software Engineer', true],
      ['Firmware Engineer I', true],
      ['Android Engineer I', true],
      ['DevOps Specialist', true],
      ['Principal Product Manager', false],
      ['Administrative Business Partner', false],
    ])('%s -> %s', (title, expected) => {
      expect(isItJob(title)).toBe(expected);
    });
  });

  describe('isRemote', () => {
    it('detects remote from location text', () => {
      expect(isRemote({ location: 'Remote, United States' })).toBe(true);
    });

    it('detects remote from Lever workplaceType hint', () => {
      expect(isRemote({ location: 'Singapore', isRemoteHint: true })).toBe(true);
    });

    it('returns false for onsite location', () => {
      expect(isRemote({ location: HCM })).toBe(false);
    });
  });

  describe('isVnOrRemote', () => {
    it.each([
      [{ location: HCM }, true],
      [{ location: 'Hanoi, Vietnam' }, true],
      [{ location: '', country: 'VN' }, true],
      [{ location: 'Remote' }, true],
      [{ location: 'Remote - APAC' }, true],
      [{ location: 'Remote, United States' }, false],
      [{ location: 'Singapore, Singapore', isRemoteHint: true }, false],
      [{ location: 'Singapore, Singapore' }, false],
    ])('%j -> %s', (job, expected) => {
      expect(isVnOrRemote(job)).toBe(expected);
    });
  });

  describe('resolveLocationCode', () => {
    it.each([
      [HCM, 'ho-chi-minh'],
      ['Hanoi, Vietnam', 'ha-noi'],
      ['Da Nang', 'da-nang'],
      ['Remote', 'remote'],
      ['Singapore, Singapore', undefined],
    ])('%s -> %s', (location, expected) => {
      expect(resolveLocationCode(location)).toBe(expected);
    });
  });

  describe('inferLevel', () => {
    it.each([
      ['Android Engineer I', EJobLevel.JUNIOR],
      ['Junior Frontend Developer', EJobLevel.JUNIOR],
      ['Senior Backend Engineer I', EJobLevel.SENIOR],
      ['Engineering Manager ', EJobLevel.MANAGER],
      ['Staff Software Engineer', EJobLevel.LEAD],
      ['Software Engineering Intern', EJobLevel.INTERN],
      ['Internal Tools Engineer', undefined],
      ['Software Engineer II', undefined],
    ])('%s -> %s', (title, expected) => {
      expect(inferLevel(title)).toBe(expected);
    });
  });

  describe('extractSkills', () => {
    const aliasMap = {
      java: 'Java',
      javascript: 'JavaScript',
      'node.js': 'Node.js',
      nodejs: 'Node.js',
      'c#': 'C#',
      c: 'C',
      go: 'Go',
      golang: 'Go',
    };

    it('does not match Java inside JavaScript', () => {
      expect(extractSkills('JavaScript developer', aliasMap)).toEqual(['JavaScript']);
    });

    it('matches aliases with punctuation and maps them to labels', () => {
      expect(extractSkills('Experience with Node.js, C# and Golang.', aliasMap).sort()).toEqual([
        'C#',
        'Go',
        'Node.js',
      ]);
    });

    it('skips single-character aliases', () => {
      expect(extractSkills('Write C code', aliasMap)).toEqual([]);
    });
  });

  describe('sanitizeDescription', () => {
    const dirty =
      '<div><p>Hi <a href="https://example.com">site</a></p></div>' +
      '<script>alert(1)</script>' +
      '<a href="javascript:alert(1)">bad</a>' +
      '<img src=x onerror=alert(1)>' +
      '<p style="color:red" onclick="x()">styled</p>';

    it('removes scripts, event handlers, javascript urls and disallowed tags', () => {
      const clean = sanitizeDescription(dirty);

      expect(clean).not.toContain('<script');
      expect(clean).not.toContain('alert(1)');
      expect(clean).not.toContain('javascript:');
      expect(clean).not.toContain('onerror');
      expect(clean).not.toContain('onclick');
      expect(clean).not.toContain('style=');
      expect(clean).not.toContain('<img');
      expect(clean).not.toContain('<div');
      expect(clean).toContain('<p>Hi ');
      expect(clean).toContain('<p>styled</p>');
    });

    it('forces safe rel and target on links', () => {
      const clean = sanitizeDescription('<a href="https://example.com">site</a>');

      expect(clean).toBe(
        '<a href="https://example.com" rel="noopener noreferrer nofollow" target="_blank">site</a>',
      );
    });
  });

  describe('htmlToText', () => {
    it('keeps words separated when tags are removed', () => {
      expect(htmlToText('<ul><li>React</li><li>Node.js</li></ul>')).toBe('React Node.js');
    });
  });
});
