// Prints the CHANGELOG.md section for a given version tag, for use as GitHub
// Release notes. Usage: node scripts/extract-changelog.mjs v1.2.3
import { readFileSync } from 'node:fs';

const tag = process.argv[2] ?? '';
const version = tag.replace(/^v/, '');

let body = '';
try {
  const lines = readFileSync('CHANGELOG.md', 'utf8').split('\n');
  const out = [];
  let capturing = false;
  for (const line of lines) {
    const header = line.match(/^##\s+\[([^\]]+)\]/);
    if (header) {
      if (capturing) break; // reached the next version section
      if (header[1] === version) {
        capturing = true;
        continue;
      }
    }
    if (capturing) out.push(line);
  }
  body = out.join('\n').trim();
} catch {
  // No changelog — fall through to the default below.
}

process.stdout.write((body || `Release ${tag}`) + '\n');
