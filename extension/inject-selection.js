// Injected on demand via the right-click "Check with Ground Truth" context menu.
// Works on ANY page, not just the known chat sites, since it only needs the
// browser's own text selection, not a site-specific DOM structure.

window.__groundTruthShowSelectionResult = function (text) {
  const results = window.GroundTruthChecker.checkText(text);

  const existing = document.getElementById('ground-truth-selection-panel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'ground-truth-selection-panel';
  panel.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 2147483647;
    background:#1A1A1A; color:#FAF9F6; border-radius:14px; padding:16px;
    box-shadow:0 4px 20px rgba(0,0,0,0.35); font-family:-apple-system,system-ui,sans-serif;
    max-width: 360px; max-height: 70vh; overflow-y:auto;
  `;

  if (!results.length) {
    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <strong style="font-size:13px;">Ground Truth</strong>
        <span id="ground-truth-sel-close" style="cursor:pointer; color:#999; font-size:16px;">&times;</span>
      </div>
      <div style="font-size:12px; color:#AAA;">No Quran citation detected in the selected text.</div>`;
  } else {
    const esc = window.GroundTruthChecker.escapeHtml;
    const rows = results.map(r => {
      const color = !r.valid ? '#A85138' : r.nameNumberMismatch ? '#B08900' : (r.arabicCheck && r.arabicCheck.verdict === 'mismatch') ? '#A85138' : (r.arabicCheck && r.arabicCheck.verdict === 'partial') ? '#B08900' : '#3F6B52';
      const label = !r.valid ? 'INVALID' : r.nameNumberMismatch ? 'NAME/NUMBER MISMATCH' : r.arabicCheck ? (r.arabicCheck.verdict === 'exact' ? 'MATCH' : r.arabicCheck.verdict === 'partial' ? 'PARTIAL' : 'MISMATCH') : 'REF OK';
      return `
        <div style="border-top:1px solid #333; padding:10px 0;">
          <div style="display:flex; justify-content:space-between; gap:8px;">
            <span style="font-family:ui-monospace,monospace; font-size:12px;">${esc(r.raw)}</span>
            <span style="background:${color}; color:white; border-radius:6px; padding:2px 6px; font-size:10px; white-space:nowrap;">${label}</span>
          </div>
          ${!r.valid
            ? `<div style="font-size:12px; color:#E8A98C; margin-top:4px;">${esc(r.reason)}</div>`
            : `<div style="font-size:11px; color:#AAA; margin-top:4px;">${esc(r.surah.translit)}, ayah ${r.ayah} of ${r.surah.count}</div>
               <div style="font-size:9px; color:#777; margin-top:1px;">source: ${esc(r.source)}</div>
               <div dir="rtl" style="font-size:14px; margin-top:4px; line-height:1.6;">${esc(r.canonicalText)}</div>
               ${r.nameNumberMismatch ? `<div style="font-size:11px; color:#D9C070; margin-top:4px;">${esc(r.nameNumberMismatch.detail)}</div>` : ''}
               ${r.arabicCheck && r.arabicCheck.wordDiff ? `
                 <details style="margin-top:6px;">
                   <summary style="cursor:pointer; color:#8FBFA3; font-size:11px;">Why? See what differs</summary>
                   <div dir="rtl" style="font-size:14px; line-height:1.8; margin-top:4px; padding:6px; background:#0000002a; border-radius:6px;">${window.GroundTruthChecker.renderWordDiffHtml(r.arabicCheck.wordDiff)}</div>
                 </details>` : ''}`}
        </div>`;
    }).join('');
    panel.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <strong style="font-size:13px;">Ground Truth</strong>
        <span id="ground-truth-sel-close" style="cursor:pointer; color:#999; font-size:16px;">&times;</span>
      </div>
      ${rows}`;
  }

  document.documentElement.appendChild(panel);
  document.getElementById('ground-truth-sel-close').onclick = () => panel.remove();
};
