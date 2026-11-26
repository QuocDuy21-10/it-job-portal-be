export const LEGAL_PAGES = ['terms', 'privacy'] as const;
export type LegalPageKey = (typeof LEGAL_PAGES)[number];

export const LEGAL_LOCALES = ['vi', 'en'] as const;
export type LegalLocale = (typeof LEGAL_LOCALES)[number];

// Vietnamese text of this length stays under Express's 100 KB JSON body limit.
export const LEGAL_CONTENT_MAX_LENGTH = 50_000;

// More slides make the hero heavier and the carousel too long to follow.
export const MAX_ACTIVE_SLIDES = 5;

export const BANNER_FILE_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

// A site path ("/viec-lam", but not "//host") or an https URL.
export const CTA_URL_PATTERN = /^(?:\/(?!\/)\S*|https:\/\/[^\s/]+\S*)$/;
