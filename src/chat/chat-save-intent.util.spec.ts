import { userWantsToSaveJob } from './chat-save-intent.util';

describe('userWantsToSaveJob', () => {
  it.each([
    'Hãy lưu job này giúp tôi',
    'Hãy lưu job Senior Backend Engineer (Node.js/NestJS) của FPT Software',
    'Save the Backend job please',
    'bookmark this position',
    'lưu vị trí đó lại',
    'Lưu lại job này giúp mình',
  ])('is true for %s', message => {
    expect(userWantsToSaveJob(message)).toBe(true);
  });

  it.each([
    'lưu ý nhé, tôi muốn tìm job React',
    'save time',
    'Tôi muốn tìm job React ở Hà Nội',
    'Việc làm Node.js nào lương cao nhất?',
    'How can I save time finding a job?',
    'save time on job search',
    'How do I save money while looking for a job?',
    'Tôi tìm job nào để lưu kinh nghiệm?',
  ])('is false for %s', message => {
    expect(userWantsToSaveJob(message)).toBe(false);
  });
});
