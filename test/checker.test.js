// Automated regression suite for the citation-checking engine (checker.js).
// Zero dependencies, plain Node assertions - run with: node test/checker.test.js
//
// This is the answer to "how do we test systematically instead of manually
// prompting an AI for a random verse and eyeballing the result": every
// citation-format variant, validity edge case, and Arabic-diff scenario this
// project has actually hit gets encoded here ONCE, and re-verified on every
// change in under a second, deterministically - no live AI, no live browser,
// no manual re-checking. New bugs found in the wild get added here as a new
// case before they get fixed, so they can never silently regress.

const fs = require('fs');
const path = require('path');

global.window = global;
require(path.join(__dirname, '../extension/quran-data.js'));
require(path.join(__dirname, '../extension/checker.js'));

const C = window.GroundTruthChecker;

let pass = 0, fail = 0;
const failures = [];

function check(label, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    failures.push({ label, error: e.message });
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error((msg || 'assertion failed') + `: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Arabic text typed directly into this test file can legally encode combining
// marks (e.g. shadda + damma on one letter) in a different order than the
// canonical dataset does, while being the exact same text - Unicode's
// canonical ordering treats both as equal, a byte-for-byte === does not. Use
// this for any assertion comparing hand-typed Arabic against data pulled
// from quran-data.js, so the test isn't fragile to how an editor/keyboard
// happened to encode a literal.
function assertArabicEqual(actual, expected, msg) {
  assertEqual(actual.normalize('NFC'), expected.normalize('NFC'), msg);
}

// ---------------------------------------------------------------------------
// 1. Reference-validity: single ayah citation formats
// ---------------------------------------------------------------------------

check('single ayah, name+colon, valid', () => {
  const r = C.checkText('The Quran says in Al-Baqarah 2:255 that Allah is the sustainer.');
  assertEqual(r.length, 1);
  assertEqual(r[0].valid, true);
  assertEqual(r[0].surah.translit, 'Al-Baqarah');
  assertEqual(r[0].ayah, 255);
});

check('single ayah, invalid (out of bounds)', () => {
  const r = C.checkText('One AI told me Quran 2:290 forbids lying.');
  assertEqual(r.length, 1);
  assertEqual(r[0].valid, false);
  if (!/does not exist/.test(r[0].reason)) throw new Error('expected an "does not exist" reason, got: ' + r[0].reason);
});

check('every result names the standard it was checked against, not a bare "trust me" claim', () => {
  const invalid = C.checkText('Quran 2:290 forbids lying.')[0];
  const valid = C.checkText('Al-Baqarah 2:255 is well known.')[0];
  if (!/Tanzil Project/.test(invalid.reason)) throw new Error('an invalid-reference reason must cite the source, not just assert non-existence: ' + invalid.reason);
  if (!valid.source || !/Tanzil Project/.test(valid.source)) throw new Error('a valid result must carry a citable source field, not just a bare claim');
});

check('single ayah, parenthetical format "Name (N:N)"', () => {
  const r = C.checkText('"And He is with you wherever you are." Surah Al-Hadid (57:4).');
  assertEqual(r.length, 1);
  assertEqual(r[0].valid, true);
  assertEqual(r[0].raw, 'Surah Al-Hadid (57:4)');
});

check('single ayah, "verse N" / "ayah N" word form', () => {
  const r = C.checkText("Surah Al-Fatihah verse 7 asks for guidance. An-Nas ayah 6 is the shortest.");
  assertEqual(r.length, 2);
  assertEqual(r[0].valid, true);
  assertEqual(r[1].valid, true);
});

check('bare "N:N" only counted near a Quran-context keyword', () => {
  const r = C.checkText('Quran 2:255 talks about the throne. A meeting at 3:45 pm, score was 4:56 nil.');
  assertEqual(r.length, 1, 'time and score patterns must not be mistaken for citations');
  assertEqual(r[0].raw, '2:255');
});

// ---------------------------------------------------------------------------
// 2. Reference-validity: verse RANGES ("94:5-6")
// ---------------------------------------------------------------------------

check('range, known surah name, both endpoints valid', () => {
  const r = C.checkText('Famous verses include Ash-Sharh (94:5-6) on hardship and ease.');
  assertEqual(r.length, 1);
  assertEqual(r[0].valid, true);
  assertEqual(r[0].ayah, 5);
  assertEqual(r[0].ayahEnd, 6);
  assertEqual(r[0].raw, 'Ash-Sharh (94:5-6)', 'the badge/insertion point must cover the FULL range, not stop mid-string');
});

check('range, known surah name, invalid end ayah', () => {
  const r = C.checkText('Al-Baqarah (2:284-290) covers various rulings.');
  assertEqual(r.length, 1);
  assertEqual(r[0].valid, false, 'ayah 290 does not exist (max 286) - both endpoints must be validated, not just the start');
});

check('range, UNRECOGNIZED surah-name spelling still detected via bare fallback', () => {
  // Regression: "Al-Duha" is not this dataset's exact translit spelling
  // ("Ad-Duhaa"), which previously caused the name-based range pattern to
  // never match at all, silently falling through to the range-UNAWARE bare
  // pattern - the citation was truncated to just the first ayah of the range.
  const r = C.checkText('Surah Al-Duha (93:5-6)');
  assertEqual(r.length, 1);
  assertEqual(r[0].valid, true);
  assertEqual(r[0].ayah, 5);
  assertEqual(r[0].ayahEnd, 6, 'both ayat of the range must be captured even when the surah name is an unrecognized spelling variant');
});

check('single ayah citation still works after adding range support (no regression)', () => {
  const r = C.checkText('Al-Fatihah 1:1 begins the book.');
  assertEqual(r.length, 1);
  assertEqual(r[0].valid, true);
  assertEqual(r[0].ayahEnd, undefined, 'a single-ayah citation must not be mistaken for a range');
});

check('multiple citations in one message, including a mid-node split (regex-order stress test)', () => {
  const r = C.checkText('Al-Hadid 57:4 is real. Also see Al-Baqarah (2:290) which is fake, and Al-Fatihah 1:1 which is real.');
  assertEqual(r.length, 3);
  assertEqual(r[0].valid, true);
  assertEqual(r[1].valid, false);
  assertEqual(r[2].valid, true);
});

check('name/number mismatch: name-derived surah disagrees with a stray adjacent number, still flagged even though ayah is in-bounds', () => {
  // The killer case: "Al-Fatihah 2:5" would previously read as fully VALID
  // (ayah 5 is genuinely in-bounds for Al-Fatihah), silently hiding that the
  // AI wrote the wrong surah name next to a number that would have been
  // correct for a DIFFERENT surah (plausibly meant Al-Baqarah 2:5 instead -
  // an entirely different verse).
  const r = C.checkText('The verse Al-Fatihah 2:5 is well known.');
  assertEqual(r.length, 1);
  assertEqual(r[0].valid, true, 'the ayah genuinely is in-bounds for the named surah - this is a warning, not an invalid reference');
  if (!r[0].nameNumberMismatch) throw new Error('expected a nameNumberMismatch to be flagged');
  assertEqual(r[0].nameNumberMismatch.statedNumber, 2);
  assertEqual(r[0].nameNumberMismatch.namedSurah, 'Al-Fatihah');
});

check('name/number mismatch: no false positive when the name and number genuinely agree', () => {
  const r = C.checkText('Al-Baqarah 2:255 is well known.');
  assertEqual(r[0].nameNumberMismatch, null);
});

check('name/number mismatch: not flagged when there is no stated number to compare (bare/verse-word forms)', () => {
  const r1 = C.checkText('Surah Al-Fatihah verse 7 asks for guidance.');
  assertEqual(r1[0].nameNumberMismatch, null);
  const r2 = C.checkText('Quran 2:255 talks about the throne.');
  assertEqual(r2[0].nameNumberMismatch, null);
});

// ---------------------------------------------------------------------------
// 3. Arabic exact-text fidelity + the maddah normalization fix
// ---------------------------------------------------------------------------

check('Arabic quote, exact match', () => {
  const r = C.checkText('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ is quoted from Al-Fatihah 1:1.');
  assertEqual(r[0].arabicCheck.verdict, 'exact');
});

check('Arabic quote missing only a stacked madda (0653) still counts as exact', () => {
  // Regression: Ad-Duhaa 93:5 canonically ends with a superscript alef (0670)
  // STACKED with a maddah-above (0653). A source that renders/copies only the
  // superscript alef and drops the maddah is a harmless typesetting variant,
  // not a textual error - the old normalizeArabic() had a gap between 0652
  // and 0670 that missed 0653, causing a false "partial" verdict here.
  const withMaddah = 'quran 93:5 says: وَلَسَوْفَ يُعْطِيكَ رَبُّكَ فَتَرْضَىٰٓ';
  const withoutMaddah = 'quran 93:5 says: وَلَسَوْفَ يُعْطِيكَ رَبُّكَ فَتَرْضَىٰ';
  assertEqual(C.checkText(withMaddah)[0].arabicCheck.verdict, 'exact');
  assertEqual(C.checkText(withoutMaddah)[0].arabicCheck.verdict, 'exact');
});

check('Arabic quote, genuine word substitution -> mismatch, with an explainable diff', () => {
  const r = C.checkText('quran 93:5 says: وَلَسَوْفَ يُعْطِيكَ الْمَلِكُ فَتَرْضَىٰ');
  assertEqual(r[0].arabicCheck.verdict, 'mismatch');
  const diff = r[0].arabicCheck.wordDiff;
  const extra = diff.find(d => d.type === 'extra');
  const missing = diff.find(d => d.type === 'missing');
  if (!extra || !missing) throw new Error('expected the diff to identify both the swapped-in and the missing word');
  assertArabicEqual(extra.word, 'الْمَلِكُ');
  assertArabicEqual(missing.word, 'رَبُّكَ');
});

check('renderWordDiffHtml produces styled spans for a real mismatch', () => {
  const r = C.checkText('quran 93:5 says: وَلَسَوْفَ يُعْطِيكَ الْمَلِكُ فَتَرْضَىٰ');
  const html = C.renderWordDiffHtml(r[0].arabicCheck.wordDiff);
  if (!html.includes('text-decoration:underline') || !html.includes('text-decoration:line-through')) {
    throw new Error('expected both an "extra" (underline) and a "missing" (strike-through) styled span');
  }
});

check('renderWordDiffHtml theme=light uses different colors than the dark default (popup.js contrast fix)', () => {
  const r = C.checkText('quran 93:5 says: وَلَسَوْفَ يُعْطِيكَ الْمَلِكُ فَتَرْضَىٰ');
  const dark = C.renderWordDiffHtml(r[0].arabicCheck.wordDiff);
  const light = C.renderWordDiffHtml(r[0].arabicCheck.wordDiff, 'light');
  if (dark === light) throw new Error('light theme must render different (higher-contrast-on-cream) colors than the dark default');
  // the two diff categories (missing vs extra) must still be visually distinct from each other in light mode
  const missingColor = light.match(/color:(#[0-9A-Fa-f]{6});text-decoration:line-through/)[1];
  const extraColor = light.match(/color:(#[0-9A-Fa-f]{6});text-decoration:underline/)[1];
  if (missingColor === extraColor) throw new Error('light theme must not use the same color for "missing" and "extra"');
});

check('citation with only an English paraphrase nearby: no auto-scored arabicCheck', () => {
  const r = C.checkText('Al-Fatihah 1:7 asks for guidance, in plain English only.');
  assertEqual(r[0].arabicCheck, null, 'must never fabricate a judgment on an English paraphrase - no single translation is canonical');
});

check('two citations in ordinary prose, only one has Arabic quoted: must not cross-attribute the quote to the OTHER citation', () => {
  // Regression: extractArabicNear used to search a flat +/-250 char window
  // from each citation's OWN position, with no idea another citation might
  // be nearby. Two citations a sentence apart is completely normal prose -
  // well within 250 chars - so Al-Fatihah's Bismillah quote here used to
  // get wrongly scored against Al-Hadid (which has NO Arabic quoted next to
  // it at all), producing a fabricated "mismatch" on a citation that should
  // show no arabicCheck whatsoever.
  const r = C.checkText('Theres a good verse in Al-Hadid 57:4 about Gods knowledge of everything. Separately, the Quran opens with بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ from Al-Fatihah 1:1.');
  assertEqual(r.length, 2);
  assertEqual(r[0].surah.translit, 'Al-Hadid');
  assertEqual(r[0].arabicCheck, null, 'Al-Hadid has no Arabic quoted near it - must not borrow a neighboring citation\'s quote');
  assertEqual(r[1].surah.translit, 'Al-Fatihah');
  assertEqual(r[1].arabicCheck.verdict, 'exact', 'the Bismillah quote must still correctly attach to the citation it actually belongs to');
});

check('a quote sitting almost exactly between two DIFFERENT citations is ambiguous - abstain on both rather than guess', () => {
  // "X is well known. <quote> is quoted from Y" places the quote 16 chars
  // from citation X's end and 16 chars from citation Y's start - an exact
  // tie. Nothing about character-counting knows "from Y" means Y, not X;
  // picking either one by iteration order would be a fabricated verdict.
  const r = C.checkText('The verse Al-Fatihah 2:5 is well known. بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ is quoted from Al-Fatihah 1:1.');
  assertEqual(r.length, 2);
  assertEqual(r[0].arabicCheck, null, 'the earlier citation must not win the tie just by being examined first');
  assertEqual(r[1].arabicCheck, null, 'the later citation is equally unproven - abstain, don\'t guess');
});

// ---------------------------------------------------------------------------
// 4. HTML-escaping (defense-in-depth for the innerHTML sinks in content.js,
// inject-selection.js, and popup.js). These test the escaping layer directly
// with a synthetic malicious value, NOT by trying to get a real regex to
// produce one - the current regexes happen to be character-class-constrained
// such that they can't capture "<", ">", "&", etc. today, but that's an
// accident of the current pattern definitions, not a guarantee. If a future
// change ever loosens a regex to accept a wider character set, these tests
// (which bypass the regex and call the rendering functions directly with a
// hostile value) are what would still catch a real vulnerability - relying
// on "the regex can't produce this" alone is exactly the kind of implicit,
// undocumented safety this project's own SECURITY.md warns against.
// ---------------------------------------------------------------------------

check('escapeHtml neutralizes the standard HTML-injection characters', () => {
  const payload = `<img src=x onerror=alert(1)>&"'`;
  const escaped = C.escapeHtml(payload);
  if (escaped.includes('<img') || escaped.includes('<') || escaped.includes('>')) {
    throw new Error('escapeHtml must neutralize angle brackets: got ' + escaped);
  }
  assertEqual(escaped, '&lt;img src=x onerror=alert(1)&gt;&amp;&quot;&#39;');
});

check('renderWordDiffHtml escapes a hostile word even if it somehow reached the diff (defense-in-depth, not regex-dependent)', () => {
  // Constructed directly, bypassing findCitations/checkText entirely, so this
  // proves the RENDERER itself is safe - not that the current extractor
  // happens not to produce dangerous input.
  const hostileDiff = [
    { type: 'extra', word: '<img src=x onerror=alert(1)>' },
    { type: 'missing', word: 'رَبُّكَ' },
  ];
  const html = C.renderWordDiffHtml(hostileDiff);
  if (html.includes('<img')) throw new Error('a raw <img> tag reached the rendered HTML - the renderer must escape every word, not trust its caller');
  if (!html.includes('&lt;img')) throw new Error('expected the payload to appear escaped (&lt;img...) in the output');
});

// ---------------------------------------------------------------------------
// 5. No false positives on ordinary text
// ---------------------------------------------------------------------------

check('ordinary text with no citation produces zero results', () => {
  const r = C.checkText('This is just a normal sentence about hardship and ease, no reference at all.');
  assertEqual(r.length, 0);
});

// ---------------------------------------------------------------------------
// 6. Input-size guard (the MCP server calls checkText directly, with no
// pre-filter of its own - unlike content.js, which never lets a pathological
// page reach checkText in the first place. This guard is the only thing
// standing between an MCP client handing over an unbounded string and
// unbounded work, so it has to live in checkText itself, not just the extension.
// ---------------------------------------------------------------------------

check('checkText throws a distinct, named error over the length limit, not a silent empty result', () => {
  const tooLong = 'x'.repeat(C.MAX_TEXT_LENGTH + 1);
  let threw = null;
  try { C.checkText(tooLong); } catch (e) { threw = e; }
  if (!threw) throw new Error('expected checkText to throw on oversized input, it returned normally instead');
  if (!(threw instanceof C.TextTooLongError)) throw new Error('expected a TextTooLongError specifically, got: ' + threw.constructor.name);
  assertEqual(threw.length, C.MAX_TEXT_LENGTH + 1);
});

check('checkText does not throw at exactly the length limit', () => {
  const atLimit = 'x'.repeat(C.MAX_TEXT_LENGTH);
  const r = C.checkText(atLimit); // must not throw
  assertEqual(r.length, 0, 'no citation in a page of x characters, but the call itself must succeed');
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\n${pass} passed, ${fail} failed (${pass + fail} total)`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  - ${f.label}\n      ${f.error}`);
  process.exit(1);
}
