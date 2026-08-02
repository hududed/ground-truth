// Automated regression suite for the hadith citation engine
// (hadith-checker.js). Plain Node assertions - run with:
// node test/hadith-checker.test.js (needs network access for the
// quoted-phrase section; everything else runs offline).
//
// Mirrors checker.test.js's own discipline exactly: one test per format
// variant, real edge cases, and false-positive guards against text that
// LOOKS like a hadith citation but isn't - not just happy-path coverage.
//
// SCOPE: citation DETECTION (findHadithCitations) is fully tested here.
// checkHadithText()'s collection+number reference check is still an
// explicit "not_yet_available" STUB - that requires sunnah.com/dorar.net
// data access, which this project does not have yet. What IS real and
// tested here: quoted-phrase verification against hadeethenc.com's public
// search API (section 6b) - a genuinely different, narrower question ("does
// this wording exist anywhere") than the still-stubbed one ("is this
// specifically hadith #N in this collection"). See the README's Roadmap
// section for the fuller status.

const path = require('path');

global.window = global;
require(path.join(__dirname, '../extension/hadith-data.js'));
require(path.join(__dirname, '../extension/hadith-checker.js'));

const C = window.GroundTruthHadithChecker;

let pass = 0, fail = 0;
const failures = [];
const pending = []; // check() queues async work here; run() awaits it all in order at the end

// Async-aware by design: checkHadithText now makes a real network call when
// a quote is found nearby, so a synchronous try/catch around it would never
// see a rejected promise. check() always awaits fn() (a plain synchronous
// fn() resolves immediately, so this costs nothing for the majority of
// tests that don't touch the network) - queued here rather than awaited
// immediately at each call site, so a single `node test.js` run stays a
// flat list of check(...) calls in file order, exactly like every other
// test file in this project, with the async plumbing isolated to run().
function check(label, fn) {
  pending.push(async () => {
    try {
      await fn();
      pass++;
    } catch (e) {
      fail++;
      failures.push({ label, error: e.message });
    }
  });
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error((msg || 'assertion failed') + `: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ---------------------------------------------------------------------------
// 1. Real-world format variants
// ---------------------------------------------------------------------------

check('plain "Collection N" form: "Sahih al-Bukhari 1234"', () => {
  const r = C.findHadithCitations('The Prophet said this, per Sahih al-Bukhari 1234.');
  assertEqual(r.length, 1);
  assertEqual(r[0].collectionId, 'bukhari');
  assertEqual(r[0].collection, 'Bukhari');
  assertEqual(r[0].number, 1234);
  assertEqual(r[0].book, undefined, 'no book number in this form');
  assertEqual(r[0].subLetter, undefined, 'no sub-hadith letter in this form');
});

check('"Book N, Hadith M" form: "Sunan Abu Dawud, Book 3, Hadith 45"', () => {
  const r = C.findHadithCitations('See Sunan Abu Dawud, Book 3, Hadith 45 for details.');
  assertEqual(r.length, 1);
  assertEqual(r[0].collectionId, 'abudawud');
  assertEqual(r[0].collection, 'Abu Dawud');
  assertEqual(r[0].book, 3);
  assertEqual(r[0].number, 45);
  assertEqual(r[0].raw, 'Sunan Abu Dawud, Book 3, Hadith 45', 'the raw span must cover the full book+hadith citation, not just a fragment');
});

check('lettered sub-hadith suffix: "Muslim 2564a"', () => {
  const r = C.findHadithCitations('This is narrated in Muslim 2564a.');
  assertEqual(r.length, 1);
  assertEqual(r[0].collectionId, 'muslim');
  assertEqual(r[0].number, 2564);
  assertEqual(r[0].subLetter, 'a');
});

check('narrator format: "narrated by Abu Hurairah, [collection]..." - narrator captured, not used for existence', () => {
  const r = C.findHadithCitations('It was narrated by Abu Hurairah that the Prophet said something, per Sahih al-Bukhari 5678.');
  assertEqual(r.length, 1);
  assertEqual(r[0].narrator, 'Abu Hurairah');
  assertEqual(r[0].collectionId, 'bukhari');
  assertEqual(r[0].number, 5678);
});

// ---------------------------------------------------------------------------
// 2. All six canonical collections (Kutub al-Sittah), common spelling variants
// ---------------------------------------------------------------------------

check('Bukhari: recognized via "Sahih al-Bukhari", "Al-Bukhari", and bare "Bukhari"', () => {
  assertEqual(C.findHadithCitations('Sahih al-Bukhari 1')[0].collectionId, 'bukhari');
  assertEqual(C.findHadithCitations('Al-Bukhari 1')[0].collectionId, 'bukhari');
  assertEqual(C.findHadithCitations('Bukhari 1')[0].collectionId, 'bukhari');
});

check('Muslim: recognized via "Sahih Muslim" and bare "Muslim"', () => {
  assertEqual(C.findHadithCitations('Sahih Muslim 1')[0].collectionId, 'muslim');
  assertEqual(C.findHadithCitations('Muslim 1')[0].collectionId, 'muslim');
});

check('Abu Dawud: recognized via "Sunan Abu Dawud" and the alternate transliteration "Abu Dawood"', () => {
  assertEqual(C.findHadithCitations('Sunan Abu Dawud 1')[0].collectionId, 'abudawud');
  assertEqual(C.findHadithCitations('Abu Dawood 1')[0].collectionId, 'abudawud');
});

check("Tirmidhi: recognized via \"Jami' at-Tirmidhi\" (straight apostrophe) and bare \"Tirmidhi\"", () => {
  assertEqual(C.findHadithCitations("Jami' at-Tirmidhi 1")[0].collectionId, 'tirmidhi');
  assertEqual(C.findHadithCitations('Tirmidhi 1')[0].collectionId, 'tirmidhi');
});

check('Tirmidhi: curly-apostrophe variant "Jami’ at-Tirmidhi" also recognized (AI chat UIs auto-curl quotes)', () => {
  assertEqual(C.findHadithCitations('Jami’ at-Tirmidhi 1')[0].collectionId, 'tirmidhi');
});

check("An-Nasa'i: recognized with AND without the apostrophe (\"An-Nasa'i\" vs \"An-Nasai\")", () => {
  assertEqual(C.findHadithCitations("An-Nasa'i 1")[0].collectionId, 'nasai');
  assertEqual(C.findHadithCitations('An-Nasai 1')[0].collectionId, 'nasai');
  assertEqual(C.findHadithCitations("An-Nasa'i 1")[0].collection, "An-Nasa'i", 'the display name is always the canonical spelling regardless of which input variant matched');
});

check('Ibn Majah: recognized via "Sunan Ibn Majah" and bare "Ibn Majah"', () => {
  assertEqual(C.findHadithCitations('Sunan Ibn Majah 1')[0].collectionId, 'ibnmajah');
  assertEqual(C.findHadithCitations('Ibn Majah 1')[0].collectionId, 'ibnmajah');
});

// ---------------------------------------------------------------------------
// 3. Keyword-number variants ("Hadith N", "No. N", "#N", combined "Hadith no. N")
// ---------------------------------------------------------------------------

check('keyword form "Collection, Hadith N"', () => {
  const r = C.findHadithCitations('Sahih Muslim, Hadith 45 is well known.');
  assertEqual(r.length, 1);
  assertEqual(r[0].number, 45);
});

check('combined keyword form "Collection, Hadith no. N" (regression: "Hadith" and "no." must compose, not just match alone)', () => {
  // Regression: an earlier version of keywordNumberRe only recognized ONE
  // of "Hadith" / "No." as the keyword, never both together - "Hadith no."
  // failed to match at all, because after consuming "Hadith" the regex
  // expected a digit next and instead found "no.", which isn't a digit.
  const r = C.findHadithCitations('Tirmidhi, Hadith no. 3956 discusses this.');
  assertEqual(r.length, 1);
  assertEqual(r[0].collectionId, 'tirmidhi');
  assertEqual(r[0].number, 3956);
});

check('hash form "Collection #N"', () => {
  const r = C.findHadithCitations('Bukhari #7 is a famous hadith.');
  assertEqual(r.length, 1);
  assertEqual(r[0].number, 7);
});

check('case-insensitive: lowercase "sahih al-bukhari 1234" still recognized', () => {
  const r = C.findHadithCitations('sahih al-bukhari 1234 is often cited.');
  assertEqual(r.length, 1);
  assertEqual(r[0].collectionId, 'bukhari');
  assertEqual(r[0].collection, 'Bukhari', 'the display name is always canonically-cased, regardless of input casing');
});

// ---------------------------------------------------------------------------
// 4. Multiple citations / narrator variants / edge cases
// ---------------------------------------------------------------------------

check('multiple citations in one message, correctly separated and ordered', () => {
  const r = C.findHadithCitations('Sunan an-Nasa\'i 1500 and An-Nasai 1600 and Sunan Ibn Majah, Book 1, Hadith 1.');
  assertEqual(r.length, 3);
  assertEqual(r[0].number, 1500);
  assertEqual(r[1].number, 1600);
  assertEqual(r[2].collectionId, 'ibnmajah');
  assertEqual(r[2].book, 1);
});

check('"on the authority of X" narrator form, including an "ibn" middle name', () => {
  const r = C.findHadithCitations('On the authority of Anas ibn Malik, Sahih Muslim 45 states this.');
  assertEqual(r[0].narrator, 'Anas ibn Malik');
});

check('"reported by X" narrator form', () => {
  const r = C.findHadithCitations('Reported by Aisha in Sunan Ibn Majah 200.');
  assertEqual(r[0].narrator, 'Aisha');
});

check('narrator name with a hyphenated "al-" component: "Abu Sa\'id al-Khudri"', () => {
  const r = C.findHadithCitations("Narrated by Abu Sa'id al-Khudri, per Muslim 900.");
  assertEqual(r[0].narrator, "Abu Sa'id al-Khudri");
});

check('narrator capture does not swallow trailing lowercase prose words', () => {
  // Regression: the narrator regex used to keep matching one word too far,
  // e.g. capturing "Abu Hurairah that" instead of stopping at "Abu
  // Hurairah" - the ordinary word "that" is not part of anyone's name.
  const r = C.findHadithCitations('It was narrated by Abu Hurairah that the Prophet said something, per Sahih al-Bukhari 5678.');
  assertEqual(r[0].narrator, 'Abu Hurairah');
});

check('no narrator field when none is mentioned', () => {
  const r = C.findHadithCitations('Sahih al-Bukhari 1234 is often cited with no narrator mentioned.');
  assertEqual(r[0].narrator, undefined);
});

check('narrator mention does not leak across a sentence boundary into an unrelated later citation', () => {
  // "Narrated by Aisha." ends its own sentence. The Bukhari citation in the
  // NEXT sentence has nothing to do with her - attaching her name to it
  // would be a fabricated attribution, the exact kind of unverifiable claim
  // this whole project exists to catch.
  const r = C.findHadithCitations('Narrated by Aisha. Separately, Sahih al-Bukhari 1234 discusses something else entirely.');
  assertEqual(r.length, 1);
  assertEqual(r[0].narrator, undefined, 'a narrator mentioned in a PRIOR, already-ended sentence must not attach to a later, unrelated citation');
});

check('subLetter is undefined (not an empty string) when no sub-hadith letter is present', () => {
  const r = C.findHadithCitations('Sahih al-Bukhari 1234 has no sub-letter.');
  if (r[0].subLetter !== undefined) throw new Error('expected subLetter to be exactly undefined, got: ' + JSON.stringify(r[0].subLetter));
});

// ---------------------------------------------------------------------------
// 5. False-positive guards: text that LOOKS like a hadith citation but isn't
// ---------------------------------------------------------------------------

check('"Sahih International" (a common Quran TRANSLATION credit) is not mistaken for a Bukhari citation', () => {
  const r = C.findHadithCitations('Sahih International translation renders this verse clearly.');
  assertEqual(r.length, 0, '"Sahih International" must not match the Bukhari collection variants just because it starts with "Sahih"');
});

check('"Ibn Taymiyyah" (an unrelated scholar) is not mistaken for the "Ibn Majah" collection', () => {
  const r = C.findHadithCitations('Ibn Taymiyyah wrote extensively on this topic in his 1234-page treatise.');
  assertEqual(r.length, 0, '"Ibn Taymiyyah" must not collide with "Ibn Majah" - they only share the word "Ibn"');
});

check('a collection name with no number anywhere nearby produces zero results', () => {
  const r = C.findHadithCitations('Bukhari is one of the most respected muhaddithun in Islamic history.');
  assertEqual(r.length, 0);
});

check('birth/death year range in parentheses is not mistaken for a hadith number: "al-Bukhari (810-870 CE)"', () => {
  // A dash-joined second number right after means this is a date SPAN, not
  // a hadith number - a real, plausible trap in any AI-written scholar bio.
  const r = C.findHadithCitations('Imam al-Bukhari (810-870 CE) compiled his collection over sixteen years.');
  assertEqual(r.length, 0, '(810-870 CE) is a lifespan, not a hadith citation');
});

check('a single Hijri/Gregorian year suffix directly after the number is not mistaken for a hadith number: "Bukhari (194 AH)"', () => {
  const r = C.findHadithCitations('Imam Bukhari (194 AH) was born in Bukhara.');
  assertEqual(r.length, 0, '(194 AH) is a birth year, not a hadith citation');
});

check('a number followed by a colon is not mistaken for a bare hadith number (guards against colliding with an unrelated N:N-style reference)', () => {
  const r = C.findHadithCitations('Many Muslim 5:3 scholars would disagree with that framing.');
  assertEqual(r.length, 0, 'a number immediately followed by ":N" belongs to a different citation grammar entirely');
});

check('ordinary text with no hadith mention at all produces zero results', () => {
  const r = C.findHadithCitations('This is just a normal sentence about patience and gratitude, no reference at all.');
  assertEqual(r.length, 0);
});

check('a bare number with no collection name anywhere near it is never detected (undecided/out-of-scope per the build plan, not a bug)', () => {
  const r = C.findHadithCitations('Hadith 45 discusses the importance of intentions.');
  assertEqual(r.length, 0, 'a hadith number with NO collection name is explicitly not handled in v1 - see the build plan\'s open questions');
});

// ---------------------------------------------------------------------------
// 6. Existence-check STUB (checkHadithText) - the hard boundary
// ---------------------------------------------------------------------------

check('checkHadithText never returns a real verdict for the collection+number reference itself - status is the explicit "not_yet_available" placeholder', async () => {
  const r = await C.checkHadithText('Sahih al-Bukhari 1234 says something.');
  assertEqual(r.length, 1);
  assertEqual(r[0].status, 'not_yet_available');
  assertEqual(r[0].verdict, null);
  if (!/not yet available/i.test(r[0].reason)) throw new Error('expected the reason to explicitly say existence-checking is not yet available, got: ' + r[0].reason);
  if (!/pending/i.test(r[0].reason)) throw new Error('expected the reason to name the pending data-source access, got: ' + r[0].reason);
  assertEqual(r[0].quoteCheck, undefined, 'no quote was present nearby, so no quoteCheck should be attached at all');
});

check('HADITH_EXISTENCE_CHECK_IMPLEMENTED is a stable, code-checkable false - not just prose a caller has to parse', () => {
  assertEqual(C.HADITH_EXISTENCE_CHECK_IMPLEMENTED, false);
});

check('checkHadithText results NEVER carry a "grading" field - the hard boundary, enforced structurally, not just by convention', async () => {
  const r = await C.checkHadithText('Sahih Muslim, Book 3, Hadith 45, narrated by Abu Hurairah.');
  assertEqual(r.length, 1);
  if ('grading' in r[0]) throw new Error('a checkHadithText result must never contain a grading field - v1 does not surface hasan/da\'if/sahih grading, full stop');
});

check('checkHadithText preserves every field findHadithCitations extracted - the stub wraps detection, it does not lose or corrupt it', async () => {
  const detected = C.findHadithCitations('Sunan Abu Dawud, Book 3, Hadith 45.')[0];
  const stubbed = (await C.checkHadithText('Sunan Abu Dawud, Book 3, Hadith 45.'))[0];
  assertEqual(stubbed.collectionId, detected.collectionId);
  assertEqual(stubbed.collection, detected.collection);
  assertEqual(stubbed.number, detected.number);
  assertEqual(stubbed.book, detected.book);
  assertEqual(stubbed.raw, detected.raw);
});

check('checkHadithText on text with no citation returns an empty array, not a placeholder result', async () => {
  const r = await C.checkHadithText('This text mentions nothing about hadith at all.');
  assertEqual(r.length, 0);
});

// ---------------------------------------------------------------------------
// 6b. Quoted-phrase verification - REAL, live hadeethenc.com calls, no mocks,
// same discipline as this project's other integration tests (e.g.
// mcp-server/test.js spawning a real subprocess). A network hiccup can make
// these flaky in a way the pure-logic tests above never are - that's an
// accepted, disclosed tradeoff for testing against the real signal instead
// of a mock that could quietly drift from what the real API actually does.
// ---------------------------------------------------------------------------

check('a real, famous hadith quote next to a citation gets a scored, sourced verdict from hadeethenc.com', async () => {
  const r = await C.checkHadithText('The Prophet said: "Actions are but by intentions" - Sahih al-Bukhari 1.');
  assertEqual(r.length, 1);
  if (!r[0].quoteCheck) throw new Error('expected a quoteCheck to be attached - a quoted phrase was right there in the text');
  const qc = r[0].quoteCheck;
  if (qc.status === 'lookup_failed') throw new Error('network lookup failed - not a logic bug, but re-run: ' + qc.reason);
  if (!['confirmed', 'no_confident_match', 'no_match'].includes(qc.status)) throw new Error('unexpected status: ' + qc.status);
  if (!/hadeethenc/i.test(qc.source || '')) throw new Error('expected the source to name HadeethEnc, got: ' + qc.source);
});

check('a deliberately fabricated, absurd quote does not get falsely "confirmed"', async () => {
  const r = await C.checkHadithText('The Prophet said: "Eat seventeen purple grapes daily for wisdom" - Bukhari 9999.');
  const qc = r[0].quoteCheck;
  if (!qc) throw new Error('expected a quoteCheck to be attached');
  if (qc.status === 'lookup_failed') throw new Error('network lookup failed - not a logic bug, but re-run: ' + qc.reason);
  assertEqual(qc.status !== 'confirmed', true, 'a fabricated quote must never be reported as confirmed, regardless of what loosely-related results the search API happens to surface');
});

check('a hadith citation with no quoted text nearby gets no quoteCheck at all - never a fabricated verdict on nothing', async () => {
  const r = await C.checkHadithText('This is discussed in Sahih Muslim, Hadith 45, with no quote given.');
  assertEqual(r[0].quoteCheck, undefined);
});

check('verifyQuotedPhrase directly: Arabic quote is detected and searched in Arabic, not English', async () => {
  const r = await C.verifyQuotedPhrase('إنما الأعمال بالنيات');
  if (r.status === 'lookup_failed') throw new Error('network lookup failed - not a logic bug, but re-run: ' + r.reason);
  if (!['confirmed', 'no_confident_match', 'no_match'].includes(r.status)) throw new Error('unexpected status: ' + r.status);
});

// Regression test for a real false positive found during manual QA (see
// test/manual-check-hadith.js): this exact 15-word quote used to score 87%
// overlap against Ka'b ibn Malik's completely unrelated story hadith,
// because 13 of the 15 quoted words were ordinary stopwords ("are", "but",
// "by", "and", "which", "he"...) that any sufficiently long English hadith
// contains by coincidence - while the two words that actually carry the
// quote's meaning, "actions" and "intentions", were NOT in that unrelated
// text at all. Fixed by scoring only content words. This must never again
// report "confirmed" against an unrelated hadith.
check('stopword-heavy quote does not falsely "confirm" against an unrelated hadith', async () => {
  const r = await C.verifyQuotedPhrase('Actions are but by intentions, and every man shall have only that which he intended.');
  if (r.status === 'lookup_failed') throw new Error('network lookup failed - not a logic bug, but re-run: ' + r.reason);
  assertEqual(r.status !== 'confirmed', true, 'a stopword-dominated overlap must never count as a confirmed match');
});

check('a quote with fewer than 2 content words is never confirmed, regardless of raw score', async () => {
  const r = await C.verifyQuotedPhrase('the Prophet said');
  if (r.status === 'lookup_failed') throw new Error('network lookup failed - not a logic bug, but re-run: ' + r.reason);
  assertEqual(r.status, 'no_confident_match', 'too few content words to score reliably - must abstain, not guess');
});

// ---------------------------------------------------------------------------
// 7. Input-size guard (mirrors checker.js's MAX_TEXT_LENGTH discipline - the
// MCP server will eventually call findHadithCitations directly with
// unbounded client-supplied text, exactly like it does for the Quran engine)
// ---------------------------------------------------------------------------

check('findHadithCitations throws a distinct, named error over the length limit, not a silent empty result', () => {
  const tooLong = 'x'.repeat(C.MAX_TEXT_LENGTH + 1);
  let threw = null;
  try { C.findHadithCitations(tooLong); } catch (e) { threw = e; }
  if (!threw) throw new Error('expected findHadithCitations to throw on oversized input, it returned normally instead');
  if (!(threw instanceof C.HadithTextTooLongError)) throw new Error('expected a HadithTextTooLongError specifically, got: ' + threw.constructor.name);
  assertEqual(threw.length, C.MAX_TEXT_LENGTH + 1);
});

check('findHadithCitations does not throw at exactly the length limit', () => {
  const atLimit = 'x'.repeat(C.MAX_TEXT_LENGTH);
  const r = C.findHadithCitations(atLimit); // must not throw
  assertEqual(r.length, 0, 'no citation in a page of x characters, but the call itself must succeed');
});

check('checkHadithText also throws the same distinct error over the length limit (inherited from findHadithCitations, not silently bypassed) - now surfaces as a rejected promise, since checkHadithText is async', async () => {
  const tooLong = 'x'.repeat(C.MAX_TEXT_LENGTH + 1);
  let threw = null;
  try { await C.checkHadithText(tooLong); } catch (e) { threw = e; }
  if (!(threw instanceof C.HadithTextTooLongError)) throw new Error('expected checkHadithText to inherit the same size guard, got: ' + (threw && threw.constructor.name));
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

(async () => {
  for (const run of pending) await run();
  console.log(`\n${pass} passed, ${fail} failed (${pass + fail} total)`);
  if (failures.length) {
    console.log('\nFAILURES:');
    for (const f of failures) console.log(`  - ${f.label}\n      ${f.error}`);
    process.exit(1);
  }
})();
