export const DUPLICATE_ANSWER_FLAG = 'duplicate_of_previous_answer';

const normalize = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export function isDuplicateOfPreviousAnswer(
  history: Array<{ role: string; content: string }>,
  userMessage: string,
  answer: string,
): boolean {
  const lastAssistantIndex = history.map(message => message.role).lastIndexOf('assistant');
  if (lastAssistantIndex === -1) {
    return false;
  }

  if (normalize(history[lastAssistantIndex].content) !== normalize(answer)) {
    return false;
  }

  const previousUser = history[lastAssistantIndex - 1];
  const askedSameQuestion =
    previousUser?.role === 'user' && normalize(previousUser.content) === normalize(userMessage);

  return !askedSameQuestion;
}
