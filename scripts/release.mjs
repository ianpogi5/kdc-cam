// Bumps the app version for a release: updates app.json (version +
// android.versionCode) and moves the CHANGELOG "Unreleased" notes under the new
// version. It does NOT commit or tag — review, then run the printed git commands.
//
// Usage: node scripts/release.mjs 1.1.0
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node scripts/release.mjs <x.y.z>   (e.g. 1.1.0)');
  process.exit(1);
}

// app.json: set version, bump versionCode (must increase for Android updates).
const app = JSON.parse(readFileSync('app.json', 'utf8'));
app.expo.version = version;
app.expo.android ??= {};
app.expo.android.versionCode = (app.expo.android.versionCode ?? 0) + 1;
writeFileSync('app.json', JSON.stringify(app, null, 2) + '\n');

// CHANGELOG.md: insert a dated section for this version below "Unreleased".
const date = new Date().toISOString().slice(0, 10);
let changelog = readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes(`## [${version}]`)) {
  changelog = changelog.replace(
    /## \[Unreleased\]\n/,
    `## [Unreleased]\n\n## [${version}] - ${date}\n`,
  );
  writeFileSync('CHANGELOG.md', changelog);
}

console.log(`Bumped to ${version} (versionCode ${app.expo.android.versionCode}).`);
console.log('\nReview the CHANGELOG, then:');
console.log('  git add app.json CHANGELOG.md');
console.log(`  git commit -m "Release ${version}"`);
console.log(`  git tag v${version}`);
console.log(`  git push origin main v${version}`);
console.log('\nPushing the tag triggers the GitHub Action that builds + publishes the APK.');
