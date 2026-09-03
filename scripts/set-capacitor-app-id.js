const fs = require('fs');
const path = require('path');

const appId = String(process.argv[2] || '').trim();
if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(appId)) {
  console.error(`appId inválido: ${appId || '(vazio)'}`);
  process.exit(1);
}

const configPath = path.resolve(__dirname, '..', 'capacitor.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.appId = appId;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(`Capacitor appId configurado: ${appId}`);
