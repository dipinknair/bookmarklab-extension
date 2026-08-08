/**
 * State Management Module with Full Undo/Redo History for BookmarkLab Extension
 * Enhanced with live Chrome sync mode tracking
 */

class AppState {
  constructor() {
    this.tree = null;
    this.activeView = 'all'; // 'all', 'folder', 'duplicates', 'uncategorized', 'dirty-urls', 'broken-links'
    this.activeFolderId = 'root';
    this.searchQuery = '';
    this.selectedIds = new Set();
    this.expandedFolderIds = new Set(['root']);
    this.viewMode = 'grid'; // 'grid' or 'list'

    // History stack for Undo / Redo
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 40;

    this.isDirty = false;

    // Live Chrome sync mode
    // When true: changes are applied directly to chrome.bookmarks API
    this.liveSync = false;

    // Event listeners
    this.listeners = [];
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach(l => l(this));
  }

  markSaved() {
    this.isDirty = false;
    this.notify();
  }

  /**
   * Resets the entire session back to empty state
   */
  resetSession() {
    this.tree = null;
    this.activeView = 'all';
    this.activeFolderId = 'root';
    this.searchQuery = '';
    this.selectedIds.clear();
    this.expandedFolderIds = new Set(['root']);
    this.history = [];
    this.historyIndex = -1;
    this.isDirty = false;
    this.liveSync = false;
    this.notify();
  }

  /**
   * Sets new tree data and pushes to history stack
   */
  setTree(newTree, saveHistory = true) {
    if (saveHistory && this.tree) {
      // Truncate redo states if pushing new state
      this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push(JSON.parse(JSON.stringify(this.tree)));
      if (this.history.length > this.maxHistory) {
        this.history.shift();
      } else {
        this.historyIndex++;
      }
      this.isDirty = true;
    } else {
      this.isDirty = false;
    }

    this.tree = JSON.parse(JSON.stringify(newTree));
    this.notify();
  }

  canUndo() {
    return this.historyIndex >= 0;
  }

  canRedo() {
    return this.historyIndex < this.history.length - 1;
  }

  undo() {
    if (!this.canUndo()) return;
    const currentSnapshot = JSON.parse(JSON.stringify(this.tree));
    // Push current snapshot for redo if needed
    if (this.historyIndex === this.history.length - 1) {
      this.history.push(currentSnapshot);
    }
    
    this.tree = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
    this.historyIndex--;
    this.notify();
  }

  redo() {
    if (!this.canRedo()) return;
    this.historyIndex++;
    this.tree = JSON.parse(JSON.stringify(this.history[this.historyIndex]));
    this.notify();
  }

  /**
   * Finds a node by ID in the tree
   */
  findNode(nodeId, node = this.tree) {
    if (!node) return null;
    if (node.id === nodeId) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = this.findNode(nodeId, child);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Finds parent node of a given child ID
   */
  findParentNode(nodeId, node = this.tree) {
    if (!node || !node.children) return null;
    for (const child of node.children) {
      if (child.id === nodeId) return node;
      if (child.children) {
        const found = this.findParentNode(nodeId, child);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Flattens all bookmarks into a single array
   */
  getAllBookmarks(node = this.tree, path = []) {
    if (!node) return [];
    let list = [];
    const currentPath = node.title ? [...path, node.title] : path;

    if (node.type === 'bookmark') {
      list.push({ ...node, path: currentPath });
    }
    if (node.children) {
      for (const child of node.children) {
        list = list.concat(this.getAllBookmarks(child, currentPath));
      }
    }
    return list;
  }

  /**
   * Flattens all folders into a single array
   */
  getAllFolders(node = this.tree, path = []) {
    if (!node) return [];
    let list = [];
    const currentPath = node.title ? [...path, node.title] : path;

    if (node.type === 'folder') {
      list.push({ ...node, path: currentPath });
    }
    if (node.children) {
      for (const child of node.children) {
        if (child.type === 'folder') {
          list = list.concat(this.getAllFolders(child, currentPath));
        }
      }
    }
    return list;
  }

  /**
   * Moves a node (bookmark or folder) to a target folder ID
   */
  moveNode(nodeId, targetFolderId) {
    if (nodeId === targetFolderId) return;

    const sourceParent = this.findParentNode(nodeId);
    const targetFolder = this.findNode(targetFolderId);

    if (!sourceParent || !targetFolder || targetFolder.type !== 'folder') return;

    const nodeIndex = sourceParent.children.findIndex(c => c.id === nodeId);
    if (nodeIndex === -1) return;

    const [movedNode] = sourceParent.children.splice(nodeIndex, 1);
    if (!targetFolder.children) targetFolder.children = [];
    targetFolder.children.push(movedNode);

    this.setTree(this.tree);
  }

  /**
   * Deletes a list of node IDs from tree
   */
  deleteNodes(nodeIds) {
    const idsSet = new Set(nodeIds);
    let changed = false;

    const deleteFromNode = (node) => {
      if (!node.children) return;
      const initialCount = node.children.length;
      node.children = node.children.filter(child => !idsSet.has(child.id));
      if (node.children.length !== initialCount) changed = true;

      node.children.forEach(deleteFromNode);
    };

    deleteFromNode(this.tree);

    if (changed) {
      this.selectedIds.clear();
      this.setTree(this.tree);
    }
  }

  /**
   * Adds a new bookmark or folder to target folder
   */
  addNode(targetFolderId, newNode) {
    const folder = this.findNode(targetFolderId) || this.tree;
    if (!folder.children) folder.children = [];
    folder.children.push(newNode);
    this.setTree(this.tree);
  }

  /**
   * Updates fields of a node
   */
  updateNode(nodeId, updates) {
    const node = this.findNode(nodeId);
    if (!node) return;
    Object.assign(node, updates);
    this.setTree(this.tree);
  }
}

export const state = new AppState();
