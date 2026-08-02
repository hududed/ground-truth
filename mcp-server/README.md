# Ground Truth MCP server

Exposes the exact same citation-checking engine the browser extension uses (`extension/checker.js`, reused directly, not reimplemented) as an MCP tool any MCP-compatible client can call: Claude Desktop, Claude Code, Cursor, and others.

**Why this exists, separately from the browser extension:** the extension solves "a human reading a chat transcript in a browser tab gets warned about a wrong citation." This solves a different problem: **an AI agent can call this tool to self-check its own citation before ever showing it to a human**, catching the mistake at the source instead of after the fact. It reaches a different audience too - people using agentic tools, not people browsing chatgpt.com in a tab. It does not replace or simplify the extension; the extension still has to solve DOM injection for ordinary browser users regardless of whether this exists.

## Install

Published on npm: [`@hududed/ground-truth-mcp`](https://www.npmjs.com/package/@hududed/ground-truth-mcp). No local clone needed - `npx` fetches and runs it directly.

## Configure in Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "ground-truth": {
      "command": "npx",
      "args": ["-y", "@hududed/ground-truth-mcp"]
    }
  }
}
```

Restart Claude Desktop. Ask it to quote a Quran verse, then ask it to check its own answer with Ground Truth.

## Configure in Claude Code

```bash
claude mcp add ground-truth -- npx -y @hududed/ground-truth-mcp
```

## Local development (inside this repo, instead of the published package)

```bash
cd mcp-server
npm install
node test.js   # spawns the real server as a subprocess, calls it via the actual MCP client/stdio transport - not a shortcut
```

To point Claude Desktop/Code at your local checkout instead of the published package, use `"command": "node", "args": ["/absolute/path/to/ground-truth/mcp-server/server.js"]` in place of the `npx` line above.

## The tools this exposes

- `check_quran_citation(text)` - scans the given text for Quran citations and returns, per citation: whether the reference exists, the canonical Arabic text and its source, whether any quoted Arabic matches exactly (with a word-level explanation if not), and whether the surah name and a stated number disagree.
- `check_hadith_citation(text)` - scans for hadith citations (e.g. "Sahih al-Bukhari, Hadith 1"). Two genuinely different questions, two different answers: confirming the specific collection+number reference is still an honest `not_yet_available` stub (needs sunnah.com/dorar.net access, not yet granted); if the AI also quoted the hadith's wording nearby, that exact phrase gets checked live against HadeethEnc.com's public search API and returns a real, scored verdict (`confirmed` / `no_confident_match` / `no_match` / `lookup_failed`) - see `extension/hadith-checker.js` for the scoring discipline.

Same hard boundary as everything else in this project: no fiqh, no tafsir, no hadith grading, no scoring of English paraphrase accuracy. These tools answer "does this citation check out against a fixed, licensed source," never "is this interpretation correct."

## Manual QA (no MCP client needed)

To sanity-check the hadith checker directly against arbitrary text, without setting up Claude Desktop/Code or any MCP client:

```bash
node test/manual-check-hadith.js "The Prophet said, \"Actions are but by intentions\" (Sahih al-Bukhari, Hadith 1)"
```

Prints exactly what the checker detected (collection, number, narrator) and the real, live HadeethEnc verdict on any quoted wording, with the reason spelled out. Also works piped: `echo "..." | node test/manual-check-hadith.js`.

To QA it end-to-end through the actual MCP transport instead (closer to how a real client uses it): `node mcp-server/test.js` spawns the real server as a subprocess and calls it over real stdio, or configure a live client (see Install above) and ask it to quote a hadith, then ask it to check that citation with Ground Truth.
