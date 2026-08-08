/**
 * BookmarkLab Extension — Main Application Controller
 * Stage-and-commit model: edits are in-memory only; sync to Chrome is explicit.
 */

import { state } from './state.js';
import { cleanTrackingParameters } from './utils/urlUtils.js';

import { renderTreeView } from './components/treeView.js';
import { renderMainView } from './components/mainView.js';
import { renderInspector } from './components/inspector.js';
import { setupModals } from './components/modals.js';

import { exportToNetscapeHTML } from './parsers/exporter.js';
import {
  loadChromeBookmarks,
  isChromeExtensionContext,
  chromeUpdateNode,
  chromeMoveNode,
  chromeRemoveNode,
  chromeCreateBookmark,
  chromeCreateFolder
} from './chromeBookmarks.js';

// ─── Snapshot of Chrome bookmarks at load time ─────────────────────────────
// Used for diff computation and backup. Never modified after initial load.
let originalChromeSnapshot = []; // flat array: {id, parentId, title, url, type}

// ─── Flatten tree → flat array for diffing ─────────────────────────────────
function flattenTree(node, parentChromeId = '1', result = []) {
  if (!node) return result;
  const isVirtualRoot = node.id === 'root';

  if (!isVirtualRoot) {
    result.push({
      id: node.id,
      parentId: parentChromeId,
      title: node.title || '',
      url: node.url || null,
      type: node.type
    });
  }

  if (node.children) {
    const childParentId = isVirtualRoot ? '1' : node.id;
    for (const child of node.children) {
      flattenTree(child, childParentId, result);
    }
  }

  return result;
}

// ─── Compute diff between original Chrome state and current in-memory tree ──
function computeDiff(original, current) {
  const originalMap = new Map(original.map(n => [n.id, n]));
  const currentMap  = new Map(current.map(n => [n.id, n]));

  const PROTECTED = new Set(['0', '1', '2', '3']);

  const toDelete = [];
  const toMove   = [];
  const toUpdate = [];
  const toCreate = [];

  // Deletions
  for (const [id, orig] of originalMap) {
    if (!currentMap.has(id) && !PROTECTED.has(id)) {
      toDelete.push(orig);
    }
  }

  // Moves + updates
  for (const [id, curr] of currentMap) {
    if (PROTECTED.has(id)) continue;
    if (originalMap.has(id)) {
      const orig = originalMap.get(id);
      if (curr.parentId !== orig.parentId) {
        toMove.push({ id, newParentId: curr.parentId, type: curr.type });
      }
      if (curr.title !== orig.title || curr.url !== orig.url) {
        toUpdate.push({ id, title: curr.title, url: curr.url });
      }
    } else {
      // New node created by user
      toCreate.push(curr);
    }
  }

  return { toDelete, toMove, toUpdate, toCreate };
}

// ─── Apply diff to Chrome bookmarks ────────────────────────────────────────
async function applySyncToChrome(diff) {
  const PROTECTED = new Set(['0', '1', '2', '3']);

  // 1. Deletions first (folders before their would-be-orphaned children)
  // Sort: folders first so removeTree handles children
  const deleteSorted = [...diff.toDelete].sort((a, b) =>
    (b.type === 'folder' ? 1 : 0) - (a.type === 'folder' ? 1 : 0)
  );
  for (const node of deleteSorted) {
    if (PROTECTED.has(node.id)) continue;
    try {
      await chromeRemoveNode(node.id); // chromeRemoveNode handles both leafs and folders
    } catch (e) {
      console.warn('[BookmarkLab] delete failed:', node.id, e.message);
    }
  }

  // 2. Title/URL updates
  for (const upd of diff.toUpdate) {
    if (PROTECTED.has(upd.id)) continue;
    try {
      const changes = {};
      if (upd.title !== undefined) changes.title = upd.title;
      if (upd.url !== undefined) changes.url = upd.url;
      await chromeUpdateNode(upd.id, changes);
    } catch (e) {
      console.warn('[BookmarkLab] update failed:', upd.id, e.message);
    }
  }

  // 3. Moves
  for (const move of diff.toMove) {
    if (PROTECTED.has(move.id)) continue;
    const targetId = move.newParentId === 'root' ? '1' : move.newParentId;
    try {
      await chromeMoveNode(move.id, targetId);
    } catch (e) {
      console.warn('[BookmarkLab] move failed:', move.id, e.message);
    }
  }

  // 4. Creations (user created new folders/bookmarks in the UI)
  for (const node of diff.toCreate) {
    const parentId = node.parentId === 'root' ? '1' : node.parentId;
    try {
      if (node.type === 'folder') {
        await chromeCreateFolder(parentId, node.title);
      } else {
        await chromeCreateBookmark(parentId, node);
      }
    } catch (e) {
      console.warn('[BookmarkLab] create failed:', node.title, e.message);
    }
  }
}

// ─── Main App Entry ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const treeRootEl       = document.getElementById('tree-root');
  const bookmarkContentEl = document.getElementById('bookmark-content');
  const dropZoneEl       = document.getElementById('drop-zone');
  const breadcrumbsEl    = document.getElementById('breadcrumbs');
  const batchBarEl       = document.getElementById('batch-bar');
  const selectedCountEl  = document.getElementById('selected-count');
  const inspectorBodyEl  = document.getElementById('inspector-body');

  const searchInput  = document.getElementById('search-input');
  const searchClear  = document.getElementById('search-clear');
  const btnUndo      = document.getElementById('btn-undo');
  const btnRedo      = document.getElementById('btn-redo');
  const viewGridBtn  = document.getElementById('view-grid-btn');
  const viewListBtn  = document.getElementById('view-list-btn');
  const btnCleanParams  = document.getElementById('btn-clean-params');
  const btnNewFolder    = document.getElementById('btn-new-folder');
  const btnExpandAll    = document.getElementById('btn-expand-all');
  const btnCollapseAll  = document.getElementById('btn-collapse-all');
  const btnBackup    = document.getElementById('btn-backup');
  const btnSync      = document.getElementById('btn-sync');
  const btnRetryLoad = document.getElementById('btn-retry-load');

  setupModals(showToast);

  // State subscription → re-render everything
  state.subscribe(() => {
    renderTreeView(treeRootEl);
    renderMainView(bookmarkContentEl, dropZoneEl, breadcrumbsEl, batchBarEl, selectedCountEl);
    renderInspector(inspectorBodyEl);
    updateSmartViewCounts();
    updateUndoRedoButtons();
    updateSyncButton();
  });

  // ── Sidebar drag-to-resize ────────────────────────────────────────────────
  const sidebarEl = document.getElementById('sidebar');
  const resizerEl = document.getElementById('sidebar-resizer');
  if (sidebarEl && resizerEl) {
    let isResizing = false, startX = 0, startWidth = 0;
    resizerEl.addEventListener('mousedown', (e) => {
      isResizing = true; startX = e.clientX; startWidth = sidebarEl.offsetWidth;
      resizerEl.classList.add('resizing');
      document.body.style.cssText += 'cursor:col-resize;user-select:none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      sidebarEl.style.width = `${Math.min(480, Math.max(160, startWidth + e.clientX - startX))}px`;
    });
    document.addEventListener('mouseup', () => {
      if (!isResizing) return;
      isResizing = false;
      resizerEl.classList.remove('resizing');
      document.body.style.cursor = document.body.style.userSelect = '';
    });
  }

  // ── Load Chrome Bookmarks ─────────────────────────────────────────────────
  async function loadFromChrome() {
    showToast('Loading your Chrome bookmarks…', 'info');
    try {
      const tree = await loadChromeBookmarks();
      originalChromeSnapshot = flattenTree(tree);
      state.liveSync = false;
      state.activeFolderId = 'root';
      state.activeView = 'all';
      state.selectedIds.clear();
      state.searchQuery = '';
      resetSmartViewHighlight();
      hideSpinner();
      state.setTree(tree, false);
      showToast(`Loaded ${state.getAllBookmarks().length} bookmarks from Chrome.`, 'success');
    } catch (err) {
      hideSpinner();
      showError('Could not load Chrome bookmarks: ' + err.message);
    }
  }

  function hideSpinner() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.style.display = 'none';
  }


  if (isChromeExtensionContext()) {
    await loadFromChrome();
  } else {
    hideSpinner();
    showError('Open this page from the extension to access Chrome bookmarks.');
  }

  if (btnRetryLoad) {
    btnRetryLoad.addEventListener('click', loadFromChrome);
  }

  function showError(msg) {
    const errEl = document.getElementById('load-error-msg');
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    if (dropZoneEl) dropZoneEl.style.display = 'flex';
    if (bookmarkContentEl) bookmarkContentEl.style.display = 'none';
  }

  function resetSmartViewHighlight() {
    document.querySelectorAll('.smart-view-item').forEach(i => i.classList.remove('active'));
    const allItem = document.querySelector('.smart-view-item[data-view="all"]');
    if (allItem) allItem.classList.add('active');
  }

  // ── Backup ─────────────────────────────────────────────────────────────────
  if (btnBackup) {
    btnBackup.addEventListener('click', async () => {
      showToast('Creating backup from live Chrome bookmarks…', 'info');
      try {
        const freshTree = await loadChromeBookmarks(); // always back up the REAL Chrome state
        const html = exportToNetscapeHTML(freshTree);
        const date = new Date().toISOString().slice(0, 10);
        downloadFile(html, `bookmarks_backup_${date}.html`, 'text/html');
        showToast('Backup saved! Keep this HTML file to restore if needed.', 'success');
      } catch (err) {
        showToast('Backup failed: ' + err.message, 'error');
      }
    });
  }

  // ── Sync Bookmarks ─────────────────────────────────────────────────────────
  if (btnSync) {
    btnSync.addEventListener('click', async () => {
      const currentNodes = flattenTree(state.tree);
      const diff = computeDiff(originalChromeSnapshot, currentNodes);
      const total = diff.toDelete.length + diff.toMove.length + diff.toUpdate.length + diff.toCreate.length;

      if (total === 0) {
        showToast('No changes to sync — your bookmarks are already up to date.', 'info');
        return;
      }

      // Populate sync confirmation modal
      const syncSummary = document.getElementById('sync-summary');
      if (syncSummary) {
        syncSummary.innerHTML = `
          <div class="diff-summary">
            ${diff.toDelete.length > 0 ? `<div class="diff-row diff-delete"><span class="diff-icon">🗑</span><span><strong>${diff.toDelete.length}</strong> bookmark${diff.toDelete.length !== 1 ? 's' : ''} will be deleted</span></div>` : ''}
            ${diff.toMove.length > 0 ? `<div class="diff-row diff-move"><span class="diff-icon">📂</span><span><strong>${diff.toMove.length}</strong> item${diff.toMove.length !== 1 ? 's' : ''} will be moved to a new folder</span></div>` : ''}
            ${diff.toUpdate.length > 0 ? `<div class="diff-row diff-update"><span class="diff-icon">✏️</span><span><strong>${diff.toUpdate.length}</strong> item${diff.toUpdate.length !== 1 ? 's' : ''} will have title or URL updated</span></div>` : ''}
            ${diff.toCreate.length > 0 ? `<div class="diff-row diff-create"><span class="diff-icon">✨</span><span><strong>${diff.toCreate.length}</strong> new bookmark${diff.toCreate.length !== 1 ? 's' : ''}/folder${diff.toCreate.length !== 1 ? 's' : ''} will be created</span></div>` : ''}
          </div>
          <p class="diff-warn">These changes will be applied to your real Chrome bookmarks. This cannot be undone without a backup.</p>
        `;
      }

      const confirmBtn = document.getElementById('btn-confirm-sync');
      if (confirmBtn) {
        confirmBtn.textContent = `Apply ${total} Change${total !== 1 ? 's' : ''} to Chrome`;
        confirmBtn.dataset.diff = JSON.stringify(diff);
      }

      // Open sync modal
      const backdrop = document.getElementById('modal-backdrop');
      if (backdrop) {
        backdrop.style.display = 'flex';
        const dialogs = backdrop.querySelectorAll('.modal-dialog');
        dialogs.forEach(d => d.style.display = 'none');
        const syncModal = document.getElementById('modal-sync');
        if (syncModal) syncModal.style.display = 'flex';
      }
    });
  }

  // Confirm sync button
  document.addEventListener('click', async (e) => {
    if (e.target.id !== 'btn-confirm-sync') return;
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.style.display = 'none';

    const diff = JSON.parse(e.target.dataset.diff || '{}');
    showToast('Applying changes to Chrome…', 'info');
    try {
      await applySyncToChrome(diff);
      // Reload fresh from Chrome to reset the snapshot
      const freshTree = await loadChromeBookmarks();
      originalChromeSnapshot = flattenTree(freshTree);
      state.setTree(freshTree, false);
      showToast('All changes synced to your bookmarks successfully!', 'success');
    } catch (err) {
      showToast('Sync failed: ' + err.message, 'error');
    }
  });

  // ── Search ────────────────────────────────────────────────────────────────
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      if (searchClear) searchClear.style.display = state.searchQuery ? 'block' : 'none';
      state.notify();
    });
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      state.searchQuery = '';
      searchClear.style.display = 'none';
      state.notify();
    });
  }

  // ── Smart Views ───────────────────────────────────────────────────────────
  document.querySelectorAll('.smart-view-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.smart-view-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      state.activeView = item.dataset.view;
      state.notify();
    });
  });

  // ── View switcher ─────────────────────────────────────────────────────────
  if (viewGridBtn && viewListBtn) {
    viewGridBtn.addEventListener('click', () => {
      viewGridBtn.classList.add('active'); viewListBtn.classList.remove('active');
      state.viewMode = 'grid'; state.notify();
    });
    viewListBtn.addEventListener('click', () => {
      viewListBtn.classList.add('active'); viewGridBtn.classList.remove('active');
      state.viewMode = 'list'; state.notify();
    });
  }

  // ── Link Health Check ─────────────────────────────────────────────────────
  const btnCheckLinks = document.getElementById('btn-check-links');
  if (btnCheckLinks) {
    btnCheckLinks.addEventListener('click', async () => {
      if (!state.tree) return;
      let targets = [];
      let label = 'all';

      if (state.selectedIds.size > 0) {
        targets = state.getAllBookmarks().filter(bm => state.selectedIds.has(bm.id));
        label = `${targets.length} selected`;
      } else {
        targets = state.getAllBookmarks();
        label = `all ${targets.length}`;
      }

      if (!targets.length) { showToast('No bookmarks to check.', 'info'); return; }
      showToast(`Checking ${targets.length} links…`, 'info');

      targets.forEach(bm => state.updateNode(bm.id, { status: 'checking' }));
      let valid = 0, invalid = 0;

      for (let i = 0; i < targets.length; i += 5) {
        await Promise.all(targets.slice(i, i + 5).map(async bm => {
          const ok = await validateLink(bm.url);
          ok ? valid++ : invalid++;
          state.updateNode(bm.id, { status: ok ? 'valid' : 'invalid' });
        }));
      }
      showToast(`Health check (${label}): ${valid} valid, ${invalid} unreachable`, valid > 0 ? 'success' : 'warning');
    });
  }

  async function validateLink(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 4500);
      await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: ctrl.signal });
      return true;
    } catch { return false; }
  }

  // ── Clean Tracking Parameters ─────────────────────────────────────────────
  if (btnCleanParams) {
    btnCleanParams.addEventListener('click', () => {
      if (!state.tree) return;
      let count = 0;
      state.getAllBookmarks().forEach(bm => {
        const { cleanedUrl, hasChanges } = cleanTrackingParameters(bm.url);
        if (hasChanges) { state.updateNode(bm.id, { url: cleanedUrl }); count++; }
      });
      showToast(count > 0 ? `Stripped tracking params from ${count} URLs!` : 'All URLs are already clean.', count > 0 ? 'success' : 'info');
    });
  }

  // ── New Folder ────────────────────────────────────────────────────────────
  if (btnNewFolder) {
    btnNewFolder.addEventListener('click', () => {
      if (!state.tree) return;
      const name = prompt('New folder name:', 'New Folder');
      if (name) {
        state.addNode(state.activeFolderId || 'root', {
          id: `folder-${Date.now()}`,
          title: name.trim(), type: 'folder', children: []
        });
        showToast(`Created folder "${name}"`, 'success');
      }
    });
  }

  // ── Expand / Collapse All ─────────────────────────────────────────────────
  if (btnExpandAll) btnExpandAll.addEventListener('click', () => {
    state.getAllFolders().forEach(f => state.expandedFolderIds.add(f.id));
    state.notify();
  });
  if (btnCollapseAll) btnCollapseAll.addEventListener('click', () => {
    state.expandedFolderIds.clear();
    state.expandedFolderIds.add('root');
    state.notify();
  });

  // ── Delete Active Folder ──────────────────────────────────────────────────
  const btnDeleteActiveFolder = document.getElementById('btn-delete-active-tree-folder');
  if (btnDeleteActiveFolder) {
    btnDeleteActiveFolder.addEventListener('click', () => {
      const targetId = state.activeFolderId && state.activeFolderId !== 'root'
        ? state.activeFolderId : null;
      if (!targetId) { showToast('Select a folder in the tree to delete.', 'info'); return; }
      const node = state.findNode(targetId);
      state.deleteNodes([targetId]);
      state.activeFolderId = 'root';
      state.activeView = 'all';
      showToast(`Deleted folder "${node?.title || ''}"`, 'info');
    });
  }

  // ── Undo / Redo ───────────────────────────────────────────────────────────
  if (btnUndo) btnUndo.addEventListener('click', () => state.undo());
  if (btnRedo) btnRedo.addEventListener('click', () => state.redo());
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key.toLowerCase() === 'z') { e.shiftKey ? state.redo() : state.undo(); }
  });

  // ── Batch Bar ─────────────────────────────────────────────────────────────
  const btnBatchDelete = document.getElementById('btn-batch-delete');
  const btnBatchClear  = document.getElementById('btn-batch-clear');
  if (btnBatchDelete) btnBatchDelete.addEventListener('click', () => {
    const count = state.selectedIds.size;
    if (!count) return;
    state.deleteNodes(Array.from(state.selectedIds));
    showToast(`Deleted ${count} item(s)`, 'info');
  });
  if (btnBatchClear) btnBatchClear.addEventListener('click', () => {
    state.selectedIds.clear(); state.notify();
  });
});

// ─── Utilities ───────────────────────────────────────────────────────────────

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.cssText += 'opacity:0;transform:translateY(10px);transition:all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function updateUndoRedoButtons() {
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  if (btnUndo) btnUndo.disabled = !state.canUndo();
  if (btnRedo) btnRedo.disabled = !state.canRedo();
}

function updateSyncButton() {
  const btnSync = document.getElementById('btn-sync');
  const badge   = document.getElementById('sync-change-count');
  if (!btnSync || !state.tree) return;

  const currentNodes = flattenTree(state.tree);
  const diff = computeDiff(originalChromeSnapshot, currentNodes);
  const total = diff.toDelete.length + diff.toMove.length + diff.toUpdate.length + diff.toCreate.length;

  if (badge) {
    if (total > 0) {
      badge.textContent = total;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  btnSync.disabled = total === 0;
}

function updateSmartViewCounts() {
  const countAll    = document.getElementById('count-all');
  const countDupes  = document.getElementById('count-duplicates');
  const countUncat  = document.getElementById('count-uncategorized');
  const countDirty  = document.getElementById('count-dirty-urls');
  const countBroken = document.getElementById('count-broken-links');
  if (!state.tree) return;

  const all = state.getAllBookmarks();
  if (countAll) countAll.textContent = all.length;

  const urlMap = new Map();
  let dupeCount = 0;
  all.forEach(bm => {
    const norm = (bm.url || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    urlMap.set(norm, (urlMap.get(norm) || 0) + 1);
  });
  urlMap.forEach(c => { if (c > 1) dupeCount += c; });
  if (countDupes) countDupes.textContent = dupeCount;

  const uncatCount = all.filter(bm => {
    const p = state.findParentNode(bm.id);
    return !p || p.id === 'root';
  }).length;
  if (countUncat) countUncat.textContent = uncatCount;

  const dirtyCount = all.filter(bm => cleanTrackingParameters(bm.url).hasChanges).length;
  if (countDirty) countDirty.textContent = dirtyCount;

  const brokenCount = all.filter(bm => bm.status === 'invalid').length;
  if (countBroken) countBroken.textContent = brokenCount;
}

function downloadFile(content, filename, mimeType = 'text/html') {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
