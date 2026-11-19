// Copies PLAN.md to the owner's Google Drive folder after each commit
// (AGENTS.md §5.6). Drive for desktop syncs the file from there.
//
// The target folder comes from GUESSHIVE_DRIVE_DIR, read from the process
// environment or from the gitignored root .env file. When it is unset or the
// folder does not exist (CI, other machines), this script does nothing.
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readDotEnv(name) {
  const file = join(root, '.env');
  if (!existsSync(file)) return undefined;
  return parseEnv(readFileSync(file, 'utf8'))[name]?.trim();
}

const target = process.env.GUESSHIVE_DRIVE_DIR ?? readDotEnv('GUESSHIVE_DRIVE_DIR');

if (target && existsSync(target)) {
  try {
    copyFileSync(join(root, 'PLAN.md'), join(target, 'PLAN.md'));
  } catch (error) {
    console.warn(`sync-drive: could not copy PLAN.md (${error.code ?? error.message})`);
  }
}
