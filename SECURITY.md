# Security posture

This document states what Ground Truth actually does, what it doesn't, and what independent checks exist for a user (or reviewer) to verify these claims rather than take them on faith. Every claim below was checked against a primary source before being written here - see the citations at the bottom. Where a real trust mechanism turned out to be weaker than it sounds, that's said plainly rather than omitted.

## What this extension actually does, verifiable by reading the code

- **No remote code.** Every script that runs is shipped inside the extension package (`quran-data.js`, `checker.js`, `content.js`, `background.js`, `inject-selection.js`, `popup.js`). Nothing is fetched from a server and executed. This isn't just a policy choice - Manifest V3 bans remotely-hosted code outright, with three narrow, opt-in exceptions (dev-mode User Scripts API, `chrome.debugger` with a warning banner, sandboxed iframes), none of which this extension uses. [1][2]
- **No network calls at all.** The Quran text dataset (`extension/quran-data.js`) is bundled statically at build time from the Tanzil Project's CC BY 3.0 text (see `README.md`). There is no `fetch`, no `XMLHttpRequest`, anywhere in the codebase - grep it yourself.
- **Scoped permissions, not broad ones.** `host_permissions` names 8 specific sites, not `<all_urls>` or `*://*/*`. The `permissions` list is `contextMenus`, `scripting`, `activeTab` - no `storage`, no `tabs`, no bulk history/bookmark access. Chrome's own review process gives broad host permissions "extended scrutiny" specifically because they grant wide access to browsing activity; this extension doesn't ask for that. [1]
- **No data collection, no analytics, no telemetry.** Nothing is written to `chrome.storage`, nothing is sent anywhere. There is no privacy policy requirement gap here because there is no data to have a policy about - but a privacy policy stating exactly that will still be published before any store listing, since Chrome requires one regardless. [3]

## Independent checks a skeptical user (or you) can run today

None of these require trusting this document - each is something a reviewer can do without needing anything from the author:

1. **Read the source.** The entire extension is public, in this repo, unminified, uncompiled, with a real commit history. This is the same bar uBlock Origin's own trust FAQ sets for itself: developed "in full public view," no home server, no ability to phone home. [4]
2. **Grep for network calls.** `grep -rn "fetch\|XMLHttpRequest\|XHR" extension/` should return nothing. Anyone can verify this themselves in under a minute.
3. **Unzip the shipped package and diff it against this repo.** Since there's no build step, what's in `extension/` is exactly what loads in the browser - nothing to obscure in a bundler step.
4. **Run it through an independent scanner.** [Spin.AI's free SpinMonitor](https://spin.ai/application-risk-assessment/) (10 free lookups/day, scores across 15+ factors) or [ExtAnalysis](https://github.com/Tuhinshubhra/ExtAnalysis) (actively maintained open-source CRX analyzer, permission/network/CSP checks) are both real, current, and free to point at the packaged extension once it's built. This is on the roadmap before any public listing.

## What NOT to trust as a safety guarantee (and why)

Being direct about this matters more than listing badges, since an inflated trust claim is exactly the kind of thing this whole project exists to catch elsewhere.

- **Chrome Web Store's "Featured" and "Established Publisher" badges are not proof of code safety.** In January 2026, two Chrome extensions were caught stealing ChatGPT and DeepSeek conversation data from roughly 900,000 users - one of them still carried the Featured badge at the time it was caught. [5][6] These badges signal review-process compliance and publisher tenure, not an audit of what the code does at runtime. This extension will pursue them where relevant, but won't cite them as a safety claim.
- **CRXcavator is dead.** It's cited all over older extension-security writeups; the domain no longer resolves to a working server. Don't trust any guidance that still points to it as a live tool.
- **OWASP ASVS has no browser-extension chapter.** It's excellent for generic web/API security but doesn't cover this threat model. The relevant, current OWASP reference is the **Browser Extension Vulnerabilities Cheat Sheet** (part of the Cheat Sheet Series, a Flagship-tier OWASP project), not ASVS and not the OWASP Browser Security Project (which is explicitly an early-stage Incubator project, not a finished standard). [7]

## Checked against Chrome's own MV3 security migration guidance

- No use of `eval()`, `new Function()`, or dynamic code execution of any kind. [2]
- Extension-page CSP defaults apply (`self`/`none`/`wasm-unsafe-eval` only) - nothing in this codebase needs to loosen that.
- A service worker (`background.js`), not a persistent background page - removes the always-on background-page attack surface MV3 was partly designed to eliminate. [2]

## A real finding from self-auditing against the OWASP cheat sheet above

Writing this document is only worth something if it's backed by evidence of actually looking, not just asserting good properties. Here's a real one, found by going back and checking this project's own UI code against the OWASP guidance cited above ("avoid `innerHTML` in favor of `textContent`"):

`popup.js`, `inject-selection.js`, and `checker.js`'s word-diff renderer all built HTML via template-literal `innerHTML` with no escaping - including citation text extracted from the pages this extension scans, and (in the word-diff case) Arabic text extracted from the AI response itself. A concrete reproduction confirmed no live exploit exists *today*, because the citation-matching regexes happen to be character-class-constrained to digits, known surah names, and a narrow punctuation set, and the Arabic-extraction regex only matches the Arabic Unicode block plus whitespace - none of these can currently capture `<`, `>`, `"`, or `&`.

That's an accident of the current regex definitions, not a designed protection, and it would silently stop being true the moment any future change loosens a pattern to catch a new citation format - with nothing to catch the regression. Fixed by adding an explicit `escapeHtml()` function and applying it to every dynamic value at every `innerHTML` call site, plus two tests in `test/checker.test.js` that call the rendering functions directly with a hostile payload (bypassing the regex layer entirely) rather than testing only through the extractor - so the escaping is verified independent of whatever the current regexes happen to allow through.

## If a real third-party audit becomes worth pursuing

Professional security audits (e.g. by firms like Cure53) are real and do happen for small open-source projects, typically arranged through a sponsor like [OSTIF](https://ostif.org) (Open Source Technology Improvement Fund) rather than paid for directly by a solo developer. [8] This is a real, verified path forward if the project's reach and stakes grow enough to justify it - not something to claim prematurely.

## Sources

1. [Chrome Web Store review process](https://developer.chrome.com/docs/webstore/review-process)
2. [Improve extension security (Manifest V3 migration)](https://developer.chrome.com/docs/extensions/develop/migrate/improve-security) / [Deal with remote hosted code violations](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)
3. [Chrome Web Store privacy policy requirements](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
4. [Can you trust uBlock Origin? (gorhill's own FAQ)](https://github.com/gorhill/uBlock/wiki/Can-you-trust-uBlock-Origin%3F)
5. [Two Chrome extensions caught stealing ChatGPT/DeepSeek conversations - The Hacker News, Jan 2026](https://thehackernews.com/2026/01/two-chrome-extensions-caught-stealing.html)
6. [OX Security's writeup of the same incident](https://www.ox.security/blog/malicious-chrome-extensions-steal-chatgpt-deepseek-conversations/)
7. [OWASP Browser Extension Vulnerabilities Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Browser_Extension_Vulnerabilities_Cheat_Sheet.html)
8. [Cure53](https://cure53.de) / [OSTIF](https://ostif.org)
