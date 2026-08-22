import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = [
  'src/app/dashboard/page.tsx',
  'src/components/dashboard/OverviewWidgets.tsx',
];

const forbiddenPatterns = [
  /rounded-\[(22|28|32)px\]/,
  /bg-gradient-to-br/,
  /bg-\[radial-gradient/,
  /linearGradient/,
  /linear-gradient\(/,
  /#[0-9a-fA-F]{6}/,
];

const failures = [];

for (const relativePath of files) {
  const absolutePath = resolve(process.cwd(), relativePath);
  const contents = readFileSync(absolutePath, 'utf8');

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(contents)) {
      failures.push(`${relativePath} matches forbidden pattern ${pattern}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Dashboard theme coherence check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Dashboard theme coherence check passed.');
