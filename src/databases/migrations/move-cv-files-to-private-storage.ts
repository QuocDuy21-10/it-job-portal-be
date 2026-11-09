import * as fs from 'fs';
import * as path from 'path';

const MOVES = [
  {
    from: path.join(process.cwd(), 'public', 'images', 'resumes'),
    to: path.join(process.cwd(), 'storage', 'resumes'),
  },
  {
    from: path.join(process.cwd(), 'public', 'images', 'cv'),
    to: path.join(process.cwd(), 'storage', 'cv'),
  },
];

/**
 * Copy then unlink (not rename): in production `public/images` and `storage` are separate
 * Docker volumes, and rename across filesystems fails with EXDEV.
 */
export function moveDirectoryFiles(
  from: string,
  to: string,
): { moved: number; conflicts: string[] } {
  const conflicts: string[] = [];
  let moved = 0;

  if (!fs.existsSync(from)) return { moved, conflicts };
  fs.mkdirSync(to, { recursive: true });

  for (const name of fs.readdirSync(from)) {
    const source = path.join(from, name);
    const target = path.join(to, name);
    if (!fs.statSync(source).isFile()) continue;

    if (fs.existsSync(target)) {
      if (fs.statSync(target).size !== fs.statSync(source).size) {
        conflicts.push(name);
        continue;
      }
    } else {
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    }

    fs.unlinkSync(source);
    moved++;
  }

  return { moved, conflicts };
}

if (require.main === module) {
  let hasConflicts = false;
  for (const { from, to } of MOVES) {
    const { moved, conflicts } = moveDirectoryFiles(from, to);
    console.log(`${from} -> ${to}: moved ${moved}, conflicts ${conflicts.length}`);
    for (const name of conflicts) console.warn(`  conflict (left in place): ${name}`);
    hasConflicts ||= conflicts.length > 0;
  }
  process.exit(hasConflicts ? 1 : 0);
}
