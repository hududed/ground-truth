// Real MCP integration test: spawns the actual server.js as a subprocess and
// talks to it via the real MCP Client + StdioClientTransport, exactly how
// Claude Desktop/Claude Code/Cursor would - not a direct function call into
// server internals. Run with: node test.js

const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

let pass = 0, fail = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS -', label); }
  else { fail++; console.log('  FAIL -', label, detail || ''); }
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, 'server.js')],
  });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(transport);

  console.log('[1] Tool discovery');
  const { tools } = await client.listTools();
  ok('check_quran_citation tool is registered', tools.some(t => t.name === 'check_quran_citation'));
  ok('check_hadith_citation tool is registered', tools.some(t => t.name === 'check_hadith_citation'));

  console.log('\n[2] Valid + invalid citations in one call');
  const r1 = await client.callTool({
    name: 'check_quran_citation',
    arguments: { text: 'The Quran says in Al-Baqarah 2:255 that Allah is the sustainer. One AI told me Quran 2:290 forbids lying.' },
  });
  const text1 = r1.content[0].text;
  ok('reports Al-Baqarah 2:255 as valid', /2:255/.test(text1) && /Reference valid/.test(text1));
  ok('reports 2:290 as invalid with the real reason', /2:290/.test(text1) && /INVALID/.test(text1) && /does not exist/.test(text1));
  ok('names the source standard', /Tanzil Project/.test(text1));

  console.log('\n[3] Name/number mismatch via MCP');
  const r2 = await client.callTool({
    name: 'check_quran_citation',
    arguments: { text: 'The verse Al-Fatihah 2:5 is well known.' },
  });
  const text2 = r2.content[0].text;
  ok('flags the name/number mismatch', /NAME\/NUMBER MISMATCH/.test(text2) && /Al-Fatihah is actually surah 1/.test(text2));

  console.log('\n[4] Arabic mismatch with word-level explanation via MCP');
  const r3 = await client.callTool({
    name: 'check_quran_citation',
    arguments: { text: 'quran 93:5 says: وَلَسَوْفَ يُعْطِيكَ الْمَلِكُ فَتَرْضَىٰ' },
  });
  const text3 = r3.content[0].text;
  ok('reports a mismatch verdict', /MISMATCH/.test(text3));
  ok('explains which words differ', /NOT in the real ayah/.test(text3) && /MISSING from the quote/.test(text3));

  console.log('\n[5] No citation present');
  const r4 = await client.callTool({ name: 'check_quran_citation', arguments: { text: 'Just a normal sentence.' } });
  ok('reports no citation detected', /No Quran citation detected/.test(r4.content[0].text));

  console.log('\n[6] Oversized input over the network - the real gap this test closes');
  // Unlike the browser extension (content.js pre-filters before ever calling
  // checkText), the MCP server has no size guard of its own - a client can
  // hand it anything. This proves an oversized input gets a clear, honest
  // "too long" response over the real MCP transport, not a hang, a crash, or
  // a silent (and misleading) "no citation detected".
  const oversized = 'x'.repeat(200001);
  const r5 = await client.callTool({ name: 'check_quran_citation', arguments: { text: oversized } });
  const text5 = r5.content[0].text;
  ok('reports the input as too long, with the actual limit named', /200001/.test(text5) && /200000/.test(text5));
  ok('does NOT misreport an oversized input as simply "no citation detected"', !/No Quran citation detected/.test(text5));

  console.log('\n[7] Hadith citation detection + reference stub, over the real MCP transport');
  const r6 = await client.callTool({
    name: 'check_hadith_citation',
    arguments: { text: 'This is discussed in Sahih al-Bukhari 1234.' },
  });
  const text6 = r6.content[0].text;
  ok('detects the citation', /Bukhari/.test(text6) && /1234/.test(text6));
  ok('reference check is the honest not-yet-available stub, not a guessed verdict', /not yet available/i.test(text6) && /pending/i.test(text6));

  console.log('\n[8] Hadith quoted-phrase verification via hadeethenc.com, over the real MCP transport (real network call)');
  const r7 = await client.callTool({
    name: 'check_hadith_citation',
    arguments: { text: 'The Prophet said: "Actions are but by intentions" - Sahih al-Bukhari 1.' },
  });
  const text7 = r7.content[0].text;
  ok('reports a quoted-wording verdict citing HadeethEnc', /Quoted wording/.test(text7) && /HadeethEnc/i.test(text7));

  console.log('\n[9] No hadith citation present');
  const r8 = await client.callTool({ name: 'check_hadith_citation', arguments: { text: 'Just a normal sentence.' } });
  ok('reports no hadith citation detected', /No hadith citation detected/.test(r8.content[0].text));

  await client.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('MCP integration test crashed:', e); process.exit(1); });
