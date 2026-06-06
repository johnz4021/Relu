// ReLU "Stuck Helper" — background service worker (SPIKE step 1)
//
// Intentionally near-empty. Step 1 of the spike does not need the background
// at all — extraction + iframe injection happen entirely in the content script.
//
// Step 2 (only if framing works) lights this up: it becomes the owner of the
// Supabase session (supabase-js + chrome.storage), refreshes the token, and
// hands a fresh access_token to the content script on each overlay open
// (the storage-partitioning fix from the eng review, decision D2).
//
// Kept here now so the wiring point is obvious and so install errors surface.

chrome.runtime.onInstalled.addListener(() => {
  console.log('[ReLU-spike] background installed. Step 1 = framing/extraction test only.');
});

// Step 2 stub — content script will message here for a token.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'relu_get_token') {
    // TODO(step 2): return a fresh Supabase access_token from chrome.storage.
    console.warn('[ReLU-spike] token requested but auth not wired yet (step 2).');
    sendResponse({ token: null, reason: 'step2-not-implemented' });
  }
  return true; // keep the channel open for async sendResponse
});
