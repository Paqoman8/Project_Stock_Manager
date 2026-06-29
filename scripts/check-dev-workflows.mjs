import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const root = process.cwd();
const packageJsonPath = resolve(root, 'package.json');
const makefilePath = resolve(root, 'Makefile');
const readmePath = resolve(root, 'README.md');

assert(existsSync(packageJsonPath), 'Root package.json is missing');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
assert(packageJson.scripts?.dev, 'Root package.json must expose npm run dev');
assert(packageJson.scripts?.['dev:db'], 'Root package.json must expose npm run dev:db');
assert(packageJson.scripts?.['dev:backend'], 'Root package.json must expose npm run dev:backend');
assert(packageJson.scripts?.['dev:frontend'], 'Root package.json must expose npm run dev:frontend');
assert(Array.isArray(packageJson.workspaces), 'Root package.json must define npm workspaces');
assert(packageJson.workspaces.includes('backend'), 'Root workspaces must include backend');
assert(packageJson.workspaces.includes('frontend'), 'Root workspaces must include frontend');

const frontendPackageJson = JSON.parse(readFileSync(resolve(root, 'frontend/package.json'), 'utf8'));
assert(
  typeof frontendPackageJson.scripts?.dev === 'string' &&
    frontendPackageJson.scripts.dev.includes('--webpack'),
  'Frontend dev script must force webpack mode for stable local development',
);

const nextConfig = readFileSync(resolve(root, 'frontend/next.config.ts'), 'utf8');
assert(
  nextConfig.includes('turbopack') && nextConfig.includes('root'),
  'frontend/next.config.ts must set turbopack.root explicitly',
);

const makefile = readFileSync(makefilePath, 'utf8');
assert(makefile.includes('## dev'), 'Makefile must document a dev target');
assert(makefile.includes('## dev-db'), 'Makefile must document a dev-db target');

const readme = readFileSync(readmePath, 'utf8');
assert(readme.includes('npm run dev'), 'README must document the local npm run dev flow');

console.log('Dev workflow check passed.');
