#!/usr/bin/env node
// MCP server exposing Ground Truth's citation-fidelity engine to any
// MCP-compatible client (Claude Desktop, Claude Code, Cursor, etc). This is
// a genuinely different audience from the browser extension: an AI AGENT
// can call this tool to self-check its own citation BEFORE showing it to a
// human, instead of the human needing an extension to catch the mistake
// after the fact.
//
// Reuses extension/checker.js directly - the exact same deterministic
// engine the browser extension uses, not a reimplementation. checker.js
// only assumes a `window` global (no real DOM APIs), which is why it has
// been runnable under plain Node throughout this project's own test suite.

const path = require('path');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

// Local dev (inside the monorepo) reads straight from ../extension/, the
// real source of truth. A published npm package only contains its own
// folder, so it ships a vendored copy instead (see build-vendor.js, run via
// the prepack lifecycle hook) - falling back to it here means one code path
// works in both contexts without duplicating source in git.
function requireCheckerFile(name) {
  const monorepoPath = path.join(__dirname, '..', 'extension', name);
  const vendoredPath = path.join(__dirname, 'vendor', name);
  require(require('fs').existsSync(monorepoPath) ? monorepoPath : vendoredPath);
}

global.window = global;
requireCheckerFile('quran-data.js');
requireCheckerFile('checker.js');
const checker = global.GroundTruthChecker;

function formatResult(r) {
  const lines = [`"${r.raw}"`];
  if (!r.valid) {
    lines.push(`  INVALID - ${r.reason}`);
    return lines.join('\n');
  }
  if (r.nameNumberMismatch) {
    lines.push(`  NAME/NUMBER MISMATCH - ${r.nameNumberMismatch.detail}`);
  }
  lines.push(`  Reference valid: ${r.surah.translit}, ayah ${r.ayah} of ${r.surah.count} (source: ${r.source})`);
  lines.push(`  Canonical Arabic: ${r.canonicalText}`);
  if (r.arabicCheck) {
    lines.push(`  Arabic quoted nearby - verdict: ${r.arabicCheck.verdict.toUpperCase()} - ${r.arabicCheck.detail}`);
    if (r.arabicCheck.wordDiff) {
      const extra = r.arabicCheck.wordDiff.filter(d => d.type === 'extra').map(d => d.word);
      const missing = r.arabicCheck.wordDiff.filter(d => d.type === 'missing').map(d => d.word);
      if (extra.length) lines.push(`  Words in the quote NOT in the real ayah: ${extra.join(', ')}`);
      if (missing.length) lines.push(`  Words in the real ayah MISSING from the quote: ${missing.join(', ')}`);
    }
  } else {
    lines.push('  No Arabic quoted nearby - English paraphrase accuracy is not auto-checked (no single translation is canonical).');
  }
  return lines.join('\n');
}

const server = new McpServer({ name: 'ground-truth', version: '0.1.0' });

server.registerTool(
  'check_quran_citation',
  {
    title: 'Check Quran citation',
    description:
      "Checks whether Quran citations in the given text actually exist and, if Arabic is quoted, whether it matches the real canonical text (Tanzil Project's Uthmani text, CC BY 3.0). " +
      'Deterministic - a fixed lookup against licensed source text, not an AI judgment call. Does not check hadith, does not judge tafsir or fiqh, does not score English paraphrase accuracy. ' +
      'Call this on your own drafted response before showing a Quran citation to a user, to catch a wrong reference or altered Arabic before it ships.',
    inputSchema: {
      text: z.string().describe('The text to scan for Quran citations, e.g. a drafted response quoting or referencing a verse.'),
    },
  },
  async ({ text }) => {
    let results;
    try {
      results = checker.checkText(text);
    } catch (e) {
      if (e instanceof checker.TextTooLongError) {
        return {
          content: [{
            type: 'text',
            text: 'Input is ' + e.length + ' characters, over the ' + checker.MAX_TEXT_LENGTH + '-character limit this tool checks. ' +
              'Pass a shorter excerpt (the specific paragraph or answer containing the citation, not an entire document) rather than the full text.',
          }],
        };
      }
      throw e;
    }
    if (!results.length) {
      return { content: [{ type: 'text', text: 'No Quran citation detected in the given text.' }] };
    }
    const summary = results.map(formatResult).join('\n\n');
    return { content: [{ type: 'text', text: summary }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(e => {
  console.error('ground-truth MCP server failed to start:', e);
  process.exit(1);
});
