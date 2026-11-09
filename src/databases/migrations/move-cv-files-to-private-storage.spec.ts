import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { moveDirectoryFiles } from './move-cv-files-to-private-storage';

describe('moveDirectoryFiles', () => {
  let root: string;
  let from: string;
  let to: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-move-'));
    from = path.join(root, 'public');
    to = path.join(root, 'storage');
    fs.mkdirSync(from);
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('moves files and creates the target dir', () => {
    fs.writeFileSync(path.join(from, 'a.pdf'), 'A');

    expect(moveDirectoryFiles(from, to)).toEqual({ moved: 1, conflicts: [] });
    expect(fs.readFileSync(path.join(to, 'a.pdf'), 'utf8')).toBe('A');
    expect(fs.existsSync(path.join(from, 'a.pdf'))).toBe(false);
  });

  it('is idempotent: a second run moves nothing', () => {
    fs.writeFileSync(path.join(from, 'a.pdf'), 'A');
    moveDirectoryFiles(from, to);

    expect(moveDirectoryFiles(from, to)).toEqual({ moved: 0, conflicts: [] });
  });

  it('finishes a half-done copy by removing the public source when sizes match', () => {
    fs.mkdirSync(to);
    fs.writeFileSync(path.join(from, 'a.pdf'), 'A');
    fs.writeFileSync(path.join(to, 'a.pdf'), 'A');

    expect(moveDirectoryFiles(from, to)).toEqual({ moved: 1, conflicts: [] });
    expect(fs.existsSync(path.join(from, 'a.pdf'))).toBe(false);
  });

  it('reports and keeps both files when a different file already exists at the target', () => {
    fs.mkdirSync(to);
    fs.writeFileSync(path.join(from, 'a.pdf'), 'AAA');
    fs.writeFileSync(path.join(to, 'a.pdf'), 'B');

    expect(moveDirectoryFiles(from, to)).toEqual({ moved: 0, conflicts: ['a.pdf'] });
    expect(fs.existsSync(path.join(from, 'a.pdf'))).toBe(true);
  });

  it('returns zero when the source dir does not exist', () => {
    expect(moveDirectoryFiles(path.join(root, 'missing'), to)).toEqual({
      moved: 0,
      conflicts: [],
    });
  });
});
