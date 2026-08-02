// Hadith citation engine. Deliberately separate from checker.js (the Quran
// engine) - not a refactor of it, a sibling built the same way, so hadith
// checking can be loaded, tested, and eventually feature-flagged on/off
// entirely independently of the shipped Quran path. Nothing in checker.js
// is modified or depended on by this file.
//
// Depends on window.HADITH_COLLECTIONS being loaded first (see
// hadith-data.js), exactly the way checker.js depends on window.QURAN_DATA.
//
// ---------------------------------------------------------------------------
// SCOPE, READ THIS FIRST: two genuinely different questions, two different
// answers.
//
// "Is this specifically hadith #1234 in this named collection" - NOT
// answerable yet. findHadithCitations() recognizes a hadith citation and
// extracts {collection, number, book, subLetter, narrator}, but confirming
// the specific reference requires sunnah.com's own numbering data, which
// this project does not have access to yet - outreach was sent, no response
// as of this writing. checkHadithText() reports this stub result
// (EXISTENCE_CHECK_STATUS below) for every citation, honestly, never a
// guessed EXISTS/NOT FOUND verdict on the reference itself.
//
// "Does a hadith with THIS WORDING exist anywhere in a real source" - IS
// answerable, today, when the AI also quoted the hadith's text nearby (in
// quotation marks). verifyQuotedPhrase() checks that quote against
// hadeethenc.com's public search API and reports a real, scored verdict -
// see the section below for the (deliberately conservative) scoring logic
// and exactly what it can and can't tell you.
//
// See drafts/ground-truth/.lavish/v1-build-plan.html for the fuller status.
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
  // Collection+number existence-check: still a STUB. Confirming "does
  // Bukhari's hadith #1234 specifically exist" requires sunnah.com's own
  // numbering data, which this project does not have access to yet
  // (outreach sent, no response as of this writing). Nothing below changes
  // that - HADITH_EXISTENCE_CHECK_IMPLEMENTED stays false, and no result
  // this file returns ever claims a specific collection+number reference is
  // correct or incorrect.
  // ---------------------------------------------------------------------

  // A stable, code-checkable boundary marker - not just prose in a message
  // string that could drift or be misread. Any caller (or test) can assert
  // on this boolean directly instead of pattern-matching a reason string.
  const HADITH_EXISTENCE_CHECK_IMPLEMENTED = false;

  const EXISTENCE_CHECK_STATUS = 'not_yet_available';
  const EXISTENCE_CHECK_REASON =
    'Collection+number existence-checking not yet available - sunnah.com/dorar.net data source access is pending (outreach sent, no response yet). ' +
    'This citation was detected but its specific reference (e.g. "is this really hadith #1234 in this collection") was not verified against any source.';

  // ---------------------------------------------------------------------
  // Quoted-TEXT verification: real, live, working today - a genuinely
  // different, narrower question than the stub above. Not "is this the
  // correct collection+number", but "does a hadith with THIS WORDING exist
  // anywhere in a real, public hadith source" - the same kind of check
  // checker.js already does for Quran Arabic text, just against a
  // phrase-search API instead of an exact-text diff, because no exact-match
  // corpus is available yet for hadith the way Tanzil's is for Quran.
  //
  // Source: hadeethenc.com's public, keyless JSON API (confirmed free, no
  // auth, no rate-limit wall hit in testing - see
  // drafts/ground-truth/.lavish/v1-build-plan.html for how this was found
  // and verified). This is the FIRST live network call this project makes
  // anywhere - see PRIVACY.md for the honest disclosure of what that means.
  // ---------------------------------------------------------------------

  const HADEETH_ENC_SOURCE = "HadeethEnc.com (Hadith Encyclopedia)";
  const HADEETH_ENC_SEARCH_URL = 'https://hadeethenc.com/api/v1/hadeeths/search/';

  // A DELIBERATELY high bar. Empirical testing (see the build plan doc)
  // showed this search API is a loose keyword match, not phrase search: a
  // completely fabricated phrase can still surface an unrelated result, and
  // even a famous, verbatim-real quote's correct match is not reliably
  // ranked first among the results. Treating "the API returned something"
  // as confirmation would be exactly the false-confidence failure mode this
  // whole project exists to catch. Requiring a strong word-overlap match
  // against the BEST-scoring result (not just the first one) - and
  // otherwise reporting "no confident match", never a guessed negative - is
  // the same discipline as checker.js declining to score an English
  // paraphrase: abstain rather than fabricate precision the underlying
  // signal doesn't actually have.
  const PHRASE_MATCH_THRESHOLD = 0.6;

  function normalizeWords(s) {
    return s
      .toLowerCase()
      .replace(/<[^>]*>/g, ' ') // strip the API's own <mark> highlight tags
      .replace(/[^\p{L}\p{N}\s]/gu, ' ') // punctuation-insensitive, Unicode-aware (Arabic + English)
      .split(/\s+/)
      .filter(Boolean);
  }

  // Fraction of the QUOTED phrase's own words found in the candidate text -
  // deliberately asymmetric (not a generic Jaccard/union ratio): a long
  // candidate hadith containing every word of a short quoted excerpt should
  // score high, even though the candidate itself has many additional words
  // the quote never touches.
  function overlapScore(quotedWords, candidateWords) {
    if (!quotedWords.length) return 0;
    const candidateSet = new Set(candidateWords);
    const hits = quotedWords.filter(w => candidateSet.has(w)).length;
    return hits / quotedWords.length;
  }

  // Looks for a quoted phrase (straight or curly double quotes) in the SAME
  // clause immediately around a citation - mirrors checker.js's Arabic-run
  // extraction in spirit (nearest text wins, don't reach across an
  // unrelated citation), simplified to a single-citation local window since
  // hadith citations appear far more sparsely in real AI text than Quran
  // citations do (this project's own adversarial packed-citation test cases
  // do not have a hadith analogue yet - if that changes, this should adopt
  // the same global nearest-assignment + ambiguity-abstention algorithm
  // checker.js's assignArabicRuns uses, not a per-citation window).
  function findQuotedPhraseNear(text, citation, span) {
    const start = Math.max(0, citation.start - span);
    const end = Math.min(text.length, citation.end + span);
    const window = text.slice(start, end);
    const m = window.match(/[“"]([^”"]{15,400})[”"]/);
    return m ? m[1].trim() : null;
  }

  async function searchHadeethEnc(phrase, language) {
    const url = HADEETH_ENC_SEARCH_URL + '?phrase=' + encodeURIComponent(phrase) + '&language=' + language;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HadeethEnc search returned HTTP ' + res.status);
    const data = await res.json();
    return Array.isArray(data) ? data : []; // non-array shape ({suggestions:{...empty}}) means no real matches
  }

  // Tries the phrase as given, and if it contains no Arabic script, only
  // searches English - HadeethEnc's `language` parameter is a real filter,
  // not a hint, so guessing wrong returns confidently empty results for a
  // phrase that may well exist in the OTHER language's corpus.
  function detectLanguage(phrase) {
    return /[؀-ۿ]/.test(phrase) ? 'ar' : 'en';
  }

  async function verifyQuotedPhrase(phrase) {
    const language = detectLanguage(phrase);
    const quotedWords = normalizeWords(phrase);
    let results;
    try {
      results = await searchHadeethEnc(phrase, language);
    } catch (e) {
      return {
        quotedPhrase: phrase,
        status: 'lookup_failed',
        verdict: null,
        reason: 'Could not reach ' + HADEETH_ENC_SOURCE + ' to verify this quote (' + e.message + '). Not treated as a negative result - the check simply did not run.',
        source: null,
      };
    }
    if (!results.length) {
      return {
        quotedPhrase: phrase,
        status: 'no_match',
        verdict: null,
        reason: 'No hadith matching this wording was found in ' + HADEETH_ENC_SOURCE + '. This does not by itself mean it is fabricated - only that this specific source does not corroborate the exact wording.',
        source: HADEETH_ENC_SOURCE,
      };
    }
    let best = null, bestScore = -1;
    for (const r of results) {
      const candidateWords = normalizeWords((r.hadith_text || r.hadeeth || '') + ' ' + (r.title || ''));
      const score = overlapScore(quotedWords, candidateWords);
      if (score > bestScore) { bestScore = score; best = r; }
    }
    if (bestScore >= PHRASE_MATCH_THRESHOLD) {
      return {
        quotedPhrase: phrase,
        status: 'confirmed',
        verdict: 'match',
        matchedTitle: best.title,
        matchScore: Math.round(bestScore * 100) / 100,
        reason: 'A closely matching hadith was found in ' + HADEETH_ENC_SOURCE + ': "' + (best.title || '').slice(0, 120) + '"',
        source: HADEETH_ENC_SOURCE,
      };
    }
    return {
      quotedPhrase: phrase,
      status: 'no_confident_match',
      verdict: null,
      matchScore: Math.round(bestScore * 100) / 100,
      reason: HADEETH_ENC_SOURCE + ' returned results for related words, but none closely matched this exact quote (best overlap ' + Math.round(bestScore * 100) + '%). Likely a paraphrase, a different hadith, or genuinely fabricated - this check alone cannot tell those apart.',
      source: HADEETH_ENC_SOURCE,
    };
  }

  // Deliberately does NOT read or forward any "grading" field from any
  // source - see the hard boundary note at the top of this file. Every
  // object this returns is asserted, by construction, to never carry a
  // `grading` key at all (see hadith-checker.test.js).
  //
  // Now async: quoted-phrase verification is a real network call. Every
  // citation still gets its collection+number stub result synchronously
  // detected; the phrase check is layered on top only when a nearby quote
  // is actually found.
  async function checkHadithText(text) {
    const citations = findHadithCitations(text);
    const results = [];
    for (const c of citations) {
      const base = { ...c, status: EXISTENCE_CHECK_STATUS, verdict: null, reason: EXISTENCE_CHECK_REASON, source: null };
      const quote = findQuotedPhraseNear(text, c, 250);
      if (quote) {
        base.quoteCheck = await verifyQuotedPhrase(quote);
      }
      results.push(base);
    }
    return results;
  }

  return {
    findHadithCitations,
    checkHadithText,
    verifyQuotedPhrase,
    HADITH_EXISTENCE_CHECK_IMPLEMENTED,
    HADEETH_ENC_SOURCE,
    init,
    HadithTextTooLongError,
    MAX_TEXT_LENGTH,
    get ready() { return !!window.HADITH_COLLECTIONS; },
  };
})();
