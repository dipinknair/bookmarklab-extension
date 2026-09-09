/**
 * Modals Controller — Deduplication, Auto-Cluster, Clean Tracking Diff, Batch Move & Batch Tag
 * Follows Single Responsibility Principle (SRP) and DRY principles.
 */

import { state } from '../state.js';
import {
  categorizeBookmark,
  getDomainName,
  getBrandName,
  cleanTrackingParameters,
  findDuplicateGroups
} from '../utils/urlUtils.js';
import { escapeHTML } from '../utils/domUtils.js';

/**
 * Opens a modal dialog by ID within the global backdrop.
 *
 * @param {string} modalId - Target modal element ID
 */
export function openModal(modalId) {
  const backdrop = document.getElementById('modal-backdrop');
  if (!backdrop) return;
  backdrop.style.display = 'flex';
  backdrop.querySelectorAll('.modal-dialog').forEach(d => d.style.display = 'none');
  const target = document.getElementById(modalId);
  if (target) target.style.display = 'flex';
}

/**
 * Closes any open modal dialog.
 */
export function closeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) backdrop.style.display = 'none';
}

/**
 * Renders duplicate bookmark groups inside the deduplication modal dialog.
 *
 * @param {Array<object>} groups - Duplicate groups returned by findDuplicateGroups
 * @param {Function} showToast - Toast notification callback
 */
function renderDedupeModal(groups, showToast) {
  const dedupeBody = document.getElementById('dedupe-modal-body');
  if (!dedupeBody) return;
  dedupeBody.innerHTML = '';

  groups.forEach(group => {
    const groupTitle = group.title && group.title.trim()
      ? group.title.trim()
      : (getDomainName(group.url) || group.url);

    const groupEl = document.createElement('div');
    groupEl.className = 'dedupe-group';
    groupEl.innerHTML = `
      <div class="dedupe-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        <span>${escapeHTML(groupTitle)} (${group.items.length} copies)</span>
      </div>
      ${group.items.map(item => {
        const itemTitle = item.title && item.title.trim()
          ? item.title.trim()
          : `${getDomainName(item.url) || 'Bookmark'} (Icon only)`;

        return `
          <div class="dedupe-item">
            <div>
              <strong>${escapeHTML(itemTitle)}</strong>
              <div class="dedupe-path">📂 ${escapeHTML(item.path && item.path.length ? item.path.join(' / ') : 'Root')}</div>
            </div>
            <button class="btn-sm btn-danger btn-keep-this" data-id="${item.id}">Keep This, Delete Others</button>
          </div>
        `;
      }).join('')}
    `;

    groupEl.querySelectorAll('.btn-keep-this').forEach(btn => {
      btn.addEventListener('click', () => {
        const keepId = btn.dataset.id;
        const deleteIds = group.items.map(i => i.id).filter(id => id !== keepId);
        state.deleteNodes(deleteIds);
        if (showToast) showToast(`Removed ${deleteIds.length} duplicate(s)`, 'info');
        closeModal();
      });
    });

    dedupeBody.appendChild(groupEl);
  });
}

/**
 * Triggers the deduplication modal programmatically or via button/hash click.
 *
 * @param {Function} showToast - Toast notification callback
 */
export function triggerDedupeModal(showToast) {
  const groups = findDuplicateGroups(state.getAllBookmarks());
  if (!groups.length) {
    if (showToast) showToast('No duplicates found — your bookmarks are clean!', 'success');
    return;
  }
  renderDedupeModal(groups, showToast);
  openModal('modal-dedupe');
}

/**
 * Triggers the auto-cluster modal programmatically or via button/hash click.
 *
 * @param {Function} [showToast] - Optional toast callback
 */
export function triggerClusterModal(showToast) {
  openModal('modal-cluster');
}

/**
 * Executes the auto-cluster algorithm.
 * Groups bookmarks by domain brand or topic category.
 *
 * @param {'domain'|'category'} mode - Clustering strategy
 * @param {boolean} onlyUncategorized - Whether to only group root/uncategorized bookmarks
 */
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
    let existingFolder = (state.tree.children || []).find(
      c => c.type === 'folder' && c.title.toLowerCase() === folderName.toLowerCase()
    );
    if (!existingFolder) {
      existingFolder = {
        id: `folder-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        title: folderName,
        type: 'folder',
        children: []
      };
      state.addNode('root', existingFolder);
    }
    const targetFolderId = existingFolder.id;
    items.forEach(bm => state.moveNode(bm.id, targetFolderId));
  });
}

/**
 * Configures all modal triggers, close handlers, and submission events.
 *
 * @param {Function} showToast - Toast notification callback
 */
export function setupModals(showToast) {
  const backdrop = document.getElementById('modal-backdrop');

  document.querySelectorAll('.modal-close, .modal-close-btn').forEach(btn => {
    btn.addEventListener('click', closeModal);
  });

  if (backdrop) {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) closeModal();
    });
  }

  // ── 1. Deduplication ───────────────────────────────────────────────────────
  const btnDedupe = document.getElementById('btn-dedupe');
  const btnAutoResolveDedupe = document.getElementById('btn-auto-resolve-dedupe');

  if (btnDedupe) {
    btnDedupe.addEventListener('click', () => triggerDedupeModal(showToast));
  }

  if (btnAutoResolveDedupe) {
    btnAutoResolveDedupe.addEventListener('click', () => {
      const groups = findDuplicateGroups(state.getAllBookmarks());
      const deleteIds = [];
      groups.forEach(g => {
        // Keep oldest by dateAdded
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

  if (btnAutoCluster) {
    btnAutoCluster.addEventListener('click', () => triggerClusterModal(showToast));
  }

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
        return `<option value="${f.id}" ${isCurrentParent ? 'selected' : ''}>📁 ${escapeHTML(pathStr)}</option>`;
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
          return `<option value="${f.id}" ${f.id === newFolder.id ? 'selected' : ''}>📁 ${escapeHTML(pathStr)}</option>`;
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

/**
 * Prepares and displays the Clean Tracking Diff modal dialog.
 * Shows original URL vs cleaned URL with stripped parameters highlighted.
 *
 * @param {Function} showToast - Toast notification callback
 */
export function triggerCleanTrackingModal(showToast) {
  const dirtyItems = [];
  const bookmarks = state.getAllBookmarks();

  bookmarks.forEach(bm => {
    const { cleanedUrl, hasChanges } = cleanTrackingParameters(bm.url);
    if (hasChanges) {
      dirtyItems.push({
        id: bm.id,
        title: bm.title || '',
        originalUrl: bm.url,
        cleanedUrl: cleanedUrl
      });
    }
  });

  if (dirtyItems.length === 0) {
    if (showToast) showToast('All URLs are clean — no tracking parameters found!', 'info');
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
    const domain = getDomainName(item.originalUrl);
    const displayTitle = item.title && item.title.trim()
      ? item.title.trim()
      : `${domain || 'Bookmark'} (Icon only)`;

    const original = escapeHTML(item.originalUrl);
    const cleaned = escapeHTML(item.cleanedUrl);

    // Highlight parameters removed
    let highlightedOriginal = original;
    const qIdx = item.originalUrl.indexOf('?');
    if (qIdx !== -1) {
      const base = escapeHTML(item.originalUrl.substring(0, qIdx));
      const query = escapeHTML(item.originalUrl.substring(qIdx));
      highlightedOriginal = `${base}<span class="url-removed">${query}</span>`;
    }

    return `
      <div class="clean-diff-item" data-id="${item.id}">
        <div class="clean-diff-header">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600;">
            <input type="checkbox" class="clean-item-checkbox" data-id="${item.id}" checked>
            <span>${escapeHTML(displayTitle)}</span>
          </label>
          <span class="clean-diff-domain">${escapeHTML(domain)}</span>
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

    closeModal();
    if (showToast) {
      showToast(`Stripped tracking parameters from ${itemsToClean.length} URL${itemsToClean.length > 1 ? 's' : ''}!`, 'success');
    }
  };

  if (confirmBtn) {
    confirmBtn.onclick = handleConfirm;
  }

  openModal('modal-clean-diff');
}
