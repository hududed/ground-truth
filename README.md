# Ground Truth

Checks whether an AI actually got your Quran citation right: does the reference exist, and does any quoted Arabic match the real text. The name is a wink at the machine-learning term for the verified-correct answer - the discipline underneath it is tabayyun (Quran 49:6): verify the claim, especially the confident one.

**Status:** early working prototype (check `extension/manifest.json` for the current version - status notes here go stale fast, the manifest doesn't). Not published to any extension store yet - load unpacked for now.

## What it does

- **Reference validity** - catches citations that don't exist (e.g. "Quran 2:290" when Al-Baqarah only has 286 ayat).
- **Arabic exact-match** - if Arabic text is quoted alongside a citation, diffs it (diacritic-insensitive) against the real Tanzil Uthmani text.
- **Does not** check hadith yet (no licensed data source confirmed), does not judge tafsir or fiqh, does not auto-score an English paraphrase (no single translation is canonical, so that would be a fabricated judgment).

## Roadmap

v1 ships two checks today, both already working in the extension: does the Quran reference actually exist, and does any quoted Arabic match the real text.

The next thing planned for v1 is hadith existence and attribution: checking whether a cited hadith exists in a named canonical collection, cross-referenced against sunnah.com and dorar.net. This isn't built yet. The contact details and access terms for both sources have already been researched; the actual request for API access just hasn't been sent.

Past that, everything sits in v2+, and it's gated behind something no amount of engineering can substitute for: hasan/da'if grading nuance, fiqh rulings, tafsir or interpretation, isnad/rijal chain authentication, and fatwa-humility scoring all require a named, qualified scholar to review and sign off on the specific items before any of it ships. That's not caution for its own sake. A citation checker that quietly starts grading hadith authenticity or weighing in on fiqh stops being a citation checker - it becomes an accidental claim to religious authority, without anyone deciding that on purpose. v1 sidesteps this entirely by only diffing against sources everyone already treats as canonical. v2 doesn't get to skip the same discipline just because it's harder to build around.

If you're a scholar willing to sanity-check a small, narrow set of items (does this exist, is this grading accurate - not a fatwa), or an engineer who wants to help wire up the sunnah.com/dorar.net integration, see CONTRIBUTING.md.

## Structure

- `extension/` - the actual product: a Chromium browser extension (Manifest V3). Auto-scans ChatGPT, Claude, Gemini, Grok, Google AI Mode, Perplexity, and Meta AI, inserting a small inline `✓`/`?`/`!` marker directly next to each citation. Also works via right-click "Check with Ground Truth" on any selected text, on any page. See `extension/README.md` to load it.
- `mcp-server/` - the same checking engine (`extension/checker.js`, reused directly) exposed as an MCP tool for Claude Desktop, Claude Code, Cursor, and other MCP-compatible clients - a different audience than the browser extension: an AI agent can call this to self-check its own citation before ever showing it to a human. See `mcp-server/README.md`.
- `test/checker.test.js` - the primary, deterministic regression suite (zero dependencies, runs in under a second). `test/e2e.js` - a real-Chromium automated test suite (via Puppeteer, dev-only) that drives the actual popup and content-script logic against a real unpacked build.
- `SECURITY.md` - the security posture, including a real finding from self-auditing (an XSS gap, found and fixed) rather than just a list of asserted good properties.
- `CONTRIBUTING.md` + `.github/ISSUE_TEMPLATE/edge-case.yml` - how anyone (no coding required) reports a real AI-citation failure, what an automated pass can safely do on its own, and the one governance line that never moves (no fix merges without a human, and hadith/fiqh/tafsir reports get escalated to a scholar, never auto-fixed).
- `data/` - the raw, verified Tanzil Uthmani source text and the processed/compact JSON derived from it, kept for provenance and reproducibility.

## The hard boundary

No hadith grading, no fiqh ruling, no tafsir, and no fatwa-humility scoring gets built or shipped without a named, qualified scholar reviewing and signing off on the specific items in writing, first, every time. This project generates zero new religious ground truth on its own; it only checks against sources that are already public and already authoritative (Tanzil for Quran text; a confirmed, licensed hadith source, not yet secured, for hadith).

## License note on bundled data

`extension/quran-data.js` and `data/tanzil-uthmani-raw.txt` are the Tanzil Project's Uthmani Quran text, Creative Commons Attribution 3.0. Redistributed here per Tanzil's terms: verbatim, unaltered, with attribution.
