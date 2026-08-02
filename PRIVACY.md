# Privacy policy

Ground Truth does not collect, store, or transmit any user data, anywhere.

## What the extension actually does with page content

On the sites it's permitted to run on (ChatGPT, Claude, Gemini, Grok, Google AI Mode, Perplexity, Meta AI), the extension reads the visible text of the page, entirely in your own browser, to find Quran citations and check them. That check runs against the Tanzil Project's Uthmani Quran text, which is bundled directly inside the extension (`extension/quran-data.js`) - there is no live network request involved in checking a citation. Nothing about the page you're on, what you searched for, or what an AI said to you is sent anywhere.

The same is true for the right-click "Check with Ground Truth" feature on any selected text on any page: the check runs locally, on-demand, against the same bundled data.

## What the extension does NOT do

- No analytics, no telemetry, no tracking pixels, no third-party scripts.
- No account, no login, no user identifier of any kind.
- No browsing history is read, stored, or transmitted.
- No remote code execution (disallowed by Manifest V3 itself, but worth stating plainly).

## The MCP server

The MCP server (`mcp-server/`) is a separate component from the browser extension, run locally on your own machine by you, for use with your own AI tooling (Claude Desktop, Claude Code, Cursor, etc.). It communicates only over local stdio with the MCP client that launched it. It sends nothing over the network and collects nothing.

## Permissions, explained

- `activeTab`, `scripting` - needed to read the current page's text and insert the small inline check marks.
- `contextMenus` - needed for the right-click "Check with Ground Truth" option.
- Host permissions (the specific AI sites listed above) - needed so the extension can automatically scan those pages. It is not granted access to any other site.

## Changes

If this ever changes - for example, when hadith-checking is added and a live lookup against a licensed source becomes necessary - this file will be updated first, and the change will be named plainly, not buried.
