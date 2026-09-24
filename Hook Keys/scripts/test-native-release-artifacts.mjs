import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../../.github/workflows/hook-keys-release.yml', import.meta.url), 'utf8');
const release = workflow.slice(workflow.indexOf('\n  release:'));
assert(release.startsWith('\n  release:'), 'release job exists');
const downloads = [...release.matchAll(/uses: actions\/download-artifact@v4\s+with:\s+name: ([^\r\n]+)\s+path: release-assets/g)].map(match => match[1]);
assert.deepEqual(downloads, ['Bronze-Keys-Android', 'Bronze-Keys-iOS']);
assert.doesNotMatch(release, /pattern:|merge-multiple:/, 'diagnostics must not be selected by a wildcard');
assert.match(workflow, /name: Bronze-Keys-iOS-diagnostics/);
assert.match(release, /FILE_COUNT[^\n]+find release-assets -type f/);
assert.match(release, /\[ "\$FILE_COUNT" != '3' \]/, 'keep the strict three-file guard');

// Simulate the mixed set which failed in Actions, including future extra artifacts.
const artifacts = new Map([
  ['Bronze-Keys-Android', ['Bronze Keys.apk', 'Bronze Keys.aab']],
  ['Bronze-Keys-iOS', ['Bronze Keys.ipa']],
  ['Bronze-Keys-iOS-diagnostics', ['Bronze-Keys.xcarchive/dSYMs/App', 'Bronze-Keys-archive.xcresult/Info.plist']],
  ['Bronze-Keys-future-report', ['report.json']],
]);
assert.deepEqual(downloads.flatMap(name => artifacts.get(name)), ['Bronze Keys.apk', 'Bronze Keys.aab', 'Bronze Keys.ipa']);
console.log('NATIVE_RELEASE_ARTIFACTS_OK: APK/AAB/IPA somente; diagnósticos permanecem nos artifacts do Actions.');
