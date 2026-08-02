# Ground Truth (browser extension)

## What it actually does

- **Auto-scan** on ChatGPT, Claude, Gemini, Grok, Google AI Mode, Perplexity, and Meta AI: watches the page for Quran citations and inserts a small inline `✓`/`?`/`!` marker directly next to each one, right in the response text. Hover or click it to see the verdict, the canonical Arabic, and a word-level diff if something doesn't match.
- **Right-click any selected text on any page** → "Check with Ground Truth" → works universally, not just on the sites above.
- **Toolbar popup**: paste any text manually, same check.

## What it checks (and, just as important, what it doesn't)

- **Reference validity**: does the cited surah:ayah actually exist. Catches things like "Quran 2:290" (Al-Baqarah only has 286 ayat).
- **Arabic exact-match**: if Arabic text is quoted alongside a citation, diffs it (diacritic-insensitive) against the real Tanzil Uthmani text.
- **Name/number mismatch**: catches a stated surah name and a stated number silently disagreeing with each other (e.g. "Al-Fatihah 2:5" - ayah 5 is real, but Al-Fatihah is surah 1, not 2).
- **Does NOT** check hadith yet (no licensed data source access confirmed yet), does NOT judge tafsir or fiqh, does NOT auto-score an English paraphrase as accurate (no single translation is canonical, so that would be a fabricated judgment, not a check).

## Honest design note on the auto-scan

The scan walks the whole page's visible text, not a specific chat bubble. This is deliberate: precisely targeting "just the assistant's message" would require reverse-engineering each site's current DOM structure, which changes often and would need to be verified live, not guessed at. The page-wide scan is more robust and honestly disclosed as such, at the cost of also picking up any citation in your own pasted question. Harmless, since it just checks that one too.

## How to load it (Chrome / Edge / Brave, any Chromium browser)

1. Clone this repo.
2. Go to `chrome://extensions`
3. Toggle **Developer mode** on (top right)
4. Click **Load unpacked**
5. Select this repo's `extension/` folder
6. Visit any of the supported sites and ask it to quote a Quran verse - the inline marker should appear next to the citation within a second or two of the response finishing
7. Or: select any text anywhere, right-click, "Check with Ground Truth"

## Files

- `manifest.json` - MV3 manifest
- `quran-data.js` - bundled Tanzil Uthmani text (CC BY 3.0, 6236 verses), loaded as `window.QURAN_DATA`
- `checker.js` - shared checking engine (citation extraction, reference validation, Arabic diff), reused by content script, selection-check, and popup
- `content.js` - auto-scan, inserts inline badges on the known chat sites
- `inject-selection.js` - renders the result panel for the right-click "check selection" path
- `background.js` - service worker, sets up the context menu
- `popup.html` / `popup.js` - toolbar popup, manual paste
- `icons/` - toolbar and store icons (16/32/48/128px)

## Known rough edges (be honest about these)

- Citation extraction is a heuristic (regex-based), not exhaustive. It handles several real-world phrasings (name+colon, parenthetical, "verse N", bare "N:N" near a keyword, ranges) but will miss unusual ones.
- Not yet published on the Chrome Web Store - load unpacked only, for now.
