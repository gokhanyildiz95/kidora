import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

export default function setup() {
  // Start every run from an empty, throwaway SQLite file.
  rmSync('prisma/test.db', { force: true });
  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'ignore',
  });
}
