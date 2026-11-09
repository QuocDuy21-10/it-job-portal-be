import { BadRequestException } from '@nestjs/common';
import * as path from 'path';
import { RESUME_STORAGE_DIR, resolveResumeFilePath } from './resume-storage.util';

describe('resolveResumeFilePath', () => {
  it.each([['images/resumes/cv-1.pdf'], ['/images/resumes/cv-1.pdf'], ['cv-1.pdf']])(
    'maps %s into the private storage dir',
    url => {
      expect(resolveResumeFilePath(url)).toBe(path.join(RESUME_STORAGE_DIR, 'cv-1.pdf'));
    },
  );

  it('cannot escape the storage dir', () => {
    expect(resolveResumeFilePath('../../etc/passwd')).toBe(path.join(RESUME_STORAGE_DIR, 'passwd'));
  });

  it.each([[''], ['..'], ['.']])('rejects %p', url => {
    expect(() => resolveResumeFilePath(url)).toThrow(BadRequestException);
  });

  it('keeps the storage dir outside public/', () => {
    expect(RESUME_STORAGE_DIR).toBe(path.join(process.cwd(), 'storage', 'resumes'));
  });
});
