import { initTheme, setupThemeSelector } from './utils/theme.js';

document.addEventListener('DOMContentLoaded', async () => {
  await initTheme();
  setupThemeSelector();

  const statTotal = document.getElementById('stat-total');
  const statDupes = document.getElementById('stat-dupes');
  const statTracking = document.getElementById('stat-tracking');
  const statFolders = document.getElementById('stat-folders');
  const loadingEl = document.getElementById('popup-loading');
  const contentEl = document.getElementById('popup-content');
  const errorEl = document.getElementById('popup-error');

  const btnOpenDashboard = document.getElementById('btn-open-dashboard');
  const btnQuickDedupe = document.getElementById('btn-quick-dedupe');
  const btnQuickCluster = document.getElementById('btn-quick-cluster');
  const btnQuickClean = document.getElementById('btn-quick-clean');

  // Open full dashboard
  if (btnOpenDashboard) {
    btnOpenDashboard.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
    });
  }

  // Quick action buttons — open dashboard with a specific action pre-triggered via URL hash
  if (btnQuickDedupe) {
    btnQuickDedupe.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('index.html') + '#dedupe' });
    });
  }

  if (btnQuickCluster) {
    btnQuickCluster.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('index.html') + '#cluster' });
    });
  }

  if (btnQuickClean) {
    btnQuickClean.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('index.html') + '#clean' });
    });
  }

  // Load stats from chrome.bookmarks
  try {
    const tree = await new Promise((resolve, reject) => {
      chrome.bookmarks.getTree((tree) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(tree);
      });
    });

    // Flatten the tree
    let totalBookmarks = 0;
    let totalFolders = 0;
    let trackingCount = 0;
    const urlMap = new Map();

    const TRACKING_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid', 'ref', '_ga'];

    function flattenNode(node) {
      if (!node) return;
      if (node.url) {
        totalBookmarks++;
        // Check for tracking parameters
        try {
          const parsed = new URL(node.url);
          for (const param of TRACKING_PARAMS) {
            if (parsed.searchParams.has(param)) {
              trackingCount++;
              break;
            }
          }
          // Normalized URL for duplicate check
          const norm = node.url.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
          urlMap.set(norm, (urlMap.get(norm) || 0) + 1);
        } catch (e) {}
      } else {
        // It's a folder
        if (node.id !== '0' && node.id !== '1' && node.id !== '2' && node.id !== '3') {
          totalFolders++;
        }
      }
      if (node.children) node.children.forEach(flattenNode);
    }

    tree.forEach(flattenNode);

    // Count duplicates
    let dupeCount = 0;
    urlMap.forEach(count => { if (count > 1) dupeCount += count; });

    // Update UI
    if (statTotal) statTotal.textContent = totalBookmarks.toLocaleString();
    if (statDupes) statDupes.textContent = dupeCount.toLocaleString();
    if (statTracking) statTracking.textContent = trackingCount.toLocaleString();
    if (statFolders) statFolders.textContent = totalFolders.toLocaleString();

    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

    // Color-code warnings
    if (dupeCount > 0 && statDupes) {
      statDupes.style.color = '#f59e0b';
    }
    if (trackingCount > 0 && statTracking) {
      statTracking.style.color = '#818cf8';
    }

  } catch (err) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) {
      errorEl.style.display = 'block';
      errorEl.textContent = 'Could not load bookmarks: ' + err.message;
    }
  }
});
