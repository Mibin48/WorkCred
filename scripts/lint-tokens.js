import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const roots = ['frontend/css', 'frontend/app/css'];
const files = roots.flatMap((root) => collectCss(root));
const failures = [];

for (const file of files) {
  if (file.replaceAll('\\', '/').endsWith('/tokens.css')) continue;
  const css = readFileSync(file, 'utf8');
  const hex = /#[\da-f]{3,8}\b/gi;
  for (const match of css.matchAll(hex)) failures.push(`${relative(process.cwd(), file)}: stray color ${match[0]}`);
  const fontSize = /font-size\s*:\s*([^;}]+)/gi;
  for (const match of css.matchAll(fontSize)) {
    if (!match[1].trim().startsWith('var(--text-')) failures.push(`${relative(process.cwd(), file)}: use a --text-* token instead of ${match[1].trim()}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Token lint passed (${files.length} stylesheets checked).`);
}

function collectCss(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return collectCss(file);
    return entry.isFile() && file.endsWith('.css') ? [file] : [];
  });
}
