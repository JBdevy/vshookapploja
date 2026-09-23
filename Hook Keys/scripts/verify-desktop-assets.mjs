import assert from 'node:assert/strict';
import { open } from 'node:fs/promises';

const padBanks = [
  'native-engine/assets/pads/pads-1.sf2',
  'native-engine/assets/pads/pads-2.sf2',
];

for (const path of padBanks) {
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    const header = Buffer.alloc(12);
    await file.read(header, 0, header.length, 0);
    assert(stat.size > 1_000_000,
      `${path} não contém o SF2 real. Baixe os arquivos do Git LFS antes do build.`);
    assert.equal(header.subarray(0, 4).toString('ascii'), 'RIFF', `${path} não é um RIFF válido.`);
    assert.equal(header.subarray(8, 12).toString('ascii'), 'sfbk', `${path} não é um SoundFont válido.`);
  } finally {
    await file.close();
  }
}

console.log(`DESKTOP_ASSETS_OK: ${padBanks.length} bancos SF2 reais e válidos.`);
