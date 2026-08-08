/**
 * Inspector Component - Right Panel Detail Inspector & Editor
 * (Adapted from BookmarkLab web app for browser extension)
 */

import { state } from '../state.js';
import { getDomainName, getFaviconUrl, cleanTrackingParameters } from '../utils/urlUtils.js';
import { showToast } from '../app.js';

export function renderInspector(containerEl) {
  if (!containerEl) return;

  const selectedCount = state.selectedIds.size;

  if (selectedCount === 0) {
    containerEl.innerHTML = `
      <div class="inspector-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <p>Select a folder or bookmark to inspect and edit details.</p>
      </div>
    `;
    return;
  }

  if (selectedCount > 1) {
    containerEl.innerHTML = `
      <div class="inspector-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <h3>${selectedCount} Items Selected</h3>
        <p style="font-size:0.8rem; margin-top:8px;">Use the batch bar above to move or delete selected items in bulk.</p>
      </div>
    `;
    return;
  }

  // Single item selected
  const nodeId = Array.from(state.selectedIds)[0];
  const node = state.findNode(nodeId);

  if (!node) {
    containerEl.innerHTML = `<div class="inspector-empty"><p>Item not found</p></div>`;
    return;
  }

  if (node.type === 'bookmark') {
    renderBookmarkInspector(containerEl, node);
  } else if (node.type === 'folder') {
    renderFolderInspector(containerEl, node);
  }
}

function renderBookmarkInspector(containerEl, node) {
  const domain = getDomainName(node.url);
  const faviconUrl = getFaviconUrl(node.url);
  const { cleanedUrl, hasChanges } = cleanTrackingParameters(node.url);
  const allFolders = state.getAllFolders();
  const currentParent = state.findParentNode(node.id);

  const stagedBadge = `<div style="background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.25); border-radius:6px; padding:6px 10px; font-size:0.73rem; color:#818cf8; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    Edits are staged — click <strong style="margin:0 3px;">Sync to Chrome</strong> in the toolbar to apply.
   </div>`;

  containerEl.innerHTML = `
    <div class="inspector-form">
      ${stagedBadge}
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:6px;">
        <div class="favicon-img" style="width:32px; height:32px;">
          <img src="${faviconUrl}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>'" alt="" />
        </div>
        <div>
          <strong style="font-size:0.95rem; display:block;">Bookmark</strong>
          <span style="font-size:0.75rem; color:var(--text-muted); font-family:var(--font-mono);">${escapeHTML(domain)}</span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Title <span style="font-weight:normal; color:var(--text-muted); font-size:0.75rem;">(Leave empty for icon-only)</span></label>
        <input type="text" id="inp-title" class="form-input" placeholder="Icon-only bookmark" value="${escapeHTML(node.title)}" />
      </div>

      <div class="form-group">
        <label class="form-label">URL</label>
        <input type="text" id="inp-url" class="form-input" value="${escapeHTML(node.url)}" />
        ${hasChanges ? `
          <button id="btn-strip-this-url" class="btn-sm btn-accent" style="margin-top:6px;">
            ⚡ Remove Tracking Query Parameters
          </button>
        ` : ''}
      </div>

      <div class="form-group">
        <label class="form-label">Folder Location</label>
        <select id="inp-folder" class="form-select">
          ${allFolders.map(f => `
            <option value="${f.id}" ${currentParent && currentParent.id === f.id ? 'selected' : ''}>
              ${escapeHTML(f.path.join(' / '))}
            </option>
          `).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Tags (comma separated)</label>
        <input type="text" id="inp-tags" class="form-input" placeholder="e.g. dev, article, reference" value="${node.tags ? escapeHTML(node.tags.join(', ')) : ''}" />
      </div>

      <div style="display:flex; flex-direction:column; gap:8px; margin-top:16px;">
        <button id="btn-save-inspector" class="btn btn-primary">Save Changes</button>
        <button id="btn-check-this-link" class="btn btn-accent">Check Link Health</button>
        ${node.status === 'invalid' ? `
          <div style="font-size:0.75rem; color:var(--text-muted); background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.2); padding:8px 10px; border-radius:6px; line-height:1.4;">
            Note: Unreachable via background check. Links requiring authentication, HTTPS redirects, or CDN protection may still open normally when clicked.
          </div>
        ` : ''}
        <button id="btn-open-url" class="btn btn-secondary">Open in New Tab ↗</button>
        <button id="btn-delete-node" class="btn btn-danger">Delete Bookmark</button>
      </div>
    </div>
  `;

  // Event handlers
  const saveBtn = containerEl.querySelector('#btn-save-inspector');
  saveBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const newTitle = containerEl.querySelector('#inp-title').value.trim();
    const newUrl = containerEl.querySelector('#inp-url').value.trim();
    const targetFolderId = containerEl.querySelector('#inp-folder').value;
    const tagsStr = containerEl.querySelector('#inp-tags').value;
    const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);

    state.updateNode(node.id, {
      title: newTitle,
      url: newUrl || node.url,
      tags
    });

    if (currentParent && currentParent.id !== targetFolderId) {
      state.moveNode(node.id, targetFolderId);
    }
    showToast(newTitle ? `Updated "${newTitle}"` : 'Updated bookmark (Icon-only)', 'success');
  });

  const checkThisLinkBtn = containerEl.querySelector('#btn-check-this-link');
  if (checkThisLinkBtn) {
    checkThisLinkBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.updateNode(node.id, { status: 'checking' });
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);
        await fetch(node.url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
        clearTimeout(timeoutId);
        state.updateNode(node.id, { status: 'valid' });
        showToast('Link is valid!', 'success');
      } catch (e) {
        state.updateNode(node.id, { status: 'invalid' });
        showToast('Link unreachable via background check', 'warning');
      }
    });
  }

  const stripBtn = containerEl.querySelector('#btn-strip-this-url');
  if (stripBtn) {
    stripBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      containerEl.querySelector('#inp-url').value = cleanedUrl;
      state.updateNode(node.id, { url: cleanedUrl });
      showToast('Tracking parameters removed!', 'success');
    });
  }

  const openBtn = containerEl.querySelector('#btn-open-url');
  openBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (node.url) window.open(node.url, '_blank', 'noopener,noreferrer');
  });

  const deleteBtn = containerEl.querySelector('#btn-delete-node');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nodeTitle = node.title || 'Bookmark';
      state.deleteNodes([node.id]);
      showToast(`Deleted "${nodeTitle}"`, 'info');
    });
  }
}

function renderFolderInspector(containerEl, node) {
  const allFolders = state.getAllFolders().filter(f => f.id !== node.id);
  const currentParent = state.findParentNode(node.id);

  const stagedBadge = `<div style="background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.25); border-radius:6px; padding:6px 10px; font-size:0.73rem; color:#818cf8; margin-bottom:12px; display:flex; align-items:center; gap:6px;">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    Edits are staged — click <strong style="margin:0 3px;">Sync to Chrome</strong> in the toolbar to apply.
   </div>`;

  containerEl.innerHTML = `
    <div class="inspector-form">
      ${stagedBadge}
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
        <div class="tree-icon" style="width:28px; height:28px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </div>
        <strong style="font-size:0.95rem;">Folder</strong>
      </div>

      <div class="form-group">
        <label class="form-label">Folder Name</label>
        <input type="text" id="inp-folder-title" class="form-input" value="${escapeHTML(node.title)}" />
      </div>

      ${node.id !== 'root' ? `
        <div class="form-group">
          <label class="form-label">Parent Folder</label>
          <select id="inp-parent-folder" class="form-select">
            ${allFolders.map(f => `
              <option value="${f.id}" ${currentParent && currentParent.id === f.id ? 'selected' : ''}>
                ${escapeHTML(f.path.join(' / '))}
              </option>
            `).join('')}
          </select>
        </div>
      ` : ''}

      <div style="display:flex; flex-direction:column; gap:8px; margin-top:16px;">
        <button id="btn-save-folder-inspector" class="btn btn-primary">Save Folder Name</button>
        ${node.id !== 'root' ? `
          <button id="btn-delete-folder" class="btn btn-danger">Delete Folder & Contents</button>
        ` : ''}
      </div>
    </div>
  `;

  const saveBtn = containerEl.querySelector('#btn-save-folder-inspector');
  saveBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const newTitle = containerEl.querySelector('#inp-folder-title').value.trim();
    if (newTitle) {
      state.updateNode(node.id, { title: newTitle });
    }
    const parentSelect = containerEl.querySelector('#inp-parent-folder');
    if (parentSelect && currentParent && currentParent.id !== parentSelect.value) {
      state.moveNode(node.id, parentSelect.value);
    }
    showToast(`Updated folder "${newTitle || node.title}"`, 'success');
  });

  const deleteBtn = containerEl.querySelector('#btn-delete-folder');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const folderTitle = node.title || 'Folder';
      state.deleteNodes([node.id]);
      showToast(`Deleted folder "${folderTitle}"`, 'info');
    });
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
