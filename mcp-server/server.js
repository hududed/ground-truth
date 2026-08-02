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
requireCheckerFile('hadith-data.js');
requireCheckerFile('hadith-checker.js');
const checker = global.GroundTruthChecker;
const hadithChecker = global.GroundTruthHadithChecker;

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

function formatHadithResult(r) {
  const lines = [`"${r.raw}"`];
  lines.push(`  Detected: ${r.collection}${r.book ? ', Book ' + r.book : ''}, Hadith ${r.number}${r.subLetter || ''}${r.narrator ? ' (narrated by ' + r.narrator + ')' : ''}`);
  lines.push(`  Reference check: ${r.reason}`);
  if (r.quoteCheck) {
    const qc = r.quoteCheck;
    lines.push(`  Quoted wording "${qc.quotedPhrase}": ${qc.status.toUpperCase()} - ${qc.reason}`);
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
      'Use this any time a Quran reference needs checking: call it on your own drafted response before showing a citation to a user, or when the user pastes or quotes text themselves and asks you to check, verify, or fact-check the citation(s) in it - phrases like "check these citations", "is this verse real", or "verify this quote" all mean call this tool on the given text.',
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

server.registerTool(
  'check_hadith_citation',
  {
    title: 'Check hadith citation',
    description:
      "Checks hadith citations in the given text. Two genuinely different things this does and does not do: (1) detects the citation (collection, number, narrator) but does NOT yet verify whether that specific collection+number reference exists - that needs sunnah.com/dorar.net data access, not yet available, and is reported honestly as such, never guessed. " +
      '(2) if the hadith\'s wording is also quoted nearby, checks that exact phrase against hadeethenc.com\'s public search API (a real, live network call - the only one this project makes) and reports a scored, sourced verdict on whether that wording exists anywhere in that public encyclopedia. ' +
      'Deterministic scoring, not an AI judgment call. Does not grade authenticity (sahih/hasan/da\'if), does not judge fiqh. ' +
      'Use this any time a hadith citation needs checking: call it on your own drafted response before showing a citation to a user, or when the user pastes or quotes text themselves and asks you to check, verify, or fact-check a hadith in it.',
    inputSchema: {
      text: z.string().describe('The text to scan for hadith citations, e.g. a drafted response quoting or referencing a hadith.'),
    },
  },
  async ({ text }) => {
    let results;
    try {
      results = await hadithChecker.checkHadithText(text);
    } catch (e) {
      if (e instanceof hadithChecker.HadithTextTooLongError) {
        return {
          content: [{
            type: 'text',
            text: 'Input is ' + e.length + ' characters, over the ' + hadithChecker.MAX_TEXT_LENGTH + '-character limit this tool checks. ' +
              'Pass a shorter excerpt rather than the full text.',
          }],
        };
      }
      throw e;
    }
    if (!results.length) {
      return { content: [{ type: 'text', text: 'No hadith citation detected in the given text.' }] };
    }
    const summary = results.map(formatHadithResult).join('\n\n');
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
