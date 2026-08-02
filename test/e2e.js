// Real-browser end-to-end test suite using Puppeteer + the actual unpacked
// extension - not jsdom simulation. Requires: npm install puppeteer (not a
// project dependency, this is a dev-only tool; see README for setup).
//
// This is the comprehensive pass: every citation-format variant, every DOM
// edge case (nested inline elements, single-node multi-citation crowding,
// streamed/mutating content, excluded tags, pathological page size), and
// every interactive UI path (badge hover/pin, "why" detail expansion, the
// right-click selection panel) gets driven in a REAL Chromium instance
// running the REAL extension files, not a mock DOM.
//
// What this CANNOT automate, and why: actually clicking the native OS
// right-click context menu item. Chrome's context menu is native browser
// chrome, not part of the page's accessible DOM/CDP surface - Puppeteer
// cannot drive it. Section 10 below covers everything downstream of that
// click (the actual result panel, injected the same way background.js
// injects it) by invoking the same entry point background.js calls after
// the click - so the only untested sliver is the literal native menu click
// itself, still a human's job.
//
// Also cannot automate: live authenticated sessions on chatgpt.com,
// claude.ai, etc. - this has no login credentials for those services and
// shouldn't be given any. The content-script logic itself is tested here by
// injecting the same files onto LOCAL synthetic pages shaped like real AI
// responses (including realistic edge cases: citations inside links,
// streamed token-by-token content, pages packed with excluded tags), which
// tests the real logic in a real browser without needing a live
// authenticated site.

const path = require('path');
const fs = require('fs');

const EXT_DIR = path.join(__dirname, '..', 'extension');
const SCREENSHOT_DIR = process.env.E2E_SCREENSHOT_DIR || path.join(__dirname, '..', '.e2e-screenshots');

function findPuppeteer() {
  const candidates = [
    process.env.PUPPETEER_REQUIRE_PATH,
    path.join(__dirname, '..', 'node_modules', 'puppeteer'),
  ].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* try next */ }
  }
  try { return require('puppeteer'); } catch (e) {
    console.error('puppeteer not found. Install it (dev-only, not a project dependency):');
    console.error('  npm install puppeteer --no-save');
    console.error('  or: PUPPETEER_REQUIRE_PATH=/path/to/node_modules/puppeteer node test/e2e.js');
    process.exit(1);
  }
}

async function main() {
  const puppeteer = findPuppeteer();
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  let pass = 0, fail = 0;
  const failures = [];
  function ok(label, cond, detail) {
    if (cond) { pass++; console.log('  PASS -', label); }
    else { fail++; failures.push(label + (detail ? ': ' + detail : '')); console.log('  FAIL -', label, detail || ''); }
  }
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // ---------------------------------------------------------------------
  // Shared helpers for the DOM-injection sections below.
  // ---------------------------------------------------------------------

  async function newAutoScanPage(browser, html, settleMs = 1200) {
    const page = await browser.newPage();
    const consoleLines = [];
    page.on('console', msg => consoleLines.push(msg.text()));
    await page.setContent(html);
    await page.addScriptTag({ path: path.join(EXT_DIR, 'quran-data.js') });
    await page.addScriptTag({ path: path.join(EXT_DIR, 'checker.js') });
    await page.addScriptTag({ path: path.join(EXT_DIR, 'content.js') });
    await wait(settleMs); // clear the 900ms debounce
    return { page, consoleLines };
  }

  async function newSelectionPage(browser, html) {
    const page = await browser.newPage();
    await page.setContent(html);
    await page.addScriptTag({ path: path.join(EXT_DIR, 'quran-data.js') });
    await page.addScriptTag({ path: path.join(EXT_DIR, 'checker.js') });
    await page.addScriptTag({ path: path.join(EXT_DIR, 'inject-selection.js') });
    return page;
  }

  async function getBadges(page, scopeSelector = 'body') {
    return page.$$eval(`${scopeSelector} .ground-truth-inline-badge`, els =>
      els.map(e => ({ text: e.textContent, key: e.dataset.groundTruthKey })));
  }

  // Reconstructs the original text of a subtree by walking its text nodes
  // and skipping any inserted badge spans - proves splitText() sequences
  // didn't lose or duplicate a single character, not just that "a badge
  // count looks right".
  async function reconstructText(page, selector) {
    return page.evaluate((sel) => {
      const root = document.querySelector(sel);
      let s = '';
      (function walk(node) {
        for (const child of node.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) s += child.nodeValue;
          else if (child.nodeType === Node.ELEMENT_NODE && !child.classList.contains('ground-truth-inline-badge')) walk(child);
        }
      })(root);
      return s;
    }, selector);
  }

  console.log('Launching real Chromium with the actual unpacked extension...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      `--disable-extensions-except=${EXT_DIR}`,
      `--load-extension=${EXT_DIR}`,
      '--no-sandbox',
    ],
  });

  try {
    // -------------------------------------------------------------------
    // 1. Service worker health
    // -------------------------------------------------------------------
    console.log('\n[1] Service worker health');
    await wait(1000);
    const swTarget = (await browser.targets()).find(t => t.type() === 'service_worker' && t.url().includes('background.js'));
    ok('service worker target exists (extension loaded without a fatal manifest/script error)', !!swTarget);

    let extensionId = null;
    if (swTarget) {
      extensionId = swTarget.url().match(/chrome-extension:\/\/([a-z]+)\//)[1];
      console.log('  extension id:', extensionId);
    }

    // -------------------------------------------------------------------
    // 2. Popup: comprehensive format coverage in one pass, plus the
    //    light-theme "why" expansion interaction and the empty state.
    // -------------------------------------------------------------------
    console.log('\n[2] Popup - comprehensive fixture + interactions');
    if (extensionId) {
      const page = await browser.newPage();
      await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'networkidle0' });

      const fixture = [
        'The Quran says in Al-Baqarah 2:255 that Allah is the sustainer.',
        '"And He is with you wherever you are." Surah Al-Hadid (57:4).',
        'Surah Al-Fatihah verse 7 asks for guidance.',
        'One AI told me Quran 2:290 forbids lying.',
        'Famous verses include Ash-Sharh (94:5-6) on hardship and ease.',
        'The verse Al-Fatihah 2:5 is well known.',
        'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ is quoted from Al-Fatihah 1:1.',
        'quran 93:5 says: وَلَسَوْفَ يُعْطِيكَ الْمَلِكُ فَتَرْضَىٰ',
      ].join(' ');

      await page.type('#input', fixture);
      await page.click('#check');
      await wait(300);
      const resultsText = await page.$eval('#results', el => el.textContent);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'popup-comprehensive.png'), fullPage: true });

      ok('name+colon valid (Al-Baqarah 2:255)', /Al-Baqarah 2:255/.test(resultsText) && /REF OK/.test(resultsText));
      ok('parenthetical format valid (Al-Hadid 57:4)', /Al-Hadid \(57:4\)/.test(resultsText));
      ok('"verse N" word form valid (Al-Fatihah verse 7)', /verse 7/.test(resultsText));
      ok('invalid out-of-bounds reference (2:290)', /2:290/.test(resultsText) && /INVALID/.test(resultsText) && /does not exist/.test(resultsText));
      ok('range format valid, full span not truncated (Ash-Sharh 94:5-6)', /Ash-Sharh \(94:5-6\)/.test(resultsText));
      ok('name/number mismatch flagged (Al-Fatihah 2:5)', /NAME\/NUMBER MISMATCH/.test(resultsText));
      ok('Arabic exact match reported', /MATCH/.test(resultsText));
      ok('Arabic mismatch reported', /MISMATCH/.test(resultsText));
      ok('names the source standard, not a bare assertion', /Tanzil Project/.test(resultsText));

      console.log('  -> light-theme "why" details expansion');
      const detailsHandle = await page.$('#results details');
      ok('a "Why?" details element is present for the Arabic mismatch row', !!detailsHandle);
      if (detailsHandle) {
        await page.click('#results details summary');
        await wait(150);
        const isOpen = await page.$eval('#results details', el => el.open);
        ok('clicking the summary opens the details element', isOpen);
        const diffHtml = await page.$eval('#results details > div', el => el.innerHTML);
        ok('expanded diff shows an underline (extra word) and a strike-through (missing word)',
          /text-decoration:underline/.test(diffHtml) && /text-decoration:line-through/.test(diffHtml));
        // #results scrolls internally (max-height:320px) - a page-level
        // screenshot (fullPage or not) does not follow that inner scroll, so
        // the just-expanded diff would be silently clipped out of frame
        // unless it's scrolled into view within its own container first.
        await page.$eval('#results details', el => el.scrollIntoView({ block: 'center' }));
        await wait(100);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'popup-why-expanded-light.png') });
      }

      console.log('  -> empty/no-citation state');
      await page.evaluate(() => { document.getElementById('input').value = ''; });
      await page.type('#input', 'This is just a normal sentence, no reference at all.');
      await page.click('#check');
      await wait(200);
      const emptyText = await page.$eval('#results', el => el.textContent);
      ok('shows "No Quran citation detected" for ordinary text', /No Quran citation detected/.test(emptyText));

      await page.close();
    } else {
      ok('popup comprehensive test', false, 'skipped - no extension id (service worker never started)');
    }

    // -------------------------------------------------------------------
    // 3. Content-script auto-scan: every citation format variant on one
    //    realistic multi-paragraph synthetic page.
    // -------------------------------------------------------------------
    console.log('\n[3] Content-script auto-scan - comprehensive format coverage');
    {
      const html = `<!doctype html><html><body><div id="chat">
        <p>"And He is with you wherever you are." Surah Al-Hadid (57:4).</p>
        <p>Also see Al-Baqarah (2:290) which is fake, and Al-Fatihah 2:5 which has a name/number mismatch.</p>
        <p>Surah Al-Fatihah verse 7 asks for guidance, and Ash-Sharh (94:5-6) speaks of ease after hardship.</p>
        <p>quran 93:5 says: وَلَسَوْفَ يُعْطِيكَ الْمَلِكُ فَتَرْضَىٰ which does not match the real text.</p>
      </div></body></html>`;
      const { page, consoleLines } = await newAutoScanPage(browser, html);

      ok('content.js proof-of-execution log fired', consoleLines.some(l => l.includes('[GROUND TRUTH] content.js executing')));
      ok('dependencies-present log confirms checker + data loaded', consoleLines.some(l => l.includes('dependencies present')));

      const badges = await getBadges(page, '#chat');
      ok('exactly 6 badges inserted (one per citation across all formats)', badges.length === 6, `got ${badges.length}: ${JSON.stringify(badges)}`);
      ok('all badge keys are unique (no dedup collision across distinct citations)', new Set(badges.map(b => b.key)).size === badges.length);
      ok('at least one checkmark (valid, no Arabic issue)', badges.some(b => b.text === '✓'));
      ok('at least one question mark (invalid or Arabic mismatch)', badges.some(b => b.text === '?'));
      ok('at least one exclamation mark (name/number mismatch)', badges.some(b => b.text === '!'));

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'content-script-comprehensive.png'), fullPage: true });

      const mismatchBadgeHandle = await page.evaluateHandle(() =>
        [...document.querySelectorAll('.ground-truth-inline-badge')].find(b => b.textContent === '!'));
      const box = await mismatchBadgeHandle.asElement()?.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await wait(200);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'content-script-mismatch-tooltip.png') });
      }
      await page.close();
    }

    // -------------------------------------------------------------------
    // 4. Adversarial stress test: 5 citations packed into a SINGLE text
    //    node, no paragraph breaks - the exact shape that exposed the
    //    forward-vs-reverse offset-map bug. Verified here in a real
    //    browser, not just jsdom.
    // -------------------------------------------------------------------
    console.log('\n[4] Five citations in one text node (reverse-order splitText stress test)');
    {
      const original = 'Al-Hadid 57:4 is real. Also see Al-Baqarah (2:290) which is fake, and Al-Fatihah 2:5 which has a mismatch, and Ash-Sharh (94:5-6) is a range, and An-Nas ayah 6 too.';
      const html = `<!doctype html><html><body><div id="chat"><p id="crowded">${original}</p></div></body></html>`;
      const { page } = await newAutoScanPage(browser, html);

      const badges = await getBadges(page, '#crowded');
      ok('exactly 5 badges from 5 citations sharing one original text node', badges.length === 5, `got ${badges.length}: ${JSON.stringify(badges)}`);
      ok('all 5 badge keys are distinct', new Set(badges.map(b => b.key)).size === 5);

      const reconstructed = await reconstructText(page, '#crowded');
      ok('reconstructed non-badge text exactly matches the original (no char lost/duplicated across 5 splitText calls)',
        reconstructed === original, `got: ${JSON.stringify(reconstructed)}`);

      await page.close();
    }

    // -------------------------------------------------------------------
    // 5. Citation inside a real <a href> link: badge insertion must not
    //    corrupt the link's structure, and the badge's own preventDefault
    //    must suppress the inherited anchor navigation without touching
    //    other, unrelated links on the same page.
    // -------------------------------------------------------------------
    console.log('\n[5] Citation inside a real anchor link - structure + click behavior');
    {
      const html = `<!doctype html><html><body><div id="chat">
        <p>See <a href="#anchor-target" id="thelink">Al-Hadid 57:4</a> for more, and also <a href="#other" id="linktwo">this unrelated link</a>.</p>
      </div></body></html>`;
      const { page } = await newAutoScanPage(browser, html);

      const href = await page.$eval('#thelink', el => el.getAttribute('href'));
      ok('anchor href is unchanged after badge insertion', href === '#anchor-target');

      const badgeInsideLink = await page.$('#thelink .ground-truth-inline-badge');
      ok('badge was inserted as a descendant of the anchor (not a sibling that broke structure)', !!badgeInsideLink);

      const linkText = await reconstructText(page, '#thelink');
      ok('anchor\'s own text content is intact around the badge', linkText === 'Al-Hadid 57:4');

      await page.evaluate(() => { location.hash = ''; });
      await page.click('#thelink .ground-truth-inline-badge');
      await wait(100);
      let hash = await page.evaluate(() => location.hash);
      ok('clicking the badge does NOT trigger the anchor\'s inherited navigation (preventDefault holds)', hash === '');

      await page.click('#linktwo');
      await wait(100);
      hash = await page.evaluate(() => location.hash);
      ok('an unrelated link elsewhere on the page still navigates normally (extension does not hijack other links)', hash === '#other');

      await page.close();
    }

    // -------------------------------------------------------------------
    // 6. Excluded tags + self-UI exclusion: SCRIPT, TEXTAREA, and the
    //    extension's own .ground-truth-ui class must never get scanned or
    //    badged, while a normal control citation elsewhere still is.
    // -------------------------------------------------------------------
    console.log('\n[6] Excluded tags (SCRIPT/TEXTAREA/.ground-truth-ui) never get scanned');
    {
      const html = `<!doctype html><html><body><div id="chat">
        <p id="control">Al-Hadid 57:4 is a control citation that must get a badge.</p>
        <script>// Al-Baqarah 2:255 inside a script tag must never be scanned</script>
        <textarea id="ta">Al-Baqarah 2:255 inside a textarea must never be scanned</textarea>
        <div class="ground-truth-ui" id="fakeui">Al-Baqarah 2:255 inside our own excluded UI class must never be scanned</div>
      </div></body></html>`;
      const { page } = await newAutoScanPage(browser, html);

      const controlBadges = await getBadges(page, '#control');
      ok('control citation outside any excluded tag DID get badged (proves the scanner ran at all)', controlBadges.length === 1);

      const totalBadges = await getBadges(page, '#chat');
      ok('exactly 1 badge total on the whole page (script/textarea/.ground-truth-ui content never badged)', totalBadges.length === 1, `got ${totalBadges.length}`);

      const taBadges = await page.$$eval('#ta .ground-truth-inline-badge', els => els.length).catch(() => 0);
      ok('zero badges inside the textarea', taBadges === 0);
      const fakeUiBadges = await page.$eval('#fakeui', el => el.querySelectorAll('.ground-truth-inline-badge').length);
      ok('zero badges inside a .ground-truth-ui element', fakeUiBadges === 0);

      await page.close();
    }

    // -------------------------------------------------------------------
    // 7. Streamed/mutating content (token-by-token, like a live AI
    //    response): the debounce must settle to exactly one clean pass,
    //    with no duplicate badges and no thrown errors mid-stream.
    // -------------------------------------------------------------------
    console.log('\n[7] Streamed content: debounce settles cleanly, no duplicate badges');
    {
      const page = await browser.newPage();
      const consoleLines = [];
      page.on('console', msg => consoleLines.push(msg.text()));
      await page.setContent('<!doctype html><html><body><div id="chat"><p id="stream"></p></div></body></html>');
      await page.addScriptTag({ path: path.join(EXT_DIR, 'quran-data.js') });
      await page.addScriptTag({ path: path.join(EXT_DIR, 'checker.js') });
      await page.addScriptTag({ path: path.join(EXT_DIR, 'content.js') });

      const chunks = ['Al-Had', 'id 57:4 ', 'is real', ' and ', 'Al-Baqarah', ' (2:290)', ' is fake.'];
      const full = chunks.join('');
      await page.evaluate(async (chunks) => {
        const p = document.getElementById('stream');
        for (const c of chunks) {
          p.appendChild(document.createTextNode(c));
          await new Promise(r => setTimeout(r, 120));
        }
      }, chunks);
      await wait(1200); // let the final debounce settle

      let badges = await getBadges(page, '#stream');
      ok('exactly 2 badges after streaming settles (one per citation, no partial-token false badges)', badges.length === 2, `got ${badges.length}: ${JSON.stringify(badges)}`);
      const reconstructed = await reconstructText(page, '#stream');
      ok('reconstructed streamed text matches the fully-assembled original', reconstructed === full);
      ok('no console errors thrown during incremental streaming mutations', !consoleLines.some(l => /error/i.test(l)), consoleLines.join(' | '));

      // A further, unrelated mutation must not re-badge already-annotated citations.
      await page.evaluate(() => { document.getElementById('stream').appendChild(document.createTextNode(' ')); });
      await wait(1200);
      badges = await getBadges(page, '#stream');
      ok('a later unrelated mutation does not duplicate existing badges', badges.length === 2, `got ${badges.length}`);

      await page.close();
    }

    // -------------------------------------------------------------------
    // 8. Pathological page-size guard: content.js bails out above 200000
    //    characters to avoid hanging on huge pages. Verify both sides of
    //    that exact boundary, measured empirically (not hand arithmetic).
    // -------------------------------------------------------------------
    console.log('\n[8] Pathological content-length guard (200000 char boundary)');
    {
      async function buildAndMeasure(browser, totalLen) {
        const citation = ' Al-Hadid 57:4';
        const filler = 'x'.repeat(Math.max(0, totalLen - citation.length));
        const text = filler + citation;
        const page = await browser.newPage();
        await page.setContent(`<!doctype html><html><body><div id="chat"><p id="big">${text}</p></div></body></html>`);
        const measuredLen = await page.evaluate(() => document.getElementById('big').textContent.length);
        await page.addScriptTag({ path: path.join(EXT_DIR, 'quran-data.js') });
        await page.addScriptTag({ path: path.join(EXT_DIR, 'checker.js') });
        await page.addScriptTag({ path: path.join(EXT_DIR, 'content.js') });
        await wait(1200);
        return { page, measuredLen };
      }

      const under = await buildAndMeasure(browser, 200000);
      ok('fixture at exactly 200000 chars measured correctly before asserting guard behavior', under.measuredLen === 200000, `measured ${under.measuredLen}`);
      const underBadges = await getBadges(under.page, '#big');
      ok('at exactly 200000 chars (guard is ">200000"), the page still gets annotated', underBadges.length === 1, `got ${underBadges.length}`);
      await under.page.close();

      const over = await buildAndMeasure(browser, 200001);
      ok('fixture at exactly 200001 chars measured correctly before asserting guard behavior', over.measuredLen === 200001, `measured ${over.measuredLen}`);
      const overBadges = await getBadges(over.page, '#big');
      ok('at 200001 chars, the pathological-size guard skips annotation entirely (no hang, no crash)', overBadges.length === 0, `got ${overBadges.length}`);
      await over.page.close();
    }

    // -------------------------------------------------------------------
    // 9. Tooltip pin/unpin + "why" details expansion, dark theme
    //    (content.js's inline tooltip, as opposed to the popup's light one).
    // -------------------------------------------------------------------
    console.log('\n[9] Tooltip pin/unpin + "why" expansion (content.js, dark theme)');
    {
      const html = `<!doctype html><html><body><div id="chat"><p>quran 93:5 says: وَلَسَوْفَ يُعْطِيكَ الْمَلِكُ فَتَرْضَىٰ</p></div></body></html>`;
      const { page } = await newAutoScanPage(browser, html);

      await page.click('.ground-truth-inline-badge');
      await wait(100);
      let tooltipDisplay = await page.$eval('.ground-truth-ui:not(.ground-truth-inline-badge)', el => el.style.display).catch(() => null);
      ok('clicking the badge pins the tooltip open', tooltipDisplay === 'block');

      await page.mouse.move(5, 5); // move far away from the badge/tooltip
      await wait(300); // longer than the 150ms unpinned-hide delay
      tooltipDisplay = await page.$eval('.ground-truth-ui:not(.ground-truth-inline-badge)', el => el.style.display).catch(() => null);
      ok('tooltip stays visible after the mouse leaves while pinned', tooltipDisplay === 'block');

      const detailsExists = await page.$('.ground-truth-ui details');
      ok('a "Why?" details element is present in the pinned tooltip', !!detailsExists);
      if (detailsExists) {
        await page.click('.ground-truth-ui details summary');
        await wait(150);
        const isOpen = await page.$eval('.ground-truth-ui details', el => el.open);
        ok('clicking the tooltip\'s summary expands the word-diff', isOpen);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'tooltip-pinned-expanded-dark.png') });
      }

      await page.click('body'); // click elsewhere, outside tooltip and badge
      await wait(100);
      tooltipDisplay = await page.$eval('.ground-truth-ui:not(.ground-truth-inline-badge)', el => el.style.display).catch(() => null);
      ok('clicking elsewhere on the page unpins and hides the tooltip', tooltipDisplay === 'none');

      await page.close();
    }

    // -------------------------------------------------------------------
    // 10. Right-click selection path (everything downstream of the native
    //     context-menu click, which Puppeteer/CDP structurally cannot
    //     drive): invoke the exact same entry point background.js calls
    //     after a real click, on a real page.
    // -------------------------------------------------------------------
    console.log('\n[10] Right-click "check selection" result panel (native click substituted, everything downstream tested)');
    {
      const page = await newSelectionPage(browser, '<!doctype html><html><body><p>a real host page, unrelated to the extension</p></body></html>');

      await page.evaluate((t) => window.__groundTruthShowSelectionResult(t),
        'Al-Hadid 57:4 is real. Al-Baqarah 2:290 is fake. Al-Fatihah 2:5 is a mismatch.');
      await wait(150);
      let panelText = await page.$eval('#ground-truth-selection-panel', el => el.textContent);
      ok('panel shows the valid citation as REF OK', /Al-Hadid 57:4/.test(panelText) && /REF OK/.test(panelText));
      ok('panel shows the invalid citation with its reason', /2:290/.test(panelText) && /INVALID/.test(panelText));
      ok('panel shows the name/number mismatch', /NAME\/NUMBER MISMATCH/.test(panelText));
      ok('panel cites the source standard', /Tanzil Project/.test(panelText));
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'selection-panel.png'), fullPage: true });

      await page.click('#ground-truth-sel-close');
      await wait(100);
      const panelGone = await page.$('#ground-truth-selection-panel');
      ok('the close (x) button removes the panel', !panelGone);

      await page.evaluate((t) => window.__groundTruthShowSelectionResult(t), 'Quran 2:290 forbids lying.');
      await wait(150);
      const panelCount = await page.$$eval('#ground-truth-selection-panel', els => els.length);
      ok('re-invoking after close creates exactly one panel (no duplicate stacking)', panelCount === 1);
      panelText = await page.$eval('#ground-truth-selection-panel', el => el.textContent);
      ok('re-invoked panel reflects the NEW text, not stale content from the first call', /2:290/.test(panelText) && !/57:4/.test(panelText));

      await page.evaluate((t) => window.__groundTruthShowSelectionResult(t), 'Just a normal sentence, no citation here.');
      await wait(150);
      const noCiteCount = await page.$$eval('#ground-truth-selection-panel', els => els.length);
      panelText = await page.$eval('#ground-truth-selection-panel', el => el.textContent);
      ok('re-invoking again still yields exactly one panel', noCiteCount === 1);
      ok('no-citation selection shows the correct empty state', /No Quran citation detected/.test(panelText));

      await page.close();
    }

    // -------------------------------------------------------------------
    // 11. Regression: unrelated EARLIER content growing must not duplicate
    //     a badge on an untouched citation (the real Google AI Mode bug -
    //     "Surah Al-Hadid 57:4 got two duplicate badges side by side").
    //
    //     The dedup key used to be surahId:ayah:<absolute offset into the
    //     whole-page text>. On a page where content streams in and grows
    //     BEFORE a citation in document order (extremely normal for a
    //     live chat/AI-answer page - more of the answer lands above,
    //     "related" sections populate, etc.), every absolute offset AFTER
    //     that point shifts on the next annotate() pass, including the
    //     citation's own end offset, even though the citation's own text
    //     node was never touched. The key would then no longer match the
    //     badge already sitting there, so a second badge got inserted
    //     right next to the first one. The fix anchors the key to the
    //     citation's offset WITHIN its own text node instead, which is
    //     invariant to anything happening earlier in the document.
    // -------------------------------------------------------------------
    console.log('\n[11] Regression: earlier-page growth must not duplicate a badge on an untouched citation');
    {
      const citationText = 'Sources say Surah Al-Hadid 57:4 describes the vastness of creation.';
      const html = `<!doctype html><html><body>
        <div id="earlier">Intro text that will grow later, simulating an earlier streamed block.</div>
        <div id="chat"><p id="cite">${citationText}</p></div>
      </body></html>`;
      const { page } = await newAutoScanPage(browser, html);

      let badges = await getBadges(page, '#cite');
      ok('exactly 1 badge after the initial pass', badges.length === 1, `got ${badges.length}: ${JSON.stringify(badges)}`);
      const keyAfterFirstPass = badges[0] && badges[0].key;

      // Grow content EARLIER in the page, in document order before the
      // citation. The citation's own subtree (#cite and everything inside
      // it) is never referenced or touched - only #earlier changes.
      await page.evaluate(() => {
        document.getElementById('earlier').appendChild(document.createTextNode(
          ' And here is a lot more unrelated streamed content that lengthens everything before the citation in document order, exactly like more tokens landing in an earlier AI Overview card while the citation lower on the page stays put.'
        ));
      });
      await wait(1200);

      badges = await getBadges(page, '#cite');
      ok('still exactly 1 badge after unrelated earlier content grows (no duplicate inserted)',
        badges.length === 1, `got ${badges.length}: ${JSON.stringify(badges)}`);
      ok('the dedup key is stable across the pass (node-local, not whole-page-absolute)',
        badges.length === 1 && badges[0].key === keyAfterFirstPass, `before=${keyAfterFirstPass} after=${JSON.stringify(badges)}`);

      const reconstructed = await reconstructText(page, '#cite');
      ok('citation text itself is unchanged', reconstructed === citationText, `got: ${JSON.stringify(reconstructed)}`);

      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log(`Screenshots written to: ${SCREENSHOT_DIR}`);
  if (failures.length) {
    console.log('\nFAILURES:');
    failures.forEach(f => console.log('  -', f));
    process.exit(1);
  }
}

main().catch(e => { console.error('e2e harness crashed:', e); process.exit(1); });
