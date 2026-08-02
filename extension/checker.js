// Shared citation-checking engine. Reused by content.js, inject-selection.js, and popup.js.
// Depends on window.QURAN_DATA being loaded first (see quran-data.js).

// Guard against double-injection: the context-menu "check selection" path can
// inject this file into a page that already has it via the declarative content
// script (e.g. re-checking a selection on a chat site). Re-declaring `const`
// in the same execution world would throw, so skip entirely if already present.
window.GroundTruthChecker = window.GroundTruthChecker || (() => {
  let QURAN = null;
  let BY_ID = {};
  let NAME_TO_ID = {};
  let nameColonRangeRe, nameColonRe, nameVerseRe, bareRe, bareRangeRe;

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // HTML-escapes any string before it's interpolated into an innerHTML
  // template. Every UI surface (content.js, inject-selection.js, popup.js)
  // must run every dynamic value through this before building HTML, with NO
  // exceptions for values currently believed "safe" (e.g. citation text
  // constrained by a regex character class). That belief is exactly the kind
  // of implicit, undocumented safety that silently breaks the moment a
  // regex is loosened later to catch a new citation format - explicit
  // escaping here is the actual defense, not a backstop for a defense that
  // doesn't otherwise exist.
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function init() {
    if (QURAN) return;
    QURAN = window.QURAN_DATA;
    QURAN.forEach(s => {
      BY_ID[s.id] = s;
      NAME_TO_ID[s.translit.toLowerCase()] = s.id;
    });
    const sorted = [...QURAN].sort((a, b) => b.translit.length - a.translit.length);
    const alt = sorted.map(s => esc(s.translit)).join('|');
    // [\s,(\[]* between the name and the number tolerates "Al-Hadid (57:4)",
    // "Al-Hadid, 57:4", and "Al-Hadid [57:4]" - not just "Al-Hadid 57:4".
    // Real AI output (Google AI Mode, ChatGPT citations) commonly uses the
    // parenthetical form, and the earlier version silently missed all of it.
    // Verse RANGES ("Ash-Sharh 94:5-6") must be tried before the single-ayah
    // pattern below, and claim the FULL span including the "-6" - otherwise
    // the single-ayah regex matches just "94:5", stops there, and any badge
    // inserted at that offset lands in the middle of the citation ("94:5[?]-6")
    // instead of after the whole thing. Real AI Overview output uses this
    // range form constantly for well-known two-ayah phrases.
    nameColonRangeRe = new RegExp('(?:Surah\\s+)?(' + alt + ')\\b[\\s,(\\[]*(\\d{1,3})\\s*:\\s*(\\d{1,3})\\s*-\\s*(\\d{1,3})[)\\]]?', 'gi');
    nameColonRe = new RegExp('(?:Surah\\s+)?(' + alt + ')\\b[\\s,(\\[]*(\\d{1,3})\\s*:\\s*(\\d{1,3})[)\\]]?', 'gi');
    nameVerseRe = new RegExp('(?:Surah\\s+)?(' + alt + ')\\b[\\s,(\\[]*(?:verse|ayah|ayat)\\s*(\\d{1,3})[)\\]]?', 'gi');
    bareRe = /\b(\d{1,3})\s*:\s*(\d{1,3})\b/g;
    // Range support for nameColonRangeRe only fires when the surah name
    // matches this dataset's exact transliteration spelling. AI output varies
    // constantly ("Al-Duha" vs this dataset's "Ad-Duhaa", etc.), and when the
    // name doesn't match, a range like "93:5-6" was silently falling through
    // to bareRe above, which has no range awareness and only ever captured
    // the first ayah - the badge would land after "5", never checking the
    // second ayah in the range at all. This mirrors bareRe's own keyword-
    // window heuristic but is entirely name-agnostic.
    bareRangeRe = /\b(\d{1,3})\s*:\s*(\d{1,3})\s*-\s*(\d{1,3})\b/g;
  }

  function normalizeArabic(s) {
    return s
      // NFC first: two combining marks on the same base letter (e.g. shadda +
      // damma on \u0628) are semantically identical regardless of which order they
      // were typed/encoded in, but a raw string comparison treats different
      // orderings as different text. Unicode's own canonical ordering
      // algorithm (applied by NFC) sorts combining marks deterministically,
      // so this alone would have made "\u0628\u064F\u0651" and "\u0628\u0651 \u064F" (damma-then-shadda vs
      // shadda-then-damma) compare equal even before any diacritic stripping.
      .normalize('NFC')
      // U+064B-0655 covers the full standard diacritic set (fatha/damma/kasra/
      // tanwin/shadda/sukun PLUS maddah-above and hamza-above/below at 0653-
      // 0655, which a narrower 064B-0652 range silently misses). A real verse
      // like Ad-Duhaa 93:5 ends in a superscript alef (0670) stacked with a
      // maddah (0653) - dropping only the maddah is a common, harmless
      // rendering/source variant, not a textual error, and without 0653 in
      // this range it would falsely diff as a mismatch.
      .replace(/[\u064B-\u0655\u0670\u06D6-\u06ED\u0640]/g, '')
      .replace(/[آأإٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function containsArabic(s) { return /[؀-ۿ]/.test(s); }

  // Finds every standalone run of Arabic text in the whole message ONCE,
  // instead of re-searching a wide window around each citation separately -
  // see assignArabicRuns() below for why the per-citation approach this
  // replaced could misattribute a quote to the wrong citation.
  function findArabicRuns(text) {
    const runs = [];
    const re = /[؀-ۿ\s]{6,}/g;
    let m;
    while ((m = re.exec(text))) {
      const raw = m[0];
      const leading = raw.length - raw.trimStart().length;
      const trimmed = raw.trim();
      if (trimmed && containsArabic(trimmed)) {
        const start = m.index + leading;
        runs.push({ text: trimmed, start, end: start + trimmed.length });
      }
    }
    return runs;
  }

  function edgeDistance(run, start, end) {
    if (run.end <= start) return start - run.end;
    if (run.start >= end) return run.start - end;
    return 0;
  }

  // A citation's Arabic quote can sit up to ~250 chars away in either
  // direction (models often quote first then attribute, or attribute then
  // quote) - but naively searching "±250 chars from MY position" has no
  // idea a DIFFERENT citation's quote might fall in that same window. Two
  // citations mentioned a sentence or two apart is completely ordinary
  // prose, well within 250 chars of each other. Assigning globally instead
  // - nearest citation wins each run - is what actually stops, e.g.,
  // Al-Fatihah's Bismillah quote from being scored against an unrelated
  // Al-Hadid citation just because it was mentioned nearby.
  // A quote sitting almost exactly between two DIFFERENT citations (e.g.
  // "X is well known. <quote> is quoted from Y") is a genuine toss-up by
  // distance alone - nothing about character-counting knows that "from Y"
  // means Y, not X. Rather than let iteration order silently pick a side on
  // a near-tie, abstain: no arabicCheck is safer than a confidently wrong
  // one, the same call already made for English paraphrases (no single
  // translation is canonical, so it's never auto-scored either).
  const AMBIGUITY_MARGIN = 20;
  // A gap this small is a "cites: quotes" or "cites (quote)" pattern - the
  // quote is textually right next to its own citation (e.g. "93:5 says: "
  // is a 7-char gap). That's about as strong a positional signal as this
  // heuristic gets, so it wins outright without needing to clear the
  // ambiguity margin against whatever else happens to be within 250 chars.
  const CLEAR_ADJACENCY = 10;

  function assignArabicRuns(text, citations) {
    const runs = findArabicRuns(text);
    const assigned = new Map();
    for (const run of runs) {
      let best = null, secondBestDist = Infinity;
      citations.forEach((c, i) => {
        if (c.ayahEnd) return; // ranges never get an arabicCheck
        const d = edgeDistance(run, c.start, c.end);
        if (!best || d < best.dist) {
          secondBestDist = best ? best.dist : Infinity;
          best = { idx: i, dist: d };
        } else if (d < secondBestDist) {
          secondBestDist = d;
        }
      });
      if (!best || best.dist > 250) continue;
      if (best.dist > CLEAR_ADJACENCY && secondBestDist - best.dist < AMBIGUITY_MARGIN) continue;
      const existing = assigned.get(best.idx);
      if (!existing || best.dist < existing.dist) assigned.set(best.idx, { run, dist: best.dist });
    }
    return assigned;
  }

  // Word-level LCS diff between the real ayah and what was quoted, so a
  // partial/mismatch verdict can be explained instead of left as a bare
  // label. Compares NORMALIZED words (diacritic-insensitive) for equality,
  // but returns the ORIGINAL word forms so the rendered diff still shows
  // real Arabic text, not the stripped comparison form.
  function wordDiff(canonicalText, quotedText) {
    const cWords = canonicalText.split(/\s+/).filter(Boolean);
    const qWords = quotedText.split(/\s+/).filter(Boolean);
    const cNorm = cWords.map(normalizeArabic);
    const qNorm = qWords.map(normalizeArabic);
    const n = cWords.length, m = qWords.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++)
      for (let j = 1; j <= m; j++)
        dp[i][j] = cNorm[i - 1] === qNorm[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    const result = [];
    let i = n, j = m;
    while (i > 0 && j > 0) {
      if (cNorm[i - 1] === qNorm[j - 1]) { result.unshift({ type: 'same', word: cWords[i - 1] }); i--; j--; }
      else if (dp[i - 1][j] >= dp[i][j - 1]) { result.unshift({ type: 'missing', word: cWords[i - 1] }); i--; }
      else { result.unshift({ type: 'extra', word: qWords[j - 1] }); j--; }
    }
    while (i > 0) result.unshift({ type: 'missing', word: cWords[--i] });
    while (j > 0) result.unshift({ type: 'extra', word: qWords[--j] });
    return result;
  }

  // Renders a word diff as inline-styled HTML: plain text for matching words,
  // a muted strike-through for words the real ayah has that the quote is
  // missing, and a highlighted underline for words the quote has that aren't
  // in the real ayah. Shared here so the auto-scan tooltip, the right-click
  // panel, and the popup all render the exact same "why" explanation instead
  // of three separate reimplementations drifting apart. theme='dark' matches
  // the tooltip/panel's near-black background; theme='light' is for popup.js,
  // which renders on a cream background where the dark-tuned colors would
  // have poor contrast.
  function renderWordDiffHtml(diff, theme) {
    const missingColor = theme === 'light' ? '#6B6B6B' : '#999';
    const extraColor = theme === 'light' ? '#A85138' : '#E8927A';
    return diff.map(d => {
      const w = escapeHtml(d.word);
      if (d.type === 'same') return '<span>' + w + '</span>';
      if (d.type === 'missing') return '<span style="color:' + missingColor + ';text-decoration:line-through;" title="in the real ayah, missing from the quote">' + w + '</span>';
      return '<span style="color:' + extraColor + ';text-decoration:underline;" title="in the quote, not in the real ayah">' + w + '</span>';
    }).join(' ');
  }

  // Cited directly in every reason string and shown alongside every result -
  // "trust me, it doesn't exist" is exactly the kind of unverifiable claim
  // this whole project exists to catch. The standard being checked against
  // needs to be named every time, not just once in a README nobody reads
  // before trusting a specific verdict.
  // The license (CC BY 3.0) is credited in the code/data files that actually
  // redistribute Tanzil's text (see quran-data.js, README.md) - that's where
  // attribution obligations live. Repeating the license code in every
  // on-screen result is legal-label noise a reader doesn't need to judge the
  // claim; the source name and link are what let them verify it themselves.
  const SOURCE = "Tanzil Project's Uthmani text (tanzil.net)";

  // content.js has its own pre-check before ever calling checkText (guards
  // against scanning a pathological full page), so this is a backstop there,
  // never actually triggered in normal operation. The MCP server has no such
  // pre-check - it calls checkText directly with whatever text an MCP client
  // hands it - so this is the ONLY guard standing between an oversized input
  // and unbounded work (a large Arabic run feeding the O(n*m) word-diff, for
  // instance). Throwing a distinct, named error - rather than silently
  // returning [] - matters here specifically: an empty array is indistinguishable
  // from "no citation found," which would be a false negative dressed up as a
  // clean result, exactly the kind of misleading confidence this project exists
  // to refuse.
  const MAX_TEXT_LENGTH = 200000;

  function TextTooLongError(length) {
    this.name = 'TextTooLongError';
    this.message = 'Input text is ' + length + ' characters, over the ' + MAX_TEXT_LENGTH + '-character limit.';
    this.length = length;
  }
  TextTooLongError.prototype = Object.create(Error.prototype);

  function validate(surahId, ayah) {
    const s = BY_ID[surahId];
    if (!s) return { valid: false, reason: 'Surah ' + surahId + ' does not exist (Quran has 114 surahs, per ' + SOURCE + ').', source: SOURCE };
    if (ayah < 1 || ayah > s.count) {
      return { valid: false, reason: s.translit + ' (surah ' + surahId + ') has ' + s.count + ' ayat, per ' + SOURCE + '. Ayah ' + ayah + ' does not exist.', surah: s, source: SOURCE };
    }
    return { valid: true, surah: s, text: s.v[ayah - 1], source: SOURCE };
  }

  function diffArabic(quoted, canonical) {
    const nq = normalizeArabic(quoted), nc = normalizeArabic(canonical);
    if (nq === nc) return { verdict: 'exact', detail: 'Matches ' + SOURCE + ' exactly (diacritic-insensitive).' };
    if (nc.includes(nq) || nq.includes(nc)) return { verdict: 'partial', detail: 'Overlaps ' + SOURCE + ' but is not a full/exact match.', wordDiff: wordDiff(canonical, quoted) };
    return { verdict: 'mismatch', detail: 'Does not match ' + SOURCE + ' at this reference.', wordDiff: wordDiff(canonical, quoted) };
  }

  function findCitations(text) {
    init();
    const found = [];
    const claimed = [];

    function tryAdd(m, surahId, ayah, ayahEnd, statedSurahNumber) {
      const start = m.index, end = m.index + m[0].length;
      if (claimed.some(([a, b]) => start < b && end > a)) return;
      claimed.push([start, end]);
      found.push({ raw: m[0], start, end, surahId, ayah, ayahEnd, statedSurahNumber });
    }

    let m;
    // Ranges MUST run before the single-ayah pattern - it's a longer, more
    // specific match, and claiming its full span first stops the single-ayah
    // regex from later matching just the first half of it.
    //
    // Both name-based patterns capture a NUMBER sitting right between the
    // name and the colon (m[2] here) that was previously discarded entirely -
    // the surah id came only from looking up the NAME. That silently hides a
    // real, catchable inconsistency: an AI can write "Al-Fatihah 2:5" (a
    // stray "2" that doesn't match Al-Fatihah's real id of 1), and since
    // ayah 5 is genuinely in-bounds for Al-Fatihah, the citation reads as
    // fully VALID even though the AI plausibly meant Al-Baqarah 2:5 instead -
    // an entirely different verse. Passing the stated number through lets
    // checkText flag the disagreement instead of silently picking a side.
    nameColonRangeRe.lastIndex = 0;
    while ((m = nameColonRangeRe.exec(text))) tryAdd(m, NAME_TO_ID[m[1].toLowerCase()], parseInt(m[3], 10), parseInt(m[4], 10), parseInt(m[2], 10));

    nameColonRe.lastIndex = 0;
    while ((m = nameColonRe.exec(text))) tryAdd(m, NAME_TO_ID[m[1].toLowerCase()], parseInt(m[3], 10), undefined, parseInt(m[2], 10));

    nameVerseRe.lastIndex = 0;
    while ((m = nameVerseRe.exec(text))) tryAdd(m, NAME_TO_ID[m[1].toLowerCase()], parseInt(m[2], 10));

    const kw = /quran|qur.an|surah|ayah|ayat|verse|chapter/i;
    const isTime = (after) => /^\s*(am|pm)\b/i.test(after);

    // Bare range MUST run before bare single-ayah, same reasoning as the
    // name-based pair above: claim the longer "N:N-N" span first so the
    // shorter pattern can't later match just its first half.
    bareRangeRe.lastIndex = 0;
    while ((m = bareRangeRe.exec(text))) {
      const before = text.slice(Math.max(0, m.index - 25), m.index);
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 15);
      if ((kw.test(before) || kw.test(after)) && !isTime(after)) {
        tryAdd(m, parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
      }
    }

    bareRe.lastIndex = 0;
    while ((m = bareRe.exec(text))) {
      const before = text.slice(Math.max(0, m.index - 25), m.index);
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 15);
      if ((kw.test(before) || kw.test(after)) && !isTime(after)) tryAdd(m, parseInt(m[1], 10), parseInt(m[2], 10));
    }

    found.sort((a, b) => a.start - b.start);
    return found;
  }

  // A name-based citation like "Al-Fatihah 2:5" carries a NUMBER between the
  // name and the colon that has nothing to do with the ayah - it's not part
  // of any real citation grammar, but it's exactly the kind of thing that
  // shows up when an AI garbles which surah it means (writing the wrong name
  // next to a number that would have been correct for a DIFFERENT surah).
  // Silently trusting the name and discarding the number hides that. This
  // doesn't try to guess which one is "right" - it surfaces the disagreement
  // so a human checks it, same as everything else this project refuses to
  // resolve unilaterally.
  function nameNumberMismatch(c) {
    if (c.statedSurahNumber === undefined || c.statedSurahNumber === c.surahId) return null;
    const named = BY_ID[c.surahId];
    return {
      statedNumber: c.statedSurahNumber,
      namedSurah: named ? named.translit : null,
      detail: (named ? named.translit : 'surah ' + c.surahId) + ' is actually surah ' + c.surahId + ', not ' + c.statedSurahNumber + ' - the name and the number here disagree. Possibly the wrong surah entirely.',
    };
  }

  function checkText(text) {
    if (text.length > MAX_TEXT_LENGTH) throw new TextTooLongError(text.length);
    init();
    const citations = findCitations(text);
    const arabicAssignments = assignArabicRuns(text, citations);
    return citations.map((c, i) => {
      const mismatch = nameNumberMismatch(c);
      const v = validate(c.surahId, c.ayah);
      if (!v.valid) return { ...c, valid: false, reason: v.reason, source: v.source, nameNumberMismatch: mismatch };

      if (c.ayahEnd) {
        const vEnd = validate(c.surahId, c.ayahEnd);
        if (!vEnd.valid) return { ...c, valid: false, reason: vEnd.reason, source: vEnd.source, nameNumberMismatch: mismatch };
        if (c.ayahEnd < c.ayah) {
          return { ...c, valid: false, reason: 'Ayah range ' + c.ayah + '-' + c.ayahEnd + ' is backwards.', source: v.source, nameNumberMismatch: mismatch };
        }
        const rangeText = v.surah.v.slice(c.ayah - 1, c.ayahEnd).join(' ');
        // Arabic-diffing a multi-ayah range against a possibly-partial quote
        // is a fuzzier problem than a single verse; skip it for now rather
        // than risk a confidently wrong verdict on a real quote.
        return { ...c, valid: true, surah: v.surah, canonicalText: rangeText, arabicCheck: null, source: v.source, nameNumberMismatch: mismatch };
      }

      const assignment = arabicAssignments.get(i);
      const arabicCheck = assignment ? { quoted: assignment.run.text, ...diffArabic(assignment.run.text, v.text) } : null;
      return { ...c, valid: true, surah: v.surah, canonicalText: v.text, arabicCheck, source: v.source, nameNumberMismatch: mismatch };
    });
  }

  return { checkText, validate, findCitations, renderWordDiffHtml, escapeHtml, init, TextTooLongError, MAX_TEXT_LENGTH, get ready() { return !!window.QURAN_DATA; } };
})();
