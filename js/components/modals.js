/**
 * Modals Controller — Deduplication, Auto-Cluster & Clean Tracking Diff
 */

import { state } from '../state.js';
import {
  normalizeUrlForDedupe,
  categorizeBookmark,
  getDomainName,
  getBrandName,
  cleanTrackingParameters
} from '../utils/urlUtils.js';

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

  // ── 3. Clean Tracking Diff Trigger ─────────────────────────────────────────
  const btnCleanParams = document.getElementById('btn-clean-params');
  if (btnCleanParams) {
    btnCleanParams.addEventListener('click', () => {
      triggerCleanTrackingModal(showToast);
    });
  }

  // ── 4. Batch Move Modal ───────────────────────────────────────────────────
  const btnBatchMove = document.getElementById('btn-batch-move');
  const btnConfirmMove = document.getElementById('btn-confirm-move');
  const btnCreateMoveFolder = document.getElementById('btn-create-move-folder');
  const selectMoveFolder = document.getElementById('inp-move-target-folder');
  const inpNewFolderTitle = document.getElementById('inp-move-new-folder-title');

  function openBatchMoveModal() {
    const selectedIds = Array.from(state.selectedIds);
    if (!selectedIds.length) {
      showToast('Select at least one bookmark or folder to move.', 'info');
      return;
    }

    const descEl = document.getElementById('move-modal-desc');
    if (descEl) {
      descEl.textContent = `Select target folder to move ${selectedIds.length} item${selectedIds.length > 1 ? 's' : ''}:`;
    }

    if (selectMoveFolder) {
      const allFolders = state.getAllFolders();
      selectMoveFolder.innerHTML = allFolders.map(f => {
        const pathStr = f.path && f.path.length ? f.path.join(' / ') : (f.title || 'Root');
        const isCurrentParent = selectedIds.some(id => {
          const p = state.findParentNode(id);
          return p && p.id === f.id;
        });
        return `<option value="${f.id}" ${isCurrentParent ? 'selected' : ''}>📁 ${esc(pathStr)}</option>`;
      }).join('');
    }

    if (inpNewFolderTitle) inpNewFolderTitle.value = '';
    openModal('modal-move');
  }

  if (btnBatchMove) {
    btnBatchMove.addEventListener('click', openBatchMoveModal);
  }

  if (btnCreateMoveFolder) {
    btnCreateMoveFolder.addEventListener('click', () => {
      const name = inpNewFolderTitle ? inpNewFolderTitle.value.trim() : '';
      if (!name) {
        showToast('Please enter a folder name.', 'warning');
        return;
      }
      const parentId = selectMoveFolder ? selectMoveFolder.value : 'root';
      const newFolder = {
        id: `folder-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        title: name,
        type: 'folder',
        children: []
      };
      state.addNode(parentId, newFolder);

      const allFolders = state.getAllFolders();
      if (selectMoveFolder) {
        selectMoveFolder.innerHTML = allFolders.map(f => {
          const pathStr = f.path && f.path.length ? f.path.join(' / ') : (f.title || 'Root');
          return `<option value="${f.id}" ${f.id === newFolder.id ? 'selected' : ''}>📁 ${esc(pathStr)}</option>`;
        }).join('');
        selectMoveFolder.value = newFolder.id;
      }
      if (inpNewFolderTitle) inpNewFolderTitle.value = '';
      showToast(`Created folder "${name}"`, 'success');
    });
  }

  if (btnConfirmMove) {
    btnConfirmMove.addEventListener('click', () => {
      const targetFolderId = selectMoveFolder ? selectMoveFolder.value : 'root';
      const targetFolder = state.findNode(targetFolderId);
      const targetTitle = targetFolder ? targetFolder.title : 'Root';
      const selectedIds = Array.from(state.selectedIds);

      if (!selectedIds.length) {
        closeModal();
        return;
      }

      const moved = state.moveNodes(selectedIds, targetFolderId);
      if (moved) {
        showToast(`Moved ${selectedIds.length} item(s) to "${targetTitle}"`, 'success');
        state.selectedIds.clear();
        state.notify();
      } else {
        showToast('Could not move selected items (cannot move folder into itself)', 'warning');
      }
      closeModal();
    });
  }

  // ── 5. Batch Tag Modal ────────────────────────────────────────────────────
  const btnBatchTag = document.getElementById('btn-batch-tag');
  const btnConfirmBatchTag = document.getElementById('btn-confirm-batch-tag');
  const inpBatchTagInput = document.getElementById('inp-batch-tag-input');

  if (btnBatchTag) {
    btnBatchTag.addEventListener('click', () => {
      const selectedIds = Array.from(state.selectedIds);
      if (!selectedIds.length) {
        showToast('Select at least one bookmark to tag.', 'info');
        return;
      }
      const descEl = document.getElementById('tag-modal-desc');
      if (descEl) {
        descEl.textContent = `Add tag(s) to ${selectedIds.length} selected item${selectedIds.length > 1 ? 's' : ''}:`;
      }
      if (inpBatchTagInput) inpBatchTagInput.value = '';
      openModal('modal-tag');
    });
  }

  if (btnConfirmBatchTag) {
    btnConfirmBatchTag.addEventListener('click', () => {
      const rawTags = inpBatchTagInput ? inpBatchTagInput.value : '';
      const newTags = rawTags.split(',').map(t => t.trim()).filter(Boolean);

      if (!newTags.length) {
        showToast('Please enter at least one tag.', 'warning');
        return;
      }

      const selectedIds = Array.from(state.selectedIds);
      let updatedCount = 0;

      selectedIds.forEach(id => {
        const node = state.findNode(id);
        if (node && node.type === 'bookmark') {
          const existingTags = node.tags || [];
          const combined = Array.from(new Set([...existingTags, ...newTags]));
          state.updateNode(id, { tags: combined });
          updatedCount++;
        }
      });

      showToast(`Added tag(s) to ${updatedCount} bookmark(s)!`, 'success');
      closeModal();
    });
  }
}

export function triggerCleanTrackingModal(showToast) {
  const dirtyItems = [];
  const bookmarks = state.getAllBookmarks();

  bookmarks.forEach(bm => {
    const { cleanedUrl, hasChanges } = cleanTrackingParameters(bm.url);
    if (hasChanges) {
      dirtyItems.push({
        id: bm.id,
        title: bm.title || 'Untitled',
        originalUrl: bm.url,
        cleanedUrl: cleanedUrl
      });
    }
  });

  if (dirtyItems.length === 0) {
    showToast('All URLs are clean — no tracking parameters found!', 'info');
    return;
  }

  const backdrop = document.getElementById('modal-backdrop');
  const modal = document.getElementById('modal-clean-diff');
  const descEl = document.getElementById('clean-diff-desc');
  const bodyEl = document.getElementById('clean-diff-body');
  const confirmBtn = document.getElementById('btn-confirm-clean-all');
  const selectAllCb = document.getElementById('clean-select-all');
  const selectedCountSpan = document.getElementById('clean-selected-count');

  if (!backdrop || !modal || !bodyEl) return;

  if (descEl) {
    descEl.innerHTML = `Found <strong>${dirtyItems.length}</strong> bookmark${dirtyItems.length > 1 ? 's' : ''} with tracking parameters (utm_*, fbclid, gclid, etc.):`;
  }

  if (selectAllCb) selectAllCb.checked = true;

  bodyEl.innerHTML = dirtyItems.map(item => {
    const original = esc(item.originalUrl);
    const cleaned = esc(item.cleanedUrl);

    // Highlight parameters removed
    let highlightedOriginal = original;
    const qIdx = item.originalUrl.indexOf('?');
    if (qIdx !== -1) {
      const base = esc(item.originalUrl.substring(0, qIdx));
      const query = esc(item.originalUrl.substring(qIdx));
      highlightedOriginal = `${base}<span class="url-removed">${query}</span>`;
    }

    const domain = getDomainName(item.originalUrl);

    return `
      <div class="clean-diff-item" data-id="${item.id}">
        <div class="clean-diff-header">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600;">
            <input type="checkbox" class="clean-item-checkbox" data-id="${item.id}" checked>
            <span>${esc(item.title)}</span>
          </label>
          <span class="clean-diff-domain">${esc(domain)}</span>
        </div>
        <div class="clean-diff-row">
          <span class="diff-tag old">Original</span>
          <span class="url-text">${highlightedOriginal}</span>
        </div>
        <div class="clean-diff-row">
          <span class="diff-tag new">Cleaned</span>
          <span class="url-text">${cleaned}</span>
        </div>
      </div>
    `;
  }).join('');

  function updateCount() {
    const checkboxes = bodyEl.querySelectorAll('.clean-item-checkbox');
    const checked = Array.from(checkboxes).filter(cb => cb.checked);
    const count = checked.length;

    if (selectedCountSpan) {
      selectedCountSpan.textContent = `${count} of ${dirtyItems.length} selected`;
    }

    if (confirmBtn) {
      if (count > 0) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = `Strip Parameters from ${count} Selected URL${count > 1 ? 's' : ''}`;
      } else {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'No URLs Selected';
      }
    }

    if (selectAllCb) {
      selectAllCb.checked = count === dirtyItems.length;
      selectAllCb.indeterminate = count > 0 && count < dirtyItems.length;
    }
  }

  bodyEl.querySelectorAll('.clean-item-checkbox').forEach(cb => {
    cb.addEventListener('change', updateCount);
  });

  if (selectAllCb) {
    selectAllCb.onclick = () => {
      const isChecked = selectAllCb.checked;
      bodyEl.querySelectorAll('.clean-item-checkbox').forEach(cb => {
        cb.checked = isChecked;
      });
      updateCount();
    };
  }

  updateCount();

  const handleConfirm = () => {
    const checkedBoxes = bodyEl.querySelectorAll('.clean-item-checkbox:checked');
    const selectedIds = new Set(Array.from(checkedBoxes).map(cb => cb.dataset.id));

    const itemsToClean = dirtyItems.filter(item => selectedIds.has(item.id));
    if (itemsToClean.length === 0) return;

    itemsToClean.forEach(item => {
      state.updateNode(item.id, { url: item.cleanedUrl });
    });

    if (backdrop) backdrop.style.display = 'none';
    showToast(`Stripped tracking parameters from ${itemsToClean.length} URL${itemsToClean.length > 1 ? 's' : ''}!`, 'success');
  };

  if (confirmBtn) {
    confirmBtn.onclick = handleConfirm;
  }

  backdrop.style.display = 'flex';
  backdrop.querySelectorAll('.modal-dialog').forEach(d => d.style.display = 'none');
  modal.style.display = 'flex';
}

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
