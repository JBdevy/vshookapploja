import { readFileSync } from 'node:fs';

// O chunk shdr do SF2 tem registros de 46 bytes. sampleType=1 é mono;
// sampleType=2/4 indicam as duas metades de um par estéreo.
function sampleHeaders(path) {
  const file = readFileSync(path);
  if (file.toString('ascii', 0, 4) !== 'RIFF' || file.toString('ascii', 8, 12) !== 'sfbk') {
    throw new Error(`${path}: não é um SoundFont SF2`);
  }
  for (let at = 12; at + 8 <= file.length;) {
    const id = file.toString('ascii', at, at + 4);
    const size = file.readUInt32LE(at + 4);
    if (id === 'LIST' && file.toString('ascii', at + 8, at + 12) === 'pdta') {
      const end = at + 8 + size;
      for (let chunk = at + 12; chunk + 8 <= end;) {
        const childId = file.toString('ascii', chunk, chunk + 4);
        const childSize = file.readUInt32LE(chunk + 4);
        if (childId === 'shdr') {
          if (childSize % 46 !== 0) throw new Error(`${path}: shdr inválido`);
          const headers = [];
          for (let record = chunk + 8; record + 46 <= chunk + 8 + childSize; record += 46) {
            const name = file.toString('ascii', record, record + 20).replace(/\0.*$/, '');
            if (name === 'EOS') continue;
            headers.push({ name, type: file.readUInt16LE(record + 44), link: file.readUInt16LE(record + 42) });
          }
          return headers;
        }
        chunk += 8 + childSize + (childSize & 1);
      }
    }
    at += 8 + size + (size & 1);
  }
  throw new Error(`${path}: chunk shdr ausente`);
}

for (let index = 0; index < 9; index += 1) {
  const path = new URL(`../native-engine/assets/hook-b3/drawbar-${index}.sf2`, import.meta.url);
  const headers = sampleHeaders(path);
  const counts = headers.reduce((result, sample) => {
    const type = sample.type & 0x7fff;
    const kind = type === 1 ? 'mono' : type === 2 ? 'right' : type === 4 ? 'left' : type === 8 ? 'linked' : `other:${type}`;
    result[kind] = (result[kind] ?? 0) + 1;
    return result;
  }, {});
  console.log(`drawbar-${index}.sf2: ${headers.length} amostras; ${JSON.stringify(counts)}`);
}
