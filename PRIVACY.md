# Privacy policy

Ground Truth does not collect, store, or track anything about you. One check does send a small piece of text to an external, public API - read exactly which one and why below, rather than take a blanket claim on faith.

## Quran checking: fully local, no network call

On the sites it's permitted to run on (ChatGPT, Claude, Gemini, Grok, Google AI Mode, Perplexity, Meta AI), the extension reads the visible text of the page, entirely in your own browser, to find Quran citations and check them. That check runs against the Tanzil Project's Uthmani Quran text, which is bundled directly inside the extension (`extension/quran-data.js`) - there is no live network request involved in checking a Quran citation. Nothing about the page you're on, what you searched for, or what an AI said to you is sent anywhere for this check.

The same is true for the right-click "Check with Ground Truth" feature on any selected text on any page, and for the toolbar popup: the Quran check runs locally, on-demand, against the same bundled data.

## Hadith checking: one real network call, disclosed plainly

If the text you're checking cites a hadith AND quotes its wording nearby, Ground Truth sends **only that quoted phrase** (not the surrounding page, not the citation itself, not anything else) to `hadeethenc.com`'s public search API, to check whether a hadith with that wording exists in their public Hadith Encyclopedia. This is the only network call this project makes anywhere, and it only happens when a hadith quote is actually present - checking a Quran citation, or a hadith citation with no quote nearby, never triggers it.

What this means concretely: that specific snippet of text is visible to hadeethenc.com's server, the same way it would be for any web search you typed yourself. No cookies, no identifier, no account association are sent alongside it - it's a single anonymous request. This does not (yet) confirm whether a specific collection+number reference (e.g. "is this really Bukhari #1234") is correct - that still requires data access this project doesn't have (see below).

## What Ground Truth does NOT do

- No analytics, no telemetry, no tracking pixels, no third-party scripts loaded onto any page.
- No account, no login, no user identifier of any kind, on either check.
- No browsing history is read, stored, or transmitted.
- No remote code execution (disallowed by Manifest V3 itself, but worth stating plainly).
- Collection+number hadith verification (e.g. confirming a specific Bukhari/Muslim reference number) is not implemented yet - that needs sunnah.com/dorar.net data access, not yet granted. No network call happens for this part; it's an honest "not yet available" result, not a guess.

## The MCP server

The MCP server (`mcp-server/`) is a separate component from the browser extension, run locally on your own machine by you, for use with your own AI tooling (Claude Desktop, Claude Code, Cursor, etc.). It communicates over local stdio with the MCP client that launched it, and makes the same single hadeethenc.com call described above, only when a hadith quote is present to check - otherwise it sends nothing over the network.

## Permissions, explained

- `activeTab`, `scripting` - needed to read the current page's text and insert the small inline check marks.
- `contextMenus` - needed for the right-click "Check with Ground Truth" option.
- Host permissions (the specific AI sites listed above, plus `hadeethenc.com` for the hadith quote-check) - needed so the extension can automatically scan those pages and make that one lookup. Not granted access to any other site.

## Changes

If this changes further - for example, once sunnah.com/dorar.net access is granted for collection+number verification - this file gets updated first, and the change gets named plainly, not buried.
