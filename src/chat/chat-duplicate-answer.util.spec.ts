import { isDuplicateOfPreviousAnswer } from './chat-duplicate-answer.util';

describe('isDuplicateOfPreviousAnswer', () => {
  const history = [
    { role: 'user', content: 'Node.js là gì?' },
    { role: 'assistant', content: 'Node.js là môi trường chạy JavaScript.' },
  ];

  it('is true when a different question gets the same answer back', () => {
    expect(
      isDuplicateOfPreviousAnswer(history, '🚀', ' node.js là   môi trường chạy JavaScript. '),
    ).toBe(true);
  });

  it('is false when the answer differs', () => {
    expect(isDuplicateOfPreviousAnswer(history, 'Docker là gì?', 'Docker là container.')).toBe(
      false,
    );
  });

  it('is false when the user asked the same question again', () => {
    expect(
      isDuplicateOfPreviousAnswer(
        history,
        'node.js là gì?',
        'Node.js là môi trường chạy JavaScript.',
      ),
    ).toBe(false);
  });

  it('is false without a previous assistant message', () => {
    expect(isDuplicateOfPreviousAnswer([], 'hi', 'hello')).toBe(false);
  });
});
