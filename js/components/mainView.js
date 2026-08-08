/**
 * Main Workbench View Component (Grid View & List View)
 */

import { state } from '../state.js';
import { getDomainName, getFaviconUrl, cleanTrackingParameters, normalizeUrlForDedupe } from '../utils/urlUtils.js';

export function renderMainView(containerEl, dropZoneEl, breadcrumbsEl, batchBarEl, selectedCountEl) {
  if (!state.tree) {
    if (dropZoneEl) dropZoneEl.style.display = 'flex';
    if (containerEl) containerEl.style.display = 'none';
    if (batchBarEl) batchBarEl.style.display = 'none';
    return;
  }

  if (dropZoneEl) dropZoneEl.style.display = 'none';
  if (state.viewMode === 'list') {
    if (containerEl) containerEl.style.display = 'flex';
    containerEl.className = 'bookmark-grid bookmark-list-view';
  } else {
    if (containerEl) containerEl.style.display = 'grid';
    containerEl.className = 'bookmark-grid';
  }

  // Get active list of bookmarks based on state.activeView & search
  let bookmarks = getFilteredBookmarks();

  // Render Breadcrumbs
  renderBreadcrumbs(breadcrumbsEl);

  // Render Batch Bar
  renderBatchBar(batchBarEl, selectedCountEl);

  // Map existing child cards by item ID
  const existingMap = new Map();
  Array.from(containerEl.children).forEach(child => {
    if (child.dataset && child.dataset.id) {
      existingMap.set(child.dataset.id, child);
    }
  });

  const newIds = new Set(bookmarks.map(b => b.id));

  // Remove cards that are no longer in bookmarks list
  Array.from(containerEl.children).forEach(child => {
    if (child.dataset && child.dataset.id && !newIds.has(child.dataset.id)) {
      child.remove();
    } else if (!child.dataset || !child.dataset.id) {
      child.remove();
    }
  });

  bookmarks.forEach(item => {
    const existing = existingMap.get(item.id);
    if (existing && existing.dataset.viewMode === state.viewMode) {
      // Update status/selection in-place and ensure DOM element order matches bookmarks array
      updateCardInPlace(existing, item);
      containerEl.appendChild(existing);
    } else {
      const card = item.type === 'folder'
        ? createFolderCard(item)
        : (state.viewMode === 'list' ? createBookmarkRow(item) : createBookmarkCard(item));
      card.dataset.viewMode = state.viewMode;
      if (existing) {
        containerEl.replaceChild(card, existing);
      } else {
        containerEl.appendChild(card);
      }
    }
  });
}

function updateCardInPlace(card, item) {
  const isSelected = state.selectedIds.has(item.id);
  card.classList.toggle('selected', isSelected);

  if (item.type === 'bookmark') {
    const cardTop = card.querySelector('.card-top') || card.querySelector('div[style*="display:flex"]');
    if (cardTop) {
      const oldBadge = cardTop.querySelector('.health-badge');
      if (oldBadge) {
        oldBadge.remove();
      }
      if (item.status) {
        const temp = document.createElement('div');
        temp.innerHTML = renderHealthBadge(item.status);
        if (temp.firstElementChild) {
          cardTop.appendChild(temp.firstElementChild);
        }
      }
    }
  }
}

function getFilteredBookmarks() {
  let list = [];
  const allBookmarks = state.getAllBookmarks();

  if (state.activeView === 'all') {
    list = state.tree ? (state.tree.children || []) : [];
  } else if (state.activeView === 'folder') {
    const folder = state.findNode(state.activeFolderId);
    if (folder && folder.children) {
      list = folder.children;
    }
  } else if (state.activeView === 'duplicates') {
    // Find URL duplicates
    const urlMap = new Map();
    allBookmarks.forEach(bm => {
      const norm = normalizeUrlForDedupe(bm.url);
      if (!urlMap.has(norm)) urlMap.set(norm, []);
      urlMap.get(norm).push(bm);
    });
    urlMap.forEach(group => {
      if (group.length > 1) {
        list = list.concat(group);
      }
    });
  } else if (state.activeView === 'uncategorized') {
    // Sitting in root or unsorted folder
    list = allBookmarks.filter(bm => {
      const parent = state.findParentNode(bm.id);
      return !parent || parent.id === 'root' || parent.title.toLowerCase().includes('unsorted') || parent.title.toLowerCase().includes('other');
    });
  } else if (state.activeView === 'dirty-urls') {
    list = allBookmarks.filter(bm => {
      const { hasChanges } = cleanTrackingParameters(bm.url);
      return hasChanges;
    });
  } else if (state.activeView === 'broken-links') {
    list = allBookmarks.filter(bm => bm.status === 'invalid');
  }

  // Filter by search query if set
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    list = allBookmarks.filter(bm => 
      (bm.title && bm.title.toLowerCase().includes(q)) ||
      (bm.url && bm.url.toLowerCase().includes(q)) ||
      (bm.tags && bm.tags.some(t => t.toLowerCase().includes(q))) ||
      (bm.url && getDomainName(bm.url).toLowerCase().includes(q))
    );
  }

  return list;
}

function renderHealthBadge(status) {
  if (status === 'valid') {
    return `
      <span class="health-badge valid" title="Link status: Working & Valid">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </span>
    `;
  }
  if (status === 'invalid') {
    return `
      <span class="health-badge invalid" title="Link status: Unreachable via background check (may be blocked by server rules, HTTPS redirect, or login requirement)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </span>
    `;
  }
  if (status === 'checking') {
    return `
      <span class="health-badge checking" title="Checking link...">
        <svg class="spin-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.83 6.72 2.24"/></svg>
      </span>
    `;
  }
  return '';
}

function createFolderCard(folder) {
  const card = document.createElement('div');
  const isSelected = state.selectedIds.has(folder.id);
  card.className = `bookmark-card folder-card ${isSelected ? 'selected' : ''}`;
  card.setAttribute('draggable', 'true');
  card.dataset.id = folder.id;

  const count = folder.children ? folder.children.filter(c => c.type === 'bookmark').length : 0;

  card.innerHTML = `
    <div class="card-top">
      <div class="tree-icon" style="color:var(--accent-primary); width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      </div>
      <div class="card-title" title="${escapeHTML(folder.title)}">${escapeHTML(folder.title)}</div>
    </div>
    <div style="display:flex; align-items:center; justify-space-between; margin-top:8px;">
      <span style="font-size:0.75rem; color:var(--text-muted); font-weight:500;">${count} bookmark${count !== 1 ? 's' : ''}</span>
      <button class="btn-open-folder-link" title="Open folder contents" style="background:var(--bg-glass-card); border:1px solid var(--border-color); color:var(--accent-primary); font-size:0.75rem; font-weight:600; cursor:pointer; padding:2px 8px; border-radius:4px;">
        Open ↗
      </button>
    </div>
  `;

  // Drag start
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', folder.id);
    card.style.opacity = '0.5';
  });

  card.addEventListener('dragend', () => {
    card.style.opacity = '1';
  });

  // Drop target logic to receive bookmarks into this folder!
  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    card.classList.add('drag-over');
  });

  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over');
  });

  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('drag-over');
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== folder.id) {
      state.moveNode(draggedId, folder.id);
    }
  });

  // Open folder button click
  const openFolderBtn = card.querySelector('.btn-open-folder-link');
  if (openFolderBtn) {
    openFolderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.activeFolderId = folder.id;
      state.activeView = 'folder';
      state.expandedFolderIds.add(folder.id);
      state.notify();
    });
  }

  // Double-click opens folder contents
  card.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    state.activeFolderId = folder.id;
    state.activeView = 'folder';
    state.expandedFolderIds.add(folder.id);
    state.notify();
  });

  // Single-click selects folder (opens Inspector with Delete option)
  card.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey) {
      if (state.selectedIds.has(folder.id)) state.selectedIds.delete(folder.id);
      else state.selectedIds.add(folder.id);
    } else {
      state.selectedIds.clear();
      state.selectedIds.add(folder.id);
    }
    state.notify();
  });

  return card;
}

function createBookmarkCard(item) {
  const card = document.createElement('div');
  const isSelected = state.selectedIds.has(item.id);
  card.className = `bookmark-card ${isSelected ? 'selected' : ''}`;
  card.setAttribute('draggable', 'true');
  card.dataset.id = item.id;

  const domain = getDomainName(item.url);
  const faviconUrl = getFaviconUrl(item.url);
  const { hasChanges } = cleanTrackingParameters(item.url);
  const isIconOnly = !item.title || !item.title.trim();
  const displayTitle = isIconOnly ? (domain || 'Icon-only Link') : item.title;

  card.innerHTML = `
    <div class="card-top">
      <div class="favicon-img">
        <img src="${faviconUrl}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>'" alt="" />
      </div>
      <div class="card-title ${isIconOnly ? 'icon-only-title' : ''}" title="${escapeHTML(displayTitle)}">
        ${escapeHTML(displayTitle)} ${isIconOnly ? '<span style="font-size:0.7rem; color:var(--text-muted); font-weight:normal; font-style:italic; margin-left:4px;">(Icon only)</span>' : ''}
      </div>
      ${renderHealthBadge(item.status)}
    </div>
    <div class="card-domain">${escapeHTML(domain)}</div>
    ${item.tags && item.tags.length > 0 ? `
      <div class="card-tags">
        ${item.tags.map(t => `<span class="tag-badge">#${escapeHTML(t)}</span>`).join('')}
      </div>
    ` : ''}
    <div class="card-footer">
      <span>${item.path ? escapeHTML(item.path.slice(-2).join(' / ')) : ''}</span>
      ${hasChanges ? `<span style="color:var(--accent-amber);" title="Contains tracking parameters">⚡ Tagged</span>` : ''}
    </div>
  `;

  // Drag start
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', item.id);
    card.style.opacity = '0.5';
  });

  card.addEventListener('dragend', () => {
    card.style.opacity = '1';
  });

  // Click & Selection
  card.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey) {
      if (state.selectedIds.has(item.id)) state.selectedIds.delete(item.id);
      else state.selectedIds.add(item.id);
    } else {
      state.selectedIds.clear();
      state.selectedIds.add(item.id);
    }
    state.notify();
  });

  // Double click opens URL in new tab
  card.addEventListener('dblclick', () => {
    if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
  });

  return card;
}

function createBookmarkRow(item) {
  const row = document.createElement('div');
  const isSelected = state.selectedIds.has(item.id);
  row.className = `bookmark-list-row ${isSelected ? 'selected' : ''}`;
  row.setAttribute('draggable', 'true');
  row.dataset.id = item.id;

  const domain = getDomainName(item.url);
  const faviconUrl = getFaviconUrl(item.url);

  row.innerHTML = `
    <div class="favicon-img">
      <img src="${faviconUrl}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>'" alt="" />
    </div>
    <div style="flex:1; min-width:0;">
      <div style="display:flex; align-items:center; gap:6px;">
        <div class="card-title" title="${escapeHTML(item.title)}">${escapeHTML(item.title)}</div>
        ${renderHealthBadge(item.status)}
      </div>
      <div class="card-domain">${escapeHTML(domain)} &bull; ${escapeHTML(item.url)}</div>
    </div>
    <div style="font-size:0.75rem; color:var(--text-muted);">
      ${item.path ? escapeHTML(item.path.slice(-1)[0]) : ''}
    </div>
  `;

  row.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', item.id);
    row.style.opacity = '0.5';
  });

  row.addEventListener('dragend', () => {
    row.style.opacity = '1';
  });

  row.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey) {
      if (state.selectedIds.has(item.id)) state.selectedIds.delete(item.id);
      else state.selectedIds.add(item.id);
    } else {
      state.selectedIds.clear();
      state.selectedIds.add(item.id);
    }
    state.notify();
  });

  return row;
}

function renderBreadcrumbs(el) {
  if (!el) return;
  el.innerHTML = '';

  if (state.activeView === 'all') {
    el.innerHTML = `<span class="crumb active">All Bookmarks</span>`;
    return;
  }
  if (state.activeView === 'duplicates') {
    el.innerHTML = `<span class="crumb active">Smart View &rsaquo; Duplicates</span>`;
    return;
  }
  if (state.activeView === 'uncategorized') {
    el.innerHTML = `<span class="crumb active">Smart View &rsaquo; Uncategorized</span>`;
    return;
  }
  if (state.activeView === 'dirty-urls') {
    el.innerHTML = `<span class="crumb active">Smart View &rsaquo; With Tracking Tags</span>`;
    return;
  }
  if (state.activeView === 'broken-links') {
    el.innerHTML = `<span class="crumb active">Smart View &rsaquo; Unreachable Links</span>`;
    return;
  }

  // Active folder path
  const folder = state.findNode(state.activeFolderId);
  if (!folder) {
    el.innerHTML = `<span class="crumb active">All Bookmarks</span>`;
    return;
  }

  const path = [];
  let curr = folder;
  while (curr) {
    path.unshift(curr);
    curr = state.findParentNode(curr.id);
  }

  path.forEach((f, idx) => {
    const span = document.createElement('span');
    span.className = `crumb ${idx === path.length - 1 ? 'active' : ''}`;
    span.textContent = f.title;
    span.addEventListener('click', () => {
      state.activeFolderId = f.id;
      state.activeView = 'folder';
      state.notify();
    });
    el.appendChild(span);

    if (idx < path.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'crumb-separator';
      sep.textContent = ' / ';
      el.appendChild(sep);
    }
  });
}

function renderBatchBar(batchBarEl, countEl) {
  if (!batchBarEl) return;
  const count = state.selectedIds.size;
  if (count > 0) {
    batchBarEl.style.display = 'flex';
    if (countEl) countEl.textContent = `${count} item${count > 1 ? 's' : ''} selected`;
  } else {
    batchBarEl.style.display = 'none';
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
