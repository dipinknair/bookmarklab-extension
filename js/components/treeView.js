/**
 * Tree View Component - Left Sidebar Folders & Bookmarks Explorer
 * Displays folders and individual bookmarks in exact sequential order
 */

import { state } from '../state.js';
import { getDomainName, getFaviconUrl } from '../utils/urlUtils.js';

export function renderTreeView(containerEl) {
  if (!containerEl) return;
  if (!state.tree) {
    containerEl.innerHTML = `<div style="padding:16px; color:var(--text-muted); font-size:0.8rem; text-align:center;">No bookmarks loaded</div>`;
    return;
  }

  containerEl.innerHTML = '';

  // Ensure root is expanded by default
  if (!state.expandedFolderIds.has('root')) {
    state.expandedFolderIds.add('root');
  }

  function countFolderBookmarks(folderNode) {
    if (!folderNode.children) return 0;
    let count = 0;
    for (const child of folderNode.children) {
      if (child.type === 'bookmark') count++;
      else if (child.type === 'folder') count += countFolderBookmarks(child);
    }
    return count;
  }

  function createBookmarkTreeElement(bookmarkNode, depth = 0) {
    const isSelected = state.selectedIds.has(bookmarkNode.id);
    const domain = getDomainName(bookmarkNode.url);
    const faviconUrl = getFaviconUrl(bookmarkNode.url);
    const isIconOnly = !bookmarkNode.title || !bookmarkNode.title.trim();

    const row = document.createElement('div');
    row.className = `tree-row tree-bookmark-row ${isIconOnly ? 'tree-icon-only-row' : ''} ${isSelected ? 'active' : ''}`;
    row.dataset.bookmarkId = bookmarkNode.id;
    row.style.paddingLeft = `${depth * 10 + 10}px`;
    row.title = isIconOnly ? (domain || bookmarkNode.url) : `${bookmarkNode.title} (${domain})`;

    // Toggle spacer for chevron alignment
    const spacer = document.createElement('span');
    spacer.className = 'tree-toggle';
    spacer.style.visibility = 'hidden';

    // Favicon icon
    const iconSpan = document.createElement('span');
    iconSpan.className = 'tree-icon tree-bookmark-icon';
    iconSpan.innerHTML = `<img src="${faviconUrl}" width="14" height="14" alt="" onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2214%22 height=%2214%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2394a3b8%22 stroke-width=%222%22><circle cx=%2212%22 cy=%2212%22 r=%2210%22/><line x1=%222%22 y1=%2212%22 x2=%2222%22 y2=%2212%22/></svg>';">`;

    row.appendChild(spacer);
    row.appendChild(iconSpan);

    // Only render text label if bookmark has a title
    if (!isIconOnly) {
      const label = document.createElement('span');
      label.className = 'tree-label tree-bookmark-label';
      label.textContent = bookmarkNode.title;
      row.appendChild(label);
    }

    // Health Status Badge Indicator
    if (bookmarkNode.status) {
      const healthBadge = document.createElement('span');
      healthBadge.className = `tree-health-dot ${bookmarkNode.status}`;
      if (bookmarkNode.status === 'valid') {
        healthBadge.title = 'Link status: Valid & Reachable';
        healthBadge.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
      } else if (bookmarkNode.status === 'invalid') {
        healthBadge.title = 'Link status: Unreachable / Failed';
        healthBadge.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      } else if (bookmarkNode.status === 'checking') {
        healthBadge.title = 'Checking link health...';
        healthBadge.innerHTML = `<span class="spinner-dot"></span>`;
      }
      row.appendChild(healthBadge);
    }

    // Delete bookmark button on hover
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'tree-row-delete';
    deleteBtn.title = `Delete bookmark`;
    deleteBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.deleteNodes([bookmarkNode.id]);
    });
    row.appendChild(deleteBtn);

    // Row Click Handler - selects bookmark and navigates main view
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      state.selectedIds.clear();
      state.selectedIds.add(bookmarkNode.id);

      // Find where this bookmark lives
      const parent = state.findParentNode(bookmarkNode.id);
      if (parent && parent.id !== 'root') {
        // Bookmark is inside a subfolder — show the folder contents in main view
        state.activeFolderId = parent.id;
        state.activeView = 'folder';
        state.expandedFolderIds.add(parent.id);
      } else {
        // Bookmark is at root level — show the 'all' view
        state.activeFolderId = 'root';
        state.activeView = 'all';
      }

      state.notify();
    });

    // Draggable bookmark item
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      e.dataTransfer.setData('text/plain', bookmarkNode.id);
      row.style.opacity = '0.5';
    });
    row.addEventListener('dragend', () => {
      row.style.opacity = '1';
    });

    return row;
  }

  function createFolderElement(folderNode, depth = 0) {
    const isExpanded = state.expandedFolderIds.has(folderNode.id);
    const isActive = state.activeFolderId === folderNode.id && state.activeView === 'folder';
    const totalCount = countFolderBookmarks(folderNode);

    const nodeWrapper = document.createElement('div');
    nodeWrapper.className = 'tree-node';

    const row = document.createElement('div');
    row.className = `tree-row ${isActive ? 'active' : ''}`;
    row.dataset.folderId = folderNode.id;
    row.style.paddingLeft = `${depth * 10 + 10}px`;

    // Folder toggle chevron icon
    const hasChildren = folderNode.children && folderNode.children.length > 0;
    const toggleIcon = document.createElement('span');
    toggleIcon.className = `tree-toggle ${isExpanded ? 'expanded' : ''}`;
    toggleIcon.innerHTML = hasChildren ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>` : '';

    toggleIcon.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isExpanded) {
        state.expandedFolderIds.delete(folderNode.id);
      } else {
        state.expandedFolderIds.add(folderNode.id);
      }
      state.notify();
    });

    // Folder Icon
    const folderIcon = document.createElement('span');
    folderIcon.className = 'tree-icon';
    folderIcon.innerHTML = isExpanded 
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;

    // Title label
    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = folderNode.title;

    // Count badge
    const badge = document.createElement('span');
    badge.className = 'tree-badge';
    badge.textContent = totalCount;

    row.appendChild(toggleIcon);
    row.appendChild(folderIcon);
    row.appendChild(label);
    row.appendChild(badge);

    // Inline Delete Folder button (if non-root)
    if (folderNode.id !== 'root') {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'tree-row-delete';
      deleteBtn.title = `Delete folder "${folderNode.title}" & contents`;
      deleteBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.deleteNodes([folderNode.id]);
        if (state.activeFolderId === folderNode.id) {
          state.activeFolderId = 'root';
          state.activeView = 'all';
        }
      });
      row.appendChild(deleteBtn);
    }

    // Row Click Event
    row.addEventListener('click', () => {
      state.activeFolderId = folderNode.id;
      state.activeView = 'folder';
      state.selectedIds.clear();
      state.selectedIds.add(folderNode.id);
      if (!state.expandedFolderIds.has(folderNode.id)) {
        state.expandedFolderIds.add(folderNode.id);
      }
      state.notify();
    });

    row.setAttribute('draggable', 'true');

    // Drag start for folder tree row
    row.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      e.dataTransfer.setData('text/plain', folderNode.id);
      row.style.opacity = '0.5';
    });

    row.addEventListener('dragend', () => {
      row.style.opacity = '1';
    });

    // Drag and Drop Target logic
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      row.classList.add('drag-over');
    });

    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over');
    });

    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const draggedNodeId = e.dataTransfer.getData('text/plain');
      if (draggedNodeId && draggedNodeId !== folderNode.id) {
        state.moveNode(draggedNodeId, folderNode.id);
      }
    });

    nodeWrapper.appendChild(row);

    // Render children (both folders AND bookmarks in exact sequential order) if expanded
    if (isExpanded && folderNode.children) {
      const childrenWrapper = document.createElement('div');
      childrenWrapper.className = 'tree-children';

      folderNode.children.forEach(child => {
        if (child.type === 'folder') {
          childrenWrapper.appendChild(createFolderElement(child, depth + 1));
        } else if (child.type === 'bookmark') {
          childrenWrapper.appendChild(createBookmarkTreeElement(child, depth + 1));
        }
      });

      nodeWrapper.appendChild(childrenWrapper);
    }

    return nodeWrapper;
  }

  containerEl.appendChild(createFolderElement(state.tree, 0));
}
