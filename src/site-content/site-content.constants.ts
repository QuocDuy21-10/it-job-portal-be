export const LEGAL_PAGES = ['terms', 'privacy'] as const;
export type LegalPageKey = (typeof LEGAL_PAGES)[number];

export const LEGAL_LOCALES = ['vi', 'en'] as const;
export type LegalLocale = (typeof LEGAL_LOCALES)[number];

// Vietnamese text of this length stays under Express's 100 KB JSON body limit.
export const LEGAL_CONTENT_MAX_LENGTH = 50_000;
