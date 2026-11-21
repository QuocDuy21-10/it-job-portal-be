const SAVE_VERB = /\b(luu|save|bookmark)\b/;
const JOB_NOUN = /\b(job|jobs|viec lam|viec|vi tri|position|positions|tin tuyen dung)\b/;

// shortcut: "save time finding a job" also matches; replace with an intent classifier if false positives show up.
export function userWantsToSaveJob(message: string): boolean {
  const normalized = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\bluu y\b/g, ' '); // "lưu ý" means "note", not "save"

  return SAVE_VERB.test(normalized) && JOB_NOUN.test(normalized);
}
