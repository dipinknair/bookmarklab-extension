/**
 * BookmarkLab Extension — Popup Controller
 * Displays live stats and provides quick action links into full workspace.
 * Follows DRY principles by reusing urlUtils functions.
 */

import { initTheme, setupThemeSelector } from './utils/theme.js';
import { cleanTrackingParameters, findDuplicateGroups } from './utils/urlUtils.js';

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

  // Load stats from chrome.bookmarks (or demo fallback if standalone preview)
  try {
    let tree;
    if (typeof chrome !== 'undefined' && chrome.bookmarks && typeof chrome.bookmarks.getTree === 'function') {
      tree = await new Promise((resolve, reject) => {
        chrome.bookmarks.getTree((t) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(t);
        });
      });
    } else {
      const { DEMO_BOOKMARK_TREE } = await import('./utils/demoData.js');
      tree = [DEMO_BOOKMARK_TREE];
    }

    const bookmarks = [];
    let totalFolders = 0;
    let trackingCount = 0;

    function flattenNode(node) {
      if (!node) return;
      if (node.url) {
        bookmarks.push(node);
        if (cleanTrackingParameters(node.url).hasChanges) {
          trackingCount++;
        }
      } else {
        // Exclude virtual container roots
        if (!['0', '1', '2', '3'].includes(node.id)) {
          totalFolders++;
        }
      }
      if (node.children) node.children.forEach(flattenNode);
    }

    tree.forEach(flattenNode);

    // Count duplicates using single source of truth (DRY)
    const duplicateGroups = findDuplicateGroups(bookmarks);
    const dupeCount = duplicateGroups.reduce((acc, g) => acc + g.items.length, 0);

    // Update UI
    if (statTotal) statTotal.textContent = bookmarks.length.toLocaleString();
    if (statDupes) statDupes.textContent = dupeCount.toLocaleString();
    if (statTracking) statTracking.textContent = trackingCount.toLocaleString();
    if (statFolders) statFolders.textContent = totalFolders.toLocaleString();

    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';

    // Color-code warnings
    if (dupeCount > 0 && statDupes) {
      statDupes.style.color = 'var(--accent-amber, #d49f69)';
    }
    if (trackingCount > 0 && statTracking) {
      statTracking.style.color = 'var(--accent-violet, #8890df)';
    }

  } catch (err) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) {
      errorEl.style.display = 'block';
      errorEl.textContent = 'Could not load bookmarks: ' + err.message;
    }
  }
});
