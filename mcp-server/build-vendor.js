// Runs automatically before `npm pack`/`npm publish` (see package.json's
// "prepack" script). Copies the two files this server actually needs from
// ../extension/ into ./vendor/, so the published npm tarball is
// self-contained - it does not include the sibling extension/ folder at
// all, only whatever files this package's own "files" list names.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'extension');
const DEST = path.join(__dirname, 'vendor');

fs.mkdirSync(DEST, { recursive: true });
for (const name of ['quran-data.js', 'checker.js']) {
  fs.copyFileSync(path.join(SRC, name), path.join(DEST, name));
  console.log('vendored', name);
}
