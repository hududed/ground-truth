document.getElementById('check').addEventListener('click', () => {
  const text = document.getElementById('input').value;
  const results = window.GroundTruthChecker.checkText(text);
  const out = document.getElementById('results');

  if (!results.length) {
    out.innerHTML = '<div class="hint">No Quran citation detected.</div>';
    return;
  }

  const esc = window.GroundTruthChecker.escapeHtml;
  out.innerHTML = results.map(r => {
    const color = !r.valid ? '#A85138' : r.nameNumberMismatch ? '#B08900' : (r.arabicCheck && r.arabicCheck.verdict === 'mismatch') ? '#A85138' : (r.arabicCheck && r.arabicCheck.verdict === 'partial') ? '#B08900' : '#3F6B52';
    const label = !r.valid ? 'INVALID' : r.nameNumberMismatch ? 'NAME/NUMBER MISMATCH' : r.arabicCheck ? (r.arabicCheck.verdict === 'exact' ? 'MATCH' : r.arabicCheck.verdict === 'partial' ? 'PARTIAL' : 'MISMATCH') : 'REF OK';
    return `
      <div class="row">
        <div style="display:flex; justify-content:space-between; gap:8px;">
          <span style="font-family:ui-monospace,monospace;">${esc(r.raw)}</span>
          <span class="badge" style="background:${color};">${label}</span>
        </div>
        ${!r.valid
          ? `<div style="color:#A85138; margin-top:4px;">${esc(r.reason)}</div>`
          : `<div style="color:#6B6B6B; margin-top:4px;">${esc(r.surah.translit)}, ayah ${r.ayah} of ${r.surah.count}</div>
             <div style="color:#999; font-size:9px; margin-top:1px;">source: ${esc(r.source)}</div>
             <div class="arabic">${esc(r.canonicalText)}</div>
             ${r.nameNumberMismatch ? `<div style="color:#8A6D1E; margin-top:4px; font-size:12px;">${esc(r.nameNumberMismatch.detail)}</div>` : ''}
             ${r.arabicCheck && r.arabicCheck.wordDiff ? `
               <details style="margin-top:6px;">
                 <summary style="cursor:pointer; color:#5F7A6E; font-size:11px;">Why? See what differs</summary>
                 <div class="arabic" style="margin-top:4px; padding:6px; background:#F5F1EB; border-radius:6px;">${window.GroundTruthChecker.renderWordDiffHtml(r.arabicCheck.wordDiff, 'light')}</div>
               </details>` : ''}`}
      </div>`;
  }).join('');
});
