/**
 * State Management Module with Deterministic Undo/Redo History for BookmarkLab
 * Follows Single Responsibility Principle (SRP) and Separation of Concerns (SoC).
 */

/**
 * Deep clones any JavaScript object safely using structuredClone if available,
 * falling back to JSON serialization.
 *
 * @param {*} data - Data to clone
 * @returns {*} Deep clone of input data
 */
export function deepClone(data) {
  if (data === null || typeof data !== 'object') return data;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(data);
    } catch (e) {
      // Fallback for non-cloneable objects
    }
  }
  return JSON.parse(JSON.stringify(data));
}

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
    this.liveSync = false;

    // Pub/Sub listeners
    this.listeners = [];
  }

  /**
   * Subscribes a listener callback to state mutations.
   *
   * @param {Function} listener - Callback function(state)
   * @returns {Function} Unsubscribe function
   */
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Notifies all registered subscribers of state changes.
   */
  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch (err) {
        console.error('[BookmarkLab State] Listener error:', err);
      }
    }
  }

  /**
   * Marks current state as saved / clean.
   */
  markSaved() {
    this.isDirty = false;
    this.notify();
  }

  /**
   * Resets the entire session back to empty state.
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
   * Sets new tree data and manages history stack deterministically.
   *
   * @param {object} newTree - Tree root node
   * @param {boolean} [saveHistory=true] - Whether to record this mutation in undo history
   */
  setTree(newTree, saveHistory = true) {
    if (!newTree) {
      this.tree = null;
      this.notify();
      return;
    }

    const cloned = deepClone(newTree);

    if (saveHistory && this.tree) {
      // Discard any redo branch if modifying after an undo
      this.history = this.history.slice(0, this.historyIndex + 1);
      this.history.push(cloned);

      if (this.history.length > this.maxHistory) {
        this.history.shift();
      }
      this.historyIndex = this.history.length - 1;
      this.isDirty = true;
    } else {
      // Initial load or non-undoable reset
      this.history = [cloned];
      this.historyIndex = 0;
      this.isDirty = false;
    }

    this.tree = deepClone(cloned);
    this.notify();
  }

  /**
   * Checks if undo operation is currently available.
   *
   * @returns {boolean}
   */
  canUndo() {
    return this.historyIndex > 0;
  }

  /**
   * Checks if redo operation is currently available.
   *
   * @returns {boolean}
   */
  canRedo() {
    return this.historyIndex >= 0 && this.historyIndex < this.history.length - 1;
  }

  /**
   * Undoes the last mutation, stepping back one snapshot in history.
   */
  undo() {
    if (!this.canUndo()) return;
    this.historyIndex--;
    this.tree = deepClone(this.history[this.historyIndex]);
    this.notify();
  }

  /**
   * Redoes the last undone mutation, stepping forward one snapshot in history.
   */
  redo() {
    if (!this.canRedo()) return;
    this.historyIndex++;
    this.tree = deepClone(this.history[this.historyIndex]);
    this.notify();
  }

  /**
   * Finds a node by ID in the tree.
   *
   * @param {string} nodeId - Node ID
   * @param {object} [node=this.tree] - Starting root
   * @returns {object|null}
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
   * Finds parent node of a given child ID.
   *
   * @param {string} nodeId - Target child node ID
   * @param {object} [node=this.tree] - Starting root
   * @returns {object|null} Parent node or null
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
   * Flattens all bookmarks into a single array with full folder paths.
   *
   * @param {object} [node=this.tree] - Starting node
   * @param {Array<string>} [path=[]] - Current ancestor titles
   * @returns {Array<object>}
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
   * Flattens all folders into a single array with full folder paths.
   *
   * @param {object} [node=this.tree] - Starting node
   * @param {Array<string>} [path=[]] - Current ancestor titles
   * @returns {Array<object>}
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
   * Checks if targetChildId is equal to or a descendant of parentId.
   *
   * @param {string} targetChildId
   * @param {string} parentId
   * @returns {boolean}
   */
  isDescendantOf(targetChildId, parentId) {
    if (targetChildId === parentId) return true;
    const parentNode = this.findNode(parentId);
    if (!parentNode || !parentNode.children) return false;

    const search = (node) => {
      if (!node || !node.children) return false;
      for (const child of node.children) {
        if (child.id === targetChildId) return true;
        if (child.children && search(child)) return true;
      }
      return false;
    };
    return search(parentNode);
  }

  /**
   * Moves multiple nodes (bookmarks or folders) to a target folder ID.
   *
   * @param {Array<string>} nodeIds - Node IDs to move
   * @param {string} targetFolderId - Target destination folder ID
   * @returns {boolean} True if any node was moved
   */
  moveNodes(nodeIds, targetFolderId) {
    const targetFolder = this.findNode(targetFolderId);
    if (!targetFolder || targetFolder.type !== 'folder') return false;

    let movedAny = false;
    for (const nodeId of nodeIds) {
      if (nodeId === targetFolderId) continue;
      // Prevent moving a folder into itself or any of its descendants
      if (this.isDescendantOf(targetFolderId, nodeId)) continue;

      const sourceParent = this.findParentNode(nodeId);
      if (!sourceParent) continue;

      const nodeIndex = sourceParent.children.findIndex(c => c.id === nodeId);
      if (nodeIndex === -1) continue;

      const [movedNode] = sourceParent.children.splice(nodeIndex, 1);
      if (!targetFolder.children) targetFolder.children = [];
      targetFolder.children.push(movedNode);
      movedAny = true;
    }

    if (movedAny) {
      this.setTree(this.tree);
    }
    return movedAny;
  }

  /**
   * Moves a single node to target folder ID.
   *
   * @param {string} nodeId - Node ID
   * @param {string} targetFolderId - Target destination folder ID
   * @returns {boolean}
   */
  moveNode(nodeId, targetFolderId) {
    return this.moveNodes([nodeId], targetFolderId);
  }

  /**
   * Deletes a list of node IDs from the tree.
   *
   * @param {Array<string>} nodeIds - Node IDs to delete
   */
  deleteNodes(nodeIds) {
    if (!nodeIds || !nodeIds.length) return;
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
      // Remove deleted IDs from current selection
      idsSet.forEach(id => this.selectedIds.delete(id));
      this.setTree(this.tree);
    }
  }

  /**
   * Adds a new bookmark or folder to target folder.
   *
   * @param {string} targetFolderId - Destination folder ID
   * @param {object} newNode - Bookmark or folder node object
   */
  addNode(targetFolderId, newNode) {
    const folder = this.findNode(targetFolderId) || this.tree;
    if (!folder) return;
    if (!folder.children) folder.children = [];
    folder.children.push(newNode);
    this.setTree(this.tree);
  }

  /**
   * Updates fields of a specific node.
   *
   * @param {string} nodeId - Node ID to update
   * @param {object} updates - Key/value pairs to merge into node
   */
  updateNode(nodeId, updates) {
    const node = this.findNode(nodeId);
    if (!node) return;
    Object.assign(node, updates);
    this.setTree(this.tree);
  }
}

export const state = new AppState();
