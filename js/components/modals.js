/**
 * Modals Controller — Deduplication & Auto-Cluster
 * (Export and browser guide modals removed — this is an extension, not a file importer)
 */

import { state } from '../state.js';
import { normalizeUrlForDedupe, categorizeBookmark, getDomainName, getBrandName } from '../utils/urlUtils.js';

export function setupModals(showToast) {
  const backdrop = document.getElementById('modal-backdrop');

  function openModal(modalId) {
    if (!backdrop) return;
    backdrop.style.display = 'flex';
    backdrop.querySelectorAll('.modal-dialog').forEach(d => d.style.display = 'none');
    const target = document.getElementById(modalId);
    if (target) target.style.display = 'flex';
  }

  function closeModal() {
    if (backdrop) backdrop.style.display = 'none';
  }

  document.querySelectorAll('.modal-close, .modal-close-btn').forEach(btn => {
    btn.addEventListener('click', closeModal);
  });
  if (backdrop) backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });

  // ── 1. Deduplication ───────────────────────────────────────────────────────
  const btnDedupe         = document.getElementById('btn-dedupe');
  const dedupeBody        = document.getElementById('dedupe-modal-body');
  const btnAutoResolveDedupe = document.getElementById('btn-auto-resolve-dedupe');

  function findDuplicateGroups() {
    const all = state.getAllBookmarks();
    const urlMap = new Map();
    all.forEach(bm => {
      const norm = normalizeUrlForDedupe(bm.url);
      if (!urlMap.has(norm)) urlMap.set(norm, []);
      urlMap.get(norm).push(bm);
    });
    return [...urlMap.values()].filter(items => items.length > 1)
      .map(items => ({ title: items[0].title, url: items[0].url, items }));
  }

  function renderDedupeModal(groups) {
    if (!dedupeBody) return;
    dedupeBody.innerHTML = '';
    groups.forEach(group => {
      const groupEl = document.createElement('div');
      groupEl.className = 'dedupe-group';
      groupEl.innerHTML = `
        <div class="dedupe-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          <span>${esc(group.title)} (${group.items.length} copies)</span>
        </div>
        ${group.items.map(item => `
          <div class="dedupe-item">
            <div>
              <strong>${esc(item.title)}</strong>
              <div class="dedupe-path">📂 ${esc(item.path ? item.path.join(' / ') : 'Root')}</div>
            </div>
            <button class="btn-sm btn-danger btn-keep-this" data-id="${item.id}">Keep This, Delete Others</button>
          </div>
        `).join('')}
      `;
      groupEl.querySelectorAll('.btn-keep-this').forEach(btn => {
        btn.addEventListener('click', () => {
          const keepId = btn.dataset.id;
          const deleteIds = group.items.map(i => i.id).filter(id => id !== keepId);
          state.deleteNodes(deleteIds);
          showToast(`Removed ${deleteIds.length} duplicate(s)`, 'info');
          closeModal();
        });
      });
      dedupeBody.appendChild(groupEl);
    });
  }

  if (btnDedupe) {
    btnDedupe.addEventListener('click', () => {
      const groups = findDuplicateGroups();
      if (!groups.length) { showToast('No duplicates found — your bookmarks are clean!', 'success'); return; }
      renderDedupeModal(groups);
      openModal('modal-dedupe');
    });
  }

  if (btnAutoResolveDedupe) {
    btnAutoResolveDedupe.addEventListener('click', () => {
      const groups = findDuplicateGroups();
      const deleteIds = [];
      groups.forEach(g => {
        const sorted = [...g.items].sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
        sorted.slice(1).forEach(r => deleteIds.push(r.id));
      });
      if (deleteIds.length) {
        state.deleteNodes(deleteIds);
        showToast(`Auto-cleaned ${deleteIds.length} duplicates!`, 'success');
      }
      closeModal();
    });
  }

  // ── 2. Auto-Cluster ────────────────────────────────────────────────────────
  const btnAutoCluster = document.getElementById('btn-auto-cluster');
  const btnRunCluster  = document.getElementById('btn-run-cluster');

  if (btnAutoCluster) btnAutoCluster.addEventListener('click', () => openModal('modal-cluster'));

  if (btnRunCluster) {
    btnRunCluster.addEventListener('click', () => {
      const modeEl       = document.querySelector('input[name="cluster-mode"]:checked');
      const onlyUncatEl  = document.getElementById('cluster-move-uncategorized');
      const mode         = modeEl ? modeEl.value : 'domain';
      const onlyUncat    = onlyUncatEl ? onlyUncatEl.checked : true;

      runAutoCluster(mode, onlyUncat);
      closeModal();
      showToast('Bookmarks auto-clustered into category folders!', 'success');
    });
  }

  function runAutoCluster(mode, onlyUncategorized) {
    let bookmarks = state.getAllBookmarks();

    if (onlyUncategorized) {
      bookmarks = bookmarks.filter(bm => {
        const parent = state.findParentNode(bm.id);
        return !parent || parent.id === 'root';
      });
    }

    const folderMap = new Map();
    bookmarks.forEach(bm => {
      let folderName = mode === 'domain'
        ? getBrandName(getDomainName(bm.url))
        : categorizeBookmark(bm.url, bm.title);
      if (!folderMap.has(folderName)) folderMap.set(folderName, []);
      folderMap.get(folderName).push(bm);
    });

    folderMap.forEach((items, folderName) => {
      let existingFolder = state.tree.children.find(
        c => c.type === 'folder' && c.title.toLowerCase() === folderName.toLowerCase()
      );
      if (!existingFolder) {
        existingFolder = {
          id: `folder-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          title: folderName, type: 'folder', children: []
        };
        state.tree.children.push(existingFolder);
      }
      items.forEach(bm => state.moveNode(bm.id, existingFolder.id));
    });

    state.setTree(state.tree);
  }
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
