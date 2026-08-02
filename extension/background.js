// Unconditional, always-fires-first: proves the service worker executed at
// all, independent of whether contextMenus registration works. If this line
// never shows up in the service worker console, nothing below it matters -
// the script isn't running in this profile/window at all (wrong Chrome
// profile, Incognito without "Allow in Incognito", or the extension isn't
// actually the one loaded here).
console.log('[GROUND TRUTH] background.js executing', {
  time: new Date().toISOString(),
  runtimeId: chrome.runtime.id,
  version: chrome.runtime.getManifest().version,
});

try {
  function registerMenu() {
    // onInstalled fires on every reload during development, not just the
    // first install. Creating a menu item with a fixed id a second time
    // throws ("item already exists") - removeAll first guarantees a clean
    // slate regardless of what state a prior load left behind.
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'ground-truth-selection',
        title: 'Check with Ground Truth',
        contexts: ['selection'],
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('[GROUND TRUTH] context menu registration FAILED:', chrome.runtime.lastError.message);
        } else {
          console.log('[GROUND TRUTH] context menu created OK: ground-truth-selection');
        }
      });
    });
  }

  chrome.runtime.onInstalled.addListener(registerMenu);
  // onInstalled does NOT fire on a plain browser restart (only install/update/
  // chrome_update/shared_module_update) - onStartup catches that case so a
  // "loaded fine at startup, something later broke it" scenario is
  // distinguishable from "never registered this session at all."
  chrome.runtime.onStartup.addListener(registerMenu);
} catch (e) {
  console.error('[GROUND TRUTH] top-level crash before menu registration:', e && e.stack ? e.stack : e);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'ground-truth-selection' || !tab?.id) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['quran-data.js', 'checker.js', 'inject-selection.js'],
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (text) => window.__groundTruthShowSelectionResult(text),
      args: [info.selectionText || ''],
    });
  } catch (e) {
    // Injection can fail on restricted pages (chrome://, the Web Store, etc).
    // Nothing to recover here - those pages are out of scope by design.
    console.warn('Ground Truth: could not run on this page.', e);
  }
});
