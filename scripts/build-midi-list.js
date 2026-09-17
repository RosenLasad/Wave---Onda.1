const fs = require('fs');
const path = require('path');

const midiDir = path.resolve(__dirname, '..', 'midi');
const jsonOutput = path.join(midiDir, 'library.json');
const jsOutput = path.join(midiDir, 'library.js');

fs.mkdirSync(midiDir, { recursive: true });

const files = fs.readdirSync(midiDir, { withFileTypes: true })
  .filter(entry => entry.isFile() && /\.(mid|midi)$/i.test(entry.name))
  .map(entry => entry.name)
  .sort((a, b) => a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' }));

const pretty = (filename) => filename
  .replace(/\.(mid|midi)$/i, '')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, c => c.toUpperCase());

const items = files.map(file => ({
  file,
  title: pretty(file),
  data: fs.readFileSync(path.join(midiDir, file)).toString('base64')
}));

const generatedAt = new Date().toISOString();
const jsonManifest = { generatedAt, files: items.map(({ file, title }) => ({ file, title })) };
const embeddedManifest = { generatedAt, files: items };
fs.writeFileSync(jsonOutput, JSON.stringify(jsonManifest, null, 2) + '\n');
fs.writeFileSync(jsOutput, `window.WAVE_MIDI_LIBRARY = ${JSON.stringify(embeddedManifest)};\n`);
console.log(`Wave: indicizzati e incorporati ${files.length} file MIDI per uso online/offline.`);
