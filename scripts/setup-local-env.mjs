// Worktrees omit ignored files. Bootstrap local development configuration from this
// repository's primary checkout once; never overwrite a worktree's own settings.
import { copyFileSync, constants, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, '.env.local');
if (!existsSync(target)) {
  const git = spawnSync('git', ['--work-tree', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8', windowsHide: true });
  const common = git.status === 0 ? git.stdout.trim() : '';
  const source = common ? resolve(common, '..', '.env.local') : '';
  if (source && source !== target && existsSync(source)) {
    try {
      copyFileSync(source, target, constants.COPYFILE_EXCL);
      console.log('Initialized ignored .env.local from the primary checkout.');
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  } else {
    console.warn('No .env.local found. Copy .env.example to .env.local and configure server provider keys.');
  }
}
