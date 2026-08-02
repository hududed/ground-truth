// Ad-hoc manual QA tool for the hadith checker - NOT part of the automated
// suite (hadith-checker.test.js already covers that). This exists so a
// human can paste arbitrary real-world text (something an AI actually said)
// and see exactly what the checker sees, without spinning up an MCP client
// or the browser extension.
//
// Usage:
//   node test/manual-check-hadith.js "The Prophet said, \"Actions are but by intentions.\" (Sahih al-Bukhari 1)"
//   echo "some text" | node test/manual-check-hadith.js

const path = require('path');

global.window = global;
require(path.join(__dirname, '../extension/hadith-data.js'));
require(path.join(__dirname, '../extension/hadith-checker.js'));

const C = global.GroundTruthHadithChecker;

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

async function main() {
  const argText = process.argv.slice(2).join(' ');
  const text = argText || (await readStdin());
  if (!text.trim()) {
    console.error('Usage: node test/manual-check-hadith.js "<text to check>"  (or pipe text via stdin)');
    process.exit(1);
  }

  console.log('--- input ---');
  console.log(text.trim());
  console.log('');

  const results = await C.checkHadithText(text);

  if (!results.length) {
    console.log('No hadith citation detected in this text.');
    return;
  }

  results.forEach((r, i) => {
    console.log(`--- citation ${i + 1} ---`);
    console.log(`raw match:       ${r.raw}`);
    console.log(`collection:      ${r.collection}`);
    console.log(`number:          ${r.number}${r.subLetter || ''}`);
    if (r.book) console.log(`book:            ${r.book}`);
    if (r.narrator) console.log(`narrator:        ${r.narrator}`);
    console.log(`existence check: ${r.status} (${r.reason})`);
    if (r.quoteCheck) {
      console.log('');
      console.log(`quoted phrase:   "${r.quoteCheck.quotedPhrase}"`);
      console.log(`wording check:   ${r.quoteCheck.status}`);
      if (r.quoteCheck.matchScore !== undefined) console.log(`match score:     ${r.quoteCheck.matchScore}`);
      console.log(`reason:          ${r.quoteCheck.reason}`);
    } else {
      console.log('');
      console.log('wording check:   no quoted phrase found nearby - nothing to verify against HadeethEnc');
    }
    console.log('');
  });
}

main();
