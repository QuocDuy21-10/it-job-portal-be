// "save time/money" is not about saving a job.
const NOT_A_SAVE_TARGET = '(?:time|money|effort|energy|thoi gian|tien|cong suc)';
const JOB_NOUN = '(?:job|jobs|viec lam|viec|vi tri|position|positions|tin tuyen dung)';
// The job noun must follow the save verb within two words: "lưu job này", "save the Backend job".
const SAVE_JOB = new RegExp(
  `\\b(?:luu|save|bookmark)\\s+(?!${NOT_A_SAVE_TARGET}\\b)(?:\\S+\\s+){0,2}?${JOB_NOUN}\\b`,
);

// shortcut: word-order regex, so "job này lưu lại giúp tôi" is missed; use an intent classifier if that shows up.
export function userWantsToSaveJob(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\bluu y\b/g, ' '); // "lưu ý" means "note", not "save"

  return SAVE_JOB.test(normalized);
}
