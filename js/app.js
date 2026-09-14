/**
 * BookmarkLab Extension — Main Application Controller
 * Stage-and-commit model: edits are in-memory only; sync to Chrome is explicit.
 * Follows SoC, DRY, and SOLID principles.
 */

import { state } from './state.js';
import {
  cleanTrackingParameters,
  findDuplicateGroups,
  validateLink
} from './utils/urlUtils.js';
import { initTheme, setupThemeSelector } from './utils/theme.js';
import { downloadFile } from './utils/domUtils.js';
import { DEMO_BOOKMARK_TREE } from './utils/demoData.js';
import { localizeDOM } from './utils/i18n.js';

import { renderTreeView } from './components/treeView.js';
import { renderMainView } from './components/mainView.js';
import { renderInspector } from './components/inspector.js';
import {
  setupModals,
  triggerCleanTrackingModal,
  triggerDedupeModal,
  triggerClusterModal
} from './components/modals.js';

import { exportToNetscapeHTML } from './parsers/exporter.js';
import { parseBookmarkHTML } from './parsers/htmlParser.js';
import { parseBookmarkJSON } from './parsers/jsonParser.js';
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
      await chromeRemoveNode(node.id);
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

  // 4. Creations (user created or imported new folders/bookmarks in the UI)
  const idMap = new Map();
  idMap.set('root', '1');

  for (const node of diff.toCreate) {
    const rawParentId = node.parentId === 'root' ? '1' : node.parentId;
    const parentId = idMap.get(rawParentId) || rawParentId;
    try {
      if (node.type === 'folder') {
        const created = await chromeCreateFolder(parentId, node.title);
        if (created && created.id) {
          idMap.set(node.id, created.id);
        }
      } else {
        await chromeCreateBookmark(parentId, node);
      }
    } catch (e) {
      console.warn('[BookmarkLab] create failed:', node.title, e.message);
    }
  }
}

// ─── Import Helpers ──────────────────────────────────────────────────────────
function reIdTree(node, prefix = `imp-${Date.now()}`) {
  let counter = 1;
  function traverse(n) {
    n.id = `${prefix}-${counter++}`;
    if (n.children && Array.isArray(n.children)) {
      n.children.forEach(traverse);
    }
  }
  traverse(node);
  return node;
}

function countTreeMetrics(node) {
  let bookmarks = 0;
  let folders = 0;
  function traverse(n) {
    if (n.type === 'bookmark') bookmarks++;
    if (n.type === 'folder' && n.id !== 'root') folders++;
    if (n.children && Array.isArray(n.children)) {
      n.children.forEach(traverse);
    }
  }
  traverse(node);
  return { bookmarks, folders };
}

function cleanTreeTracking(node) {
  if (node.type === 'bookmark' && node.url) {
    const res = cleanTrackingParameters(node.url);
    if (res.hasChanges) {
      node.url = res.cleanedUrl;
    }
  }
  if (node.children && Array.isArray(node.children)) {
    node.children.forEach(cleanTreeTracking);
  }
}

// ─── Main App Entry ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  localizeDOM();
  await initTheme();
  setupThemeSelector();

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
  const btnImport       = document.getElementById('btn-import');
  const fileImportInput = document.getElementById('file-import-input');
  const btnBackup    = document.getElementById('btn-backup');
  const btnSync      = document.getElementById('btn-sync');
  const btnRetryLoad = document.getElementById('btn-retry-load');
  const btnLoadDemo  = document.getElementById('btn-load-demo');

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

  // ── Deep-Link Hash Navigation Router (#clean, #dedupe, #cluster) ──────────
  function handleHashAction() {
    const hash = location.hash;
    if (!hash || !state.tree) return;
    if (hash === '#clean') {
      setTimeout(() => triggerCleanTrackingModal(showToast), 200);
    } else if (hash === '#dedupe') {
      setTimeout(() => triggerDedupeModal(showToast), 200);
    } else if (hash === '#cluster') {
      setTimeout(() => triggerClusterModal(showToast), 200);
    }
  }
  window.addEventListener('hashchange', handleHashAction);

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
      handleHashAction();
    } catch (err) {
      hideSpinner();
      showError('Could not load Chrome bookmarks: ' + err.message);
    }
  }

  // ── Load Demo Dataset (Offline / Standalone preview) ──────────────────────
  function loadDemoBookmarks() {
    originalChromeSnapshot = flattenTree(DEMO_BOOKMARK_TREE);
    state.liveSync = false;
    state.activeFolderId = 'root';
    state.activeView = 'all';
    state.selectedIds.clear();
    state.searchQuery = '';
    resetSmartViewHighlight();
    hideSpinner();
    state.setTree(DEMO_BOOKMARK_TREE, false);

    const shot = urlParams.get('shot');
    if (!urlParams.get('notoast') && !shot) {
      showToast('Loaded demo dataset (offline preview mode).', 'info');
    }

    if (shot) {
      applyScreenshotScenario(shot);
    } else {
      handleHashAction();
    }
  }

  const SCREENSHOT_CONFIGS = {
    '1': {
      tag: 'FEATURE 01 • PRIVACY & CLEANING',
      tagColor: '#818cf8',
      tagBg: 'rgba(99, 102, 241, 0.16)',
      tagBorder: 'rgba(99, 102, 241, 0.35)',
      title: 'Remove Tracking Parameters & Clean URLs',
      desc: 'Strip utm_*, fbclid, gclid & analytics bloat with live side-by-side diff review',
      badgeText: '🔒 100% Client-Side',
      dotColor: '#818cf8',
      gradient: 'linear-gradient(90deg, #6366f1, #818cf8, #a78bfa)'
    },
    'clean': '1',
    '2': {
      tag: 'FEATURE 02 • DRAG & DROP WORKBENCH',
      tagColor: '#38bdf8',
      tagBg: 'rgba(56, 189, 248, 0.16)',
      tagBorder: 'rgba(56, 189, 248, 0.35)',
      title: 'Visual Drag & Drop & Hierarchy Organization',
      desc: 'Reorder bookmarks, organize nested folders, and batch-move collections easily',
      badgeText: '⚡ Smooth Drag & Drop',
      dotColor: '#38bdf8',
      gradient: 'linear-gradient(90deg, #0284c7, #38bdf8, #818cf8)'
    },
    'drag': '2',
    '3': {
      tag: 'FEATURE 03 • LINK VALIDATION & HEALTH',
      tagColor: '#34d399',
      tagBg: 'rgba(16, 185, 129, 0.16)',
      tagBorder: 'rgba(16, 185, 129, 0.35)',
      title: 'Link Health Check & Dead Link Scanner',
      desc: 'Detect broken links, HTTP 404s, timeouts, and redirect loops across all bookmarks',
      badgeText: '🔍 Live Status Scanner',
      dotColor: '#34d399',
      gradient: 'linear-gradient(90deg, #059669, #34d399, #5eead4)'
    },
    'health': '3',
    '4': {
      tag: 'FEATURE 04 • SMART DEDUPLICATION',
      tagColor: '#fbbf24',
      tagBg: 'rgba(245, 158, 11, 0.16)',
      tagBorder: 'rgba(245, 158, 11, 0.35)',
      title: 'Smart Duplicate Bookmark Resolver',
      desc: 'Identify duplicate URLs across nested folders and merge with one-click resolution',
      badgeText: '✨ 1-Click Auto Merge',
      dotColor: '#fbbf24',
      gradient: 'linear-gradient(90deg, #d97706, #fbbf24, #fde047)'
    },
    'dedupe': '4',
    '5': {
      tag: 'FEATURE 05 • SAFE STAGED SYNC',
      tagColor: '#a78bfa',
      tagBg: 'rgba(139, 92, 246, 0.16)',
      tagBorder: 'rgba(139, 92, 246, 0.35)',
      title: 'Safe Staged Sync with Diff Review',
      desc: 'Review every deletion, folder move, and URL edit before committing changes to Chrome',
      badgeText: '🛡️ Zero Data Loss Sandbox',
      dotColor: '#a78bfa',
      gradient: 'linear-gradient(90deg, #7c3aed, #a78bfa, #c084fc)'
    },
    'sync': '5'
  };

  function injectScreenshotFeatureHeader(shot) {
    let key = shot;
    if (typeof SCREENSHOT_CONFIGS[key] === 'string') {
      key = SCREENSHOT_CONFIGS[key];
    }
    const cfg = SCREENSHOT_CONFIGS[key];
    if (!cfg) return;

    document.body.classList.add('has-screenshot-header');

    const header = document.createElement('header');
    header.className = 'screenshot-feature-header';
    header.style.setProperty('--sf-accent-gradient', cfg.gradient);
    header.style.setProperty('--sf-tag-color', cfg.tagColor);
    header.style.setProperty('--sf-tag-bg', cfg.tagBg);
    header.style.setProperty('--sf-tag-border', cfg.tagBorder);
    header.style.setProperty('--sf-dot-color', cfg.dotColor);

    header.innerHTML = `
      <div class="sf-left">
        <div class="sf-brand-icon">
          <svg viewBox="130 130 768 768" fill="none">
            <path fill="#2B2D2A" d="M282.151 141.207C291.786 140.545 305.557 140.889 315.428 140.889L374.283 140.906L556.369 140.911L684.73 140.918L720.703 140.888C733.162 140.879 745.12 140.648 757.49 142.655C829.034 154.265 883.894 216.582 885.049 289.354C885.207 299.277 885.3 309.178 885.362 319.092C885.482 342.14 885.484 365.189 885.371 388.237L885.338 561.174L885.184 686.166C885.093 717.323 887.623 748.333 877.836 778.272C857.794 839.587 809.516 876.657 746.101 884.379C745.172 884.476 744.241 884.56 743.309 884.631C733.605 885.382 720.912 885.021 710.948 885.017L658.028 885.012L488.055 885.005L348.899 884.964L309.32 885.005C294.341 885.023 281.655 885.378 266.755 882.79C239.149 877.929 213.397 865.614 192.284 847.176C162.414 821.168 143.986 784.444 140.986 744.952C140.168 733.709 140.499 719.841 140.496 708.399L140.49 649.413L140.461 464.135L140.448 340.745L140.424 304.613C140.421 290.909 140.038 280.915 142.358 267.214C146.88 240.1 158.763 214.748 176.709 193.926C204.284 162.084 240.189 144.252 282.151 141.207Z"/>
            <path fill="var(--sf-tag-color, #7d85d8)" d="M361.332 298.153L361.987 298.119C381.853 297.185 407.778 297.865 427.893 297.864L550.249 297.869L625.846 297.95C638.609 297.932 651.955 297.72 664.716 298.158C669.124 298.66 673.466 300.885 676.7 303.877C680.948 307.807 683.087 313.669 683.154 319.409C683.511 350.145 683.293 380.885 683.227 411.623L683.262 560.206L683.295 656.699L683.318 685.905C683.36 696.396 685.26 710.953 677.613 718.856C674.049 722.606 669.08 724.695 663.907 724.618C661.588 724.589 657.568 723.694 655.869 722.209C649.002 716.206 641.742 708.657 635.274 702.213L588.973 655.9L547.448 614.42C535.871 602.961 523.61 591.196 512.515 579.285C488.486 604.37 461.586 630.302 436.843 655.103L398.052 693.898C389.472 702.524 376.566 716.526 366.401 724.008C363.896 725.852 355.822 724.192 352.841 722.341C341.635 715.384 342.211 703.881 342.582 692.385C342.705 686.355 342.592 679.934 342.598 673.847L342.579 596.349L342.566 412.368L342.673 350.435C342.686 340.638 342.516 330.833 342.621 321.036C342.753 308.648 349.025 300.509 361.332 298.153Z"/>
          </svg>
        </div>
        <div class="sf-content">
          <div class="sf-title-row">
            <span class="sf-tag">${cfg.tag}</span>
            <h1 class="sf-heading">${cfg.title}</h1>
          </div>
          <p class="sf-desc">${cfg.desc}</p>
        </div>
      </div>
      <div class="sf-right">
        <div class="sf-pill">
          <span class="sf-pill-dot"></span>
          <span>${cfg.badgeText}</span>
        </div>
      </div>
    `;

    document.body.insertBefore(header, document.body.firstChild);
  }

  function applyScreenshotScenario(shot) {
    injectScreenshotFeatureHeader(shot);

    if (shot === '1' || shot === 'clean') {
      setTimeout(() => triggerCleanTrackingModal(), 120);
    } else if (shot === '2' || shot === 'drag') {
      state.getAllFolders().forEach(f => state.expandedFolderIds.add(f.id));
      state.notify();
      setTimeout(() => {
        const devFolderCard = document.querySelector('.folder-card[data-id="folder-dev"]');
        if (devFolderCard) {
          devFolderCard.classList.add('drag-over');
          const ghost = document.createElement('div');
          ghost.className = 'screenshot-drag-indicator';
          const rect = devFolderCard.getBoundingClientRect();
          ghost.style.cssText = `
            position: absolute;
            top: ${Math.round(rect.top - 20)}px;
            left: ${Math.round(rect.left + 30)}px;
            z-index: 1000;
            background: #1c2128;
            border: 2px solid var(--accent-primary);
            border-radius: 10px;
            padding: 10px 18px;
            box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75), 0 0 24px rgba(125, 133, 216, 0.35);
            display: flex;
            align-items: center;
            gap: 12px;
            font-family: var(--font-sans);
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--text-primary);
            transform: rotate(-1.5deg);
            pointer-events: none;
          `;
          ghost.innerHTML = `
            <span style="font-size: 1.3rem;">📂</span>
            <span>Moving <strong>TypeScript Syntax</strong> &rarr; <em>Development & Engineering</em></span>
            <span style="background: var(--accent-primary); color: white; font-size: 0.72rem; font-weight: 700; padding: 3px 8px; border-radius: 6px; margin-left: 6px;">Drop into Folder</span>
          `;
          document.body.appendChild(ghost);
        }
        state.selectedIds.clear();
        state.selectedIds.add('folder-dev');
        state.notify();
      }, 120);
    } else if (shot === '3' || shot === 'health') {
      state.updateNode('bm-icon-1', { status: 'valid' });
      state.updateNode('bm-icon-2', { status: 'valid' });
      state.updateNode('bm-1', { status: 'valid' });
      state.updateNode('bm-2', { status: 'valid' });
      state.updateNode('bm-3', { status: 'valid' });
      state.updateNode('bm-4', { status: 'valid' });
      state.updateNode('bm-5', { status: 'valid' });
      state.updateNode('bm-6', { status: 'valid' });
      state.updateNode('bm-icon-3', { status: 'invalid' });
      state.updateNode('bm-icon-4', { status: 'invalid' });
      state.updateNode('bm-7', { status: 'valid' });
      state.updateNode('bm-8', { status: 'valid' });
      state.updateNode('bm-11', { status: 'invalid' });
      updateSmartViewCounts();
      showToast('Link Health Check: 10 reachable, 3 broken links detected', 'warning');
    } else if (shot === '4' || shot === 'dedupe') {
      setTimeout(() => triggerDedupeModal(), 120);
    } else if (shot === '5' || shot === 'sync') {
      const syncSummary = document.getElementById('sync-summary');
      if (syncSummary) {
        syncSummary.innerHTML = `
          <div class="diff-summary">
            <div class="diff-row diff-delete"><span class="diff-icon">🗑</span><span><strong>1</strong> duplicate bookmark will be deleted</span></div>
            <div class="diff-row diff-move"><span class="diff-icon">📂</span><span><strong>2</strong> bookmarks will be moved to "Development &amp; Engineering"</span></div>
            <div class="diff-row diff-update"><span class="diff-icon">✏️</span><span><strong>2</strong> bookmarks will have tracking parameters stripped</span></div>
            <div class="diff-row diff-create"><span class="diff-icon">✨</span><span><strong>1</strong> new bookmark will be created</span></div>
          </div>
          <p class="diff-warn">These changes will be applied to your real Chrome bookmarks. This cannot be undone without a backup.</p>
        `;
      }
      const confirmBtn = document.getElementById('btn-confirm-sync');
      if (confirmBtn) confirmBtn.textContent = 'Apply 6 Changes to Chrome';
      const badge = document.getElementById('sync-change-count');
      if (badge) { badge.textContent = '6'; badge.style.display = 'inline-flex'; }
      const btnSync = document.getElementById('btn-sync');
      if (btnSync) btnSync.disabled = false;
      const backdrop = document.getElementById('modal-backdrop');
      if (backdrop) {
        backdrop.style.display = 'flex';
        backdrop.querySelectorAll('.modal-dialog').forEach(d => d.style.display = 'none');
        const syncModal = document.getElementById('modal-sync');
        if (syncModal) syncModal.style.display = 'flex';
      }
    }
  }

  function hideSpinner() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.style.display = 'none';
  }

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('demo') === '1' || urlParams.get('demo') === 'true') {
    loadDemoBookmarks();
  } else if (isChromeExtensionContext()) {
    await loadFromChrome();
  } else {
    hideSpinner();
    showError('Open this page from the extension to access Chrome bookmarks.');
  }

  if (btnRetryLoad) {
    btnRetryLoad.addEventListener('click', loadFromChrome);
  }

  if (btnLoadDemo) {
    btnLoadDemo.addEventListener('click', loadDemoBookmarks);
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

  // ── Import Bookmarks ───────────────────────────────────────────────────────
  let pendingImportTree = null;
  let pendingImportFileName = '';

  function openImportModal(parsedTree, fileName) {
    pendingImportTree = parsedTree;
    pendingImportFileName = fileName;

    const metrics = countTreeMetrics(parsedTree);
    const fileNameEl = document.getElementById('import-file-name');
    const fileCountsEl = document.getElementById('import-file-counts');
    const folderNameInp = document.getElementById('import-folder-name');

    if (fileNameEl) fileNameEl.textContent = fileName;
    if (fileCountsEl) {
      fileCountsEl.textContent = `${metrics.bookmarks} bookmark${metrics.bookmarks !== 1 ? 's' : ''}, ${metrics.folders} folder${metrics.folders !== 1 ? 's' : ''}`;
    }

    const cleanBaseName = fileName.replace(/\.(html|htm|json)$/i, '');
    const dateStr = new Date().toISOString().slice(0, 10);
    if (folderNameInp) {
      folderNameInp.value = `Imported (${cleanBaseName}) - ${dateStr}`;
    }

    const confirmBtn = document.getElementById('btn-confirm-import');
    if (confirmBtn) {
      confirmBtn.textContent = `Import ${metrics.bookmarks} Bookmark${metrics.bookmarks !== 1 ? 's' : ''}`;
    }

    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) {
      backdrop.style.display = 'flex';
      backdrop.querySelectorAll('.modal-dialog').forEach(d => d.style.display = 'none');
      const importModal = document.getElementById('modal-import');
      if (importModal) importModal.style.display = 'flex';
    }
  }

  function handleImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      let parsedTree;
      try {
        if (file.name.toLowerCase().endsWith('.json')) {
          parsedTree = parseBookmarkJSON(content);
        } else {
          parsedTree = parseBookmarkHTML(content);
        }
      } catch (err) {
        showToast('Failed to parse bookmarks: ' + err.message, 'error');
        return;
      }

      if (!parsedTree || (!parsedTree.children && parsedTree.type !== 'folder')) {
        showToast('No bookmarks found in selected file.', 'warning');
        return;
      }

      openImportModal(parsedTree, file.name);
    };
    reader.onerror = () => {
      showToast('Could not read file.', 'error');
    };
    reader.readAsText(file);
  }

  if (btnImport && fileImportInput) {
    btnImport.addEventListener('click', () => {
      fileImportInput.value = '';
      fileImportInput.click();
    });
    fileImportInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleImportFile(e.target.files[0]);
      }
    });
  }

  // Window drag & drop file listener for HTML/JSON bookmark files
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault();
    }
  });

  window.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const name = file.name.toLowerCase();
      if (name.endsWith('.html') || name.endsWith('.htm') || name.endsWith('.json')) {
        e.preventDefault();
        handleImportFile(file);
      }
    }
  });

  const btnConfirmImport = document.getElementById('btn-confirm-import');
  if (btnConfirmImport) {
    btnConfirmImport.addEventListener('click', () => {
      if (!pendingImportTree) return;

      const destMode = document.querySelector('input[name="import-dest"]:checked')?.value || 'folder';
      const folderNameInp = document.getElementById('import-folder-name');
      const cleanTrackingCb = document.getElementById('import-clean-tracking');
      const openDedupeCb = document.getElementById('import-open-dedupe');

      const shouldCleanTracking = cleanTrackingCb ? cleanTrackingCb.checked : false;
      const shouldOpenDedupe = openDedupeCb ? openDedupeCb.checked : false;

      // Re-ID to ensure unique non-colliding IDs
      const importedTree = reIdTree(pendingImportTree, `imp-${Date.now()}`);
      if (shouldCleanTracking) {
        cleanTreeTracking(importedTree);
      }

      const metrics = countTreeMetrics(importedTree);

      if (destMode === 'folder') {
        const folderTitle = (folderNameInp && folderNameInp.value.trim()) || `Imported Bookmarks - ${new Date().toISOString().slice(0, 10)}`;
        const importedFolder = {
          id: `folder-imp-${Date.now()}`,
          title: folderTitle,
          type: 'folder',
          dateAdded: Date.now(),
          children: importedTree.children || []
        };

        if (!state.tree) {
          state.setTree({ id: 'root', title: 'Bookmarks Bar', type: 'folder', children: [importedFolder] });
        } else {
          state.addNode('root', importedFolder);
        }
      } else if (destMode === 'merge') {
        if (!state.tree) {
          state.setTree(importedTree);
        } else {
          function mergeChildren(targetFolder, sourceChildren) {
            for (const item of sourceChildren) {
              if (item.type === 'folder') {
                const existingMatch = (targetFolder.children || []).find(c =>
                  c.type === 'folder' && (c.title || '').trim().toLowerCase() === (item.title || '').trim().toLowerCase()
                );
                if (existingMatch) {
                  mergeChildren(existingMatch, item.children || []);
                } else {
                  if (!targetFolder.children) targetFolder.children = [];
                  targetFolder.children.push(item);
                }
              } else {
                if (!targetFolder.children) targetFolder.children = [];
                targetFolder.children.push(item);
              }
            }
          }
          mergeChildren(state.tree, importedTree.children || []);
          state.setTree(state.tree);
        }
      } else if (destMode === 'replace') {
        state.setTree(importedTree);
      }

      const backdrop = document.getElementById('modal-backdrop');
      if (backdrop) backdrop.style.display = 'none';

      showToast(`Imported ${metrics.bookmarks} bookmark(s) successfully!`, 'success');

      if (shouldOpenDedupe) {
        setTimeout(() => triggerDedupeModal(showToast), 400);
      }
    });
  }

  // ── Backup ─────────────────────────────────────────────────────────────────
  if (btnBackup) {
    btnBackup.addEventListener('click', async () => {
      showToast('Creating backup from live Chrome bookmarks…', 'info');
      try {
        const freshTree = isChromeExtensionContext()
          ? await loadChromeBookmarks()
          : state.tree;
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
      if (isChromeExtensionContext()) {
        await applySyncToChrome(diff);
        const freshTree = await loadChromeBookmarks();
        originalChromeSnapshot = flattenTree(freshTree);
        state.setTree(freshTree, false);
      } else {
        originalChromeSnapshot = flattenTree(state.tree);
        state.markSaved();
      }
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

  // ── Clean Tracking Parameters ─────────────────────────────────────────────
  if (btnCleanParams) {
    btnCleanParams.addEventListener('click', () => {
      triggerCleanTrackingModal(showToast);
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

  // ── Undo / Redo (with input safety guard) ──────────────────────────────────
  if (btnUndo) btnUndo.addEventListener('click', () => state.undo());
  if (btnRedo) btnRedo.addEventListener('click', () => state.redo());
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
      return; // Do not intercept native text editing undo/redo
    }
    if (e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? state.redo() : state.undo();
    }
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

  // Single source of truth for duplicates (DRY)
  const duplicateGroups = findDuplicateGroups(all);
  const dupeCount = duplicateGroups.reduce((acc, g) => acc + g.items.length, 0);
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
