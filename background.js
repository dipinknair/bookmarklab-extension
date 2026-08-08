/**
 * BookmarkLab Extension — Background Service Worker
 * Handles extension lifecycle and messaging between popup and full dashboard
 */

// Open full dashboard in a new tab when the extension icon is clicked
// (This is a fallback; primary UI is the popup)
chrome.runtime.onInstalled.addListener(() => {
  console.log('BookmarkLab Extension installed.');
});

// Message relay between popup and dashboard tab
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_DASHBOARD') {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    sendResponse({ success: true });
  }
  return true; // keep channel open for async response
});
