// True automatic mode: walks the page's actual text nodes (generically, not
// tied to any site's specific DOM structure), finds Quran citations, and
// splices a small inline [?] marker directly next to each one in the live
// text. Hover or tap it to see the result. No copy-paste, no clicking a
// corner panel to discover something was found.

(function () {
  // Unconditional, before the injection guard: proves this script actually
  // ran on this page at all, independent of whether citation detection or
  // badge insertion works. Check the PAGE's own DevTools console for this,
  // not the extension's service worker console - content scripts log there.
  console.log('[GROUND TRUTH] content.js executing', { href: location.href, time: new Date().toISOString() });

  if (window.__groundTruthInjected) return;
  window.__groundTruthInjected = true;

  console.log('[GROUND TRUTH] dependencies present?', {
    quranData: !!window.QURAN_DATA,
    checker: !!window.GroundTruthChecker,
  });

  const EXCLUDE_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT']);
  const EXCLUDE_CLASS = 'ground-truth-ui';

  let tooltip = null;
  let pinned = false;

  function ensureTooltip() {
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.className = EXCLUDE_CLASS;
    tooltip.style.cssText = `
      position: fixed; z-index: 2147483647; display: none;
      background:#1A1A1A; color:#FAF9F6; border-radius:12px; padding:12px 14px;
      box-shadow:0 4px 20px rgba(0,0,0,0.35); font-family:-apple-system,system-ui,sans-serif;
      font-size:12px; max-width:320px; pointer-events:auto;
    `;
    document.documentElement.appendChild(tooltip);
    tooltip.addEventListener('mouseleave', () => { if (!pinned) hideTooltip(); });
    return tooltip;
  }

  function hideTooltip() { if (tooltip) tooltip.style.display = 'none'; pinned = false; }

  function renderTooltip(result, x, y) {
    const esc = window.GroundTruthChecker.escapeHtml;
    const t = ensureTooltip();
    const color = !result.valid ? '#E8927A' : result.nameNumberMismatch ? '#E0C070' : (result.arabicCheck && result.arabicCheck.verdict === 'mismatch') ? '#E8927A' : (result.arabicCheck && result.arabicCheck.verdict === 'partial') ? '#E0C070' : '#8FBFA3';
    const label = !result.valid ? 'INVALID REFERENCE' : result.nameNumberMismatch ? 'NAME/NUMBER MISMATCH' : result.arabicCheck ? (result.arabicCheck.verdict === 'exact' ? 'ARABIC MATCHES' : result.arabicCheck.verdict === 'partial' ? 'PARTIAL MATCH' : 'ARABIC MISMATCH') : 'REFERENCE VALID';
    const mismatchBlock = result.nameNumberMismatch
      ? `<div style="color:#E0C070; margin-top:6px; font-size:11px;">${esc(result.nameNumberMismatch.detail)}</div>`
      : '';
    const whyBlock = (result.arabicCheck && result.arabicCheck.wordDiff)
      ? `<details style="margin-top:8px;">
           <summary style="cursor:pointer; color:#8FBFA3; font-size:11px;">Why? See what differs</summary>
           <div dir="rtl" style="font-size:15px; line-height:1.9; margin-top:6px; padding:8px; background:#0000002a; border-radius:8px;">${window.GroundTruthChecker.renderWordDiffHtml(result.arabicCheck.wordDiff)}</div>
           <div style="font-size:10px; color:#777; margin-top:4px;">struck-through: in the real ayah, missing from the quote. underlined: in the quote, not in the real ayah.</div>
         </details>`
      : '';
    t.innerHTML = !result.valid
      ? `<div style="color:${color}; font-weight:600; margin-bottom:4px;">${label}</div><div style="color:#CCC;">${esc(result.reason)}</div>`
      : `<div style="color:${color}; font-weight:600; margin-bottom:4px;">${label}</div>
         <div style="color:#999; margin-bottom:2px;">${esc(result.surah.translit)}, ayah ${result.ayah} of ${result.surah.count}</div>
         <div style="color:#666; font-size:10px; margin-bottom:6px;">source: ${esc(result.source)}</div>
         <div dir="rtl" style="font-size:15px; line-height:1.7;">${esc(result.canonicalText)}</div>
         ${result.arabicCheck ? `<div style="color:#999; margin-top:6px; font-size:11px;">${esc(result.arabicCheck.detail)}</div>` : `<div style="color:#777; margin-top:6px; font-size:11px;">Only an English paraphrase was found nearby, not compared automatically, no translation is canonical.</div>`}
         ${mismatchBlock}
         ${whyBlock}`;
    t.style.display = 'block';
    const rect = t.getBoundingClientRect();
    let left = x, top = y + 18;
    if (left + rect.width > window.innerWidth - 10) left = window.innerWidth - rect.width - 10;
    if (top + rect.height > window.innerHeight - 10) top = y - rect.height - 10;
    t.style.left = Math.max(10, left) + 'px';
    t.style.top = Math.max(10, top) + 'px';
  }

  function makeBadge(result, key) {
    const badge = document.createElement('span');
    badge.className = 'ground-truth-inline-badge ' + EXCLUDE_CLASS;
    badge.dataset.groundTruthKey = key;
    const ok = result.valid && !result.nameNumberMismatch && (!result.arabicCheck || result.arabicCheck.verdict === 'exact');
    const warn = result.valid && result.nameNumberMismatch;
    badge.textContent = ok ? '✓' : warn ? '!' : '?';
    badge.style.cssText = `
      display:inline-flex; align-items:center; justify-content:center;
      width:15px; height:15px; border-radius:50%; margin:0 2px; cursor:pointer;
      font-size:10px; font-weight:700; line-height:1; vertical-align:super;
      background:${ok ? '#3F6B52' : warn ? '#B08900' : '#A85138'}; color:white; user-select:none;
    `;
    badge.title = 'Ground Truth';
    badge.addEventListener('mouseenter', (e) => renderTooltip(result, e.clientX, e.clientY));
    badge.addEventListener('mouseleave', () => { if (!pinned) setTimeout(() => { if (!pinned) hideTooltip(); }, 150); });
    badge.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      pinned = true;
      renderTooltip(result, e.clientX, e.clientY);
    });
    return badge;
  }

  function walkTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (EXCLUDE_TAGS.has(node.tagName) || node.classList?.contains(EXCLUDE_CLASS)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_SKIP;
        }
        // Accept ANY non-empty text node, including whitespace-only ones. A
        // splitText() from a prior annotate() pass can leave a whitespace-
        // only fragment behind (e.g. a lone space); excluding it here would
        // silently shorten the reconstructed `full` string on the NEXT pass
        // relative to this one, drifting every absolute offset after it.
        // (The dedup key itself is anchored to a node-local offset - see
        // annotate() - so this kind of drift can no longer duplicate a
        // badge, but it would still desync `full` from the live DOM and
        // corrupt offset-based matching for citations further along.)
        return node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    const map = [];
    let full = '';
    let node;
    while ((node = walker.nextNode())) {
      const len = node.nodeValue.length;
      map.push({ node, start: full.length, end: full.length + len });
      full += node.nodeValue;
    }
    return { map, full };
  }

  function findNodeForOffset(map, offset) {
    for (const entry of map) {
      if (offset > entry.start && offset <= entry.end) return { node: entry.node, localOffset: offset - entry.start };
    }
    return null;
  }

  // Only treat a position as already annotated if a badge for THIS SPECIFIC
  // citation (same surah, ayah, and text-offset) is already sitting there -
  // not just any badge. Multiple distinct citations can legitimately resolve
  // to the same underlying text node's nextSibling slot within one pass
  // (processed in reverse order), and a coarse "any badge = done" check would
  // wrongly swallow all but the last one handled.
  function alreadyBadged(node, key) {
    const next = node.nextSibling;
    return !!(next && next.nodeType === Node.ELEMENT_NODE && next.classList.contains('ground-truth-inline-badge') && next.dataset.groundTruthKey === key);
  }

  function annotate() {
    if (!window.QURAN_DATA || !document.body) return;
    const { map, full } = walkTextNodes(document.body);
    if (full.length > 200000) return; // guard against pathological pages
    const results = window.GroundTruthChecker.checkText(full);
    // Process from the end of the text backward: splitting a node for one match
    // shortens/replaces it, which would invalidate the stale start/end offsets
    // of any match still to come if processed in forward order. Working
    // backward means every remaining offset is still ahead of any edit made
    // so far, so the original map stays valid for the rest of the pass.
    for (let i = results.length - 1; i >= 0; i--) {
      const r = results[i];
      const target = findNodeForOffset(map, r.end);
      if (!target) continue;
      // The dedup key is deliberately anchored to target.localOffset (the
      // citation's end position WITHIN its own text node), not r.end (the
      // citation's end position in the whole-page reconstructed string).
      // r.end is a document-wide absolute offset: if ANY content earlier in
      // the page - in document order, before this citation, e.g. more
      // streamed tokens landing in an earlier answer block - grows or
      // shrinks between one annotate() pass and the next, every absolute
      // offset after that point shifts, including this citation's r.end,
      // even though this citation's own node was never touched. That drift
      // used to change the key on every pass, so alreadyBadged() would stop
      // recognizing a badge it had already inserted moments earlier and
      // insert a second one right next to it - a real, reproducible
      // duplicate-badge bug independent of any node replacement.
      // target.localOffset does not have this problem: it is the offset
      // within target.node specifically, so it only changes if target.node's
      // OWN content changes - it is invariant to anything happening earlier
      // in the document. Within a single pass, distinct citations (or two
      // genuine repeats of the same citation) sharing one not-yet-split text
      // node still get distinct localOffset values (that is exactly why the
      // reverse-order stress test's per-occurrence distinctness keeps
      // working), so this does not reintroduce the "any badge = done"
      // problem the surrounding comment above warns about.
      const key = r.surahId + ':' + r.ayah + ':' + target.localOffset;
      if (alreadyBadged(target.node, key)) continue;
      try {
        const afterNode = target.node.splitText(target.localOffset);
        target.node.parentNode.insertBefore(makeBadge(r, key), afterNode);
      } catch (e) { /* node may have been detached by the page's own re-render mid-pass, skip */ }
    }
  }

  document.addEventListener('click', (e) => {
    if (!tooltip || tooltip.contains(e.target) || (e.target.classList && e.target.classList.contains('ground-truth-inline-badge'))) return;
    hideTooltip();
  });

  let debounceTimer = null;
  function scheduleAnnotate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(annotate, 900);
  }

  const observer = new MutationObserver(scheduleAnnotate);
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true });

  scheduleAnnotate();
})();
