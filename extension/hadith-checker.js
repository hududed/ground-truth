// Hadith citation DETECTION engine. Deliberately separate from checker.js
// (the Quran engine) - not a refactor of it, a sibling built the same way,
// so hadith checking can be loaded, tested, and eventually feature-flagged
// on/off entirely independently of the shipped Quran path. Nothing in
// checker.js is modified or depended on by this file.
//
// Depends on window.HADITH_COLLECTIONS being loaded first (see
// hadith-data.js), exactly the way checker.js depends on window.QURAN_DATA.
//
// ---------------------------------------------------------------------------
// SCOPE, READ THIS FIRST: this file does citation DETECTION ONLY.
//
// findHadithCitations() recognizes a hadith citation in text and extracts
// {collection, number, book, subLetter, narrator} - nothing more. It does
// NOT know whether the hadith actually exists, whether the number is
// correct, or whether it's on any fabricated/mawdu list. That requires a
// real source (sunnah.com for existence, dorar.net for the fabricated
// cross-reference), and this project does not have access to either yet -
// outreach was sent, no response as of this writing. See
// drafts/ground-truth/.lavish/v1-build-plan.html for the current status.
//
// checkHadithText() exists so callers have a stable entry point to code
// against NOW, without a redesign once real data lands - but every result
// it returns is an explicit, named "not yet available" placeholder (see
// EXISTENCE_CHECK_STATUS below), never a guessed EXISTS/NOT FOUND verdict.
// Guessing would be exactly the kind of unverifiable "trust me" claim this
// whole project exists to catch (see checker.js's SOURCE-citing discipline).
// ---------------------------------------------------------------------------

window.GroundTruthHadithChecker = window.GroundTruthHadithChecker || (() => {
  let COLLECTIONS = null;
  let VARIANT_TO_COLLECTION = {};
  let bookHadithRe, keywordNumberRe, bareNumberRe, narratorRe;

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function init() {
    if (COLLECTIONS) return;
    COLLECTIONS = window.HADITH_COLLECTIONS;
    const flat = [];
    COLLECTIONS.forEach(c => {
      c.variants.forEach(v => {
        VARIANT_TO_COLLECTION[v.toLowerCase()] = c;
        flat.push(v);
      });
    });
    // Longest-first: see the comment on `variants` in hadith-data.js for why
    // this ordering is load-bearing rather than cosmetic.
    flat.sort((a, b) => b.length - a.length);
    const alt = flat.map(esc).join('|');

    // Three numbering styles, most specific/longest first (claimed spans
    // stop a later, shorter pattern from re-matching part of an earlier
    // match - see the ordering comment in findHadithCitations() below):
    //
    // 1. "Sunan Abu Dawud, Book 3, Hadith 45" - collection + book + hadith no.
    // 2. "Sahih al-Bukhari, Hadith 1234" / "Tirmidhi #3956" - collection +
    //    an explicit Hadith/Number/No./# keyword + number, no book.
    // 3. "Muslim 2564a" - collection directly followed by a bare number,
    //    with an optional lettered sub-hadith suffix (sunnah.com's own
    //    convention for a hadith split across multiple numbered narrations).
    bookHadithRe = new RegExp(
      '(' + alt + ')\\b[\\s,]*Book\\s*(\\d{1,4})[\\s,]*(?:Hadith|Number|No\\.?)\\s*(\\d{1,5})([a-z])?\\b',
      'gi'
    );
    // The keyword itself can be "Hadith", "Number", "No."/"#", OR a
    // combined "Hadith No."/"Number No." - real AI output uses both the
    // single form ("Hadith 1234") and the combined form ("Hadith no.
    // 1234") interchangeably, and the combined alternatives must be listed
    // so JS regex backtracking reaches them when the single-word form's
    // downstream number match fails against a stray "no." in between.
    keywordNumberRe = new RegExp(
      '(' + alt + ')\\b[\\s,]*(?:Hadith\\s+No\\.?|Hadith|Number\\s+No\\.?|Number|No\\.?|#)\\s*[:.]?\\s*(\\d{1,5})([a-z])?\\b',
      'gi'
    );
    // Negative lookaheads guard two real false-positive traps seen in
    // ordinary AI-generated prose about hadith scholars/collections:
    //   - "(?!\\s*:)"        a bare "Muslim 5:3" glued next to an unrelated
    //                        surah:ayah-style reference - that colon means
    //                        this number belongs to a DIFFERENT citation
    //                        grammar entirely, not a hadith number.
    //   - "(?!\\s*-\\s*\\d)" a birth/death year range in parentheses, e.g.
    //                        "Imam al-Bukhari (810-870 CE)" - the dash-joined
    //                        second number means this is a date span, not a
    //                        hadith number.
    //   - "(?!\\s*(?:AH|CE|H\\.?)\\b)" a single Hijri/Gregorian year suffix
    //                        directly after the number, e.g. "Bukhari (194
    //                        AH)" - same trap without the dash.
    bareNumberRe = new RegExp(
      '(' + alt + ')\\b[\\s,(\\[]*(\\d{1,5})([a-z])?\\b(?!\\s*:)(?!\\s*-\\s*\\d)(?!\\s*(?:AH|CE|H\\.?)\\b)',
      'gi'
    );

    // Captures the narrator named in "narrated by X", "narrated X" (no
    // "by"), "on the authority of X", "reported by X" - a real format an AI
    // writes ("narrated by Abu Hurairah, [collection]..."), but per the v1
    // build plan this name is NOT used for the (not-yet-built) existence
    // check, only carried through as an informational field. Note the
    // intro phrase is deliberately NOT allowed to swallow the whitespace
    // before the name itself (e.g. "narrated(?:\s+by)?" not
    // "narrated\s+(?:by\s+)?") - the mandatory \s+ right after the whole
    // alternation is what actually separates the intro phrase from the
    // name, and letting an inner optional group eat that same whitespace
    // first made the outer \s+ have nothing left to match, silently
    // failing the entire pattern on the most common phrasing ("narrated by
    // X"). Allows up to 4 space-separated capitalized words (covers names
    // like "Abd Allah ibn Umar") and both apostrophe styles plus hyphens
    // ("Abu Sa'id al-Khudri").
    // Deliberately NOT a case-insensitive ('i') regex: the capture group
    // relies on [A-Z] meaning "this word is actually capitalized, i.e.
    // plausibly a proper name" to avoid swallowing ordinary lowercase words
    // that follow the name ("...Abu Hurairah that the Prophet..." must
    // capture "Abu Hurairah", not "Abu Hurairah that"). An 'i' flag would
    // make [A-Z] match lowercase too, defeating that guard entirely. Only
    // the intro phrase's own first letter is bracketed for both cases
    // (sentence-initial "Narrated by X" vs. mid-sentence "narrated by X");
    // the rest of each intro phrase is realistically always lowercase.
    // Each name "word" optionally carries a preceding, SPACE-separated
    // "ibn"/"bin"/"bint" (e.g. "Anas ibn Malik") or a directly HYPHENATED
    // lowercase "al-" prefix with no space (e.g. "al-Khudri" in "Abu Sa'id
    // al-Khudri") before the capitalized part that actually marks it as a
    // name-word - these are two genuinely different attachment styles in
    // real names, not interchangeable, so each is matched in its own form
    // rather than both being treated as ordinary space-separated words.
    const NAME_WORD = "(?:(?:ibn|bin|bint)\\s+)?(?:al-)?[A-Z][A-Za-z'’-]*";
    narratorRe = new RegExp(
      '(?:[Nn]arrated(?:\\s+by)?|[Oo]n\\s+the\\s+authority\\s+of|[Rr]eported\\s+by)\\s+(' + NAME_WORD + '(?:\\s+' + NAME_WORD + '){0,4})',
      'g'
    );
  }

  // Looks back from a citation's start for a narrator-introducing phrase in
  // the SAME clause only - a period or newline ends whatever sentence the
  // narrator was mentioned in, and reaching back across it into an unrelated
  // earlier sentence would misattribute a narrator to the wrong citation
  // (the same "don't guess across a boundary" discipline checker.js applies
  // to assigning an Arabic quote to the nearest citation).
  function findNarratorBefore(text, start) {
    const windowStart = Math.max(0, start - 100);
    const before = text.slice(windowStart, start);
    const lastStop = Math.max(before.lastIndexOf('.'), before.lastIndexOf('\n'));
    const clause = lastStop >= 0 ? before.slice(lastStop + 1) : before;
    narratorRe.lastIndex = 0;
    let m, last = null;
    while ((m = narratorRe.exec(clause))) last = m;
    return last ? last[1].replace(/\s+/g, ' ').trim() : undefined;
  }

  // The MCP server (once a hadith tool is wired in) will call this directly
  // with whatever text a client hands it, with no page-size pre-filter of
  // its own - exactly the situation checker.js's own MAX_TEXT_LENGTH guard
  // exists for. Guarding here, at the fundamental detection entry point,
  // rather than only in checkHadithText() below, means the guard is live
  // the moment ANY caller uses this module - including a caller that only
  // wants detection and never calls checkHadithText() at all (the situation
  // this entire module is built for today, since existence-checking isn't
  // implemented yet).
  const MAX_TEXT_LENGTH = 200000;

  function HadithTextTooLongError(length) {
    this.name = 'HadithTextTooLongError';
    this.message = 'Input text is ' + length + ' characters, over the ' + MAX_TEXT_LENGTH + '-character limit.';
    this.length = length;
  }
  HadithTextTooLongError.prototype = Object.create(Error.prototype);

  function findHadithCitations(text) {
    if (text.length > MAX_TEXT_LENGTH) throw new HadithTextTooLongError(text.length);
    init();
    const found = [];
    const claimed = [];

    function tryAdd(m, collection, number, book, subLetter) {
      const start = m.index, end = m.index + m[0].length;
      if (claimed.some(([a, b]) => start < b && end > a)) return;
      claimed.push([start, end]);
      found.push({
        raw: m[0],
        start,
        end,
        collectionId: collection.id,
        collection: collection.name,
        number,
        book,
        subLetter,
        narrator: findNarratorBefore(text, start),
      });
    }

    let mm;
    // Book+Hadith form MUST run before the plain keyword/bare forms below -
    // it is the longer, more specific match ("...Book 3, Hadith 45"), and
    // claiming its full span first stops a shorter pattern from later
    // matching just the "Hadith 45" tail of it as a book-less citation.
    bookHadithRe.lastIndex = 0;
    while ((mm = bookHadithRe.exec(text))) {
      tryAdd(mm, VARIANT_TO_COLLECTION[mm[1].toLowerCase()], parseInt(mm[3], 10), parseInt(mm[2], 10), mm[4]);
    }

    keywordNumberRe.lastIndex = 0;
    while ((mm = keywordNumberRe.exec(text))) {
      tryAdd(mm, VARIANT_TO_COLLECTION[mm[1].toLowerCase()], parseInt(mm[2], 10), undefined, mm[3]);
    }

    bareNumberRe.lastIndex = 0;
    while ((mm = bareNumberRe.exec(text))) {
      tryAdd(mm, VARIANT_TO_COLLECTION[mm[1].toLowerCase()], parseInt(mm[2], 10), undefined, mm[3]);
    }

    found.sort((a, b) => a.start - b.start);
    return found;
  }

  // ---------------------------------------------------------------------
  // Existence-check STUB. See the file-header boundary note - this never
  // returns EXISTS/NOT FOUND/COLLECTION MISMATCH/FABRICATED. It exists so
  // a caller (the MCP server, content.js, popup.js) can be wired against a
  // stable shape today and only need its data source swapped in later, not
  // its whole call site redesigned.
  // ---------------------------------------------------------------------

  // A stable, code-checkable boundary marker - not just prose in a message
  // string that could drift or be misread. Any caller (or test) can assert
  // on this boolean directly instead of pattern-matching a reason string.
  const HADITH_EXISTENCE_CHECK_IMPLEMENTED = false;

  const EXISTENCE_CHECK_STATUS = 'not_yet_available';
  const EXISTENCE_CHECK_REASON =
    'Existence-checking not yet available - sunnah.com/dorar.net data source access is pending (outreach sent, no response yet). ' +
    'This citation was detected but not verified against any source.';

  // Deliberately does NOT read or forward any "grading" field - there is no
  // grading data source wired in at all yet, and per the v1 build plan's
  // hard boundary, when one is, the code must read past it and explicitly
  // discard it, never surface it. Every object this returns is asserted, by
  // construction, to never carry a `grading` key at all (see
  // hadith-checker.test.js).
  function checkHadithText(text) {
    return findHadithCitations(text).map(c => ({
      ...c,
      status: EXISTENCE_CHECK_STATUS,
      verdict: null,
      reason: EXISTENCE_CHECK_REASON,
      source: null,
    }));
  }

  return {
    findHadithCitations,
    checkHadithText,
    HADITH_EXISTENCE_CHECK_IMPLEMENTED,
    init,
    HadithTextTooLongError,
    MAX_TEXT_LENGTH,
    get ready() { return !!window.HADITH_COLLECTIONS; },
  };
})();
