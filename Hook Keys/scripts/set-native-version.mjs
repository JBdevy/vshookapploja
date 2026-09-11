import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const platform = args.get('--platform');
const versionName = args.get('--version-name');
const buildNumber = args.get('--build-number');

if (!['android', 'ios'].includes(platform)) {
  throw new Error('Use --platform android ou --platform ios.');
}
if (!/^\d+\.\d+\.\d+$/.test(versionName ?? '')) {
  throw new Error(`Versao invalida: ${versionName ?? ''}`);
}
if (!/^[1-9]\d*$/.test(buildNumber ?? '')) {
  throw new Error(`Numero de build invalido: ${buildNumber ?? ''}`);
}

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

async function updateFile(relativePath, replacements) {
  const path = fileURLToPath(new URL(relativePath, new URL('../', import.meta.url)));
  const source = await readFile(path, 'utf8');
  let updated = source;
  for (const [pattern, replacement, label] of replacements) {
    if (!pattern.test(updated)) {
      throw new Error(`Campo ${label} nao encontrado em ${relativePath}.`);
    }
    updated = updated.replace(pattern, replacement);
  }
  await writeFile(path, updated, 'utf8');
}

if (platform === 'android') {
  await updateFile('android/app/build.gradle', [
    [/versionCode\s+\d+/, `versionCode ${buildNumber}`, 'versionCode'],
    [/versionName\s+"[^"]+"/, `versionName "${versionName}"`, 'versionName'],
  ]);
} else {
  await updateFile('ios/App/App.xcodeproj/project.pbxproj', [
    [/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`, 'CURRENT_PROJECT_VERSION'],
    [/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${versionName};`, 'MARKETING_VERSION'],
  ]);
}

console.log(`Hook Keys ${platform}: versao ${versionName}, build ${buildNumber}.`);

