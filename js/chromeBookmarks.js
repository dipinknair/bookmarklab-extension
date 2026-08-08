/**
 * BookmarkLab Extension — chrome.bookmarks API Bridge
 *
 * This module bridges the native chrome.bookmarks API to BookmarkLab's
 * internal tree model. It converts chrome.bookmarks.BookmarkTreeNode
 * objects to/from BookmarkLab's node schema and applies live operations
 * (move, update, delete, create) directly to the browser's bookmarks.
 */

/**
 * Converts a chrome.bookmarks.BookmarkTreeNode into a BookmarkLab node
 * (recursive — handles both folders and bookmark leaves)
 */
export function chromeNodeToLabNode(chromeNode) {
  if (!chromeNode) return null;

  const isFolder = !chromeNode.url; // folders have no url field

  if (isFolder) {
    return {
      id: chromeNode.id,
      title: chromeNode.title || 'Untitled Folder',
      type: 'folder',
      dateAdded: chromeNode.dateAdded || Date.now(),
      dateModified: chromeNode.dateGroupModified || Date.now(),
      parentId: chromeNode.parentId,
      index: chromeNode.index,
      children: Array.isArray(chromeNode.children)
        ? chromeNode.children.map(chromeNodeToLabNode).filter(Boolean)
        : []
    };
  } else {
    return {
      id: chromeNode.id,
      title: chromeNode.title || '',
      url: chromeNode.url,
      type: 'bookmark',
      dateAdded: chromeNode.dateAdded || Date.now(),
      parentId: chromeNode.parentId,
      index: chromeNode.index,
      tags: []
    };
  }
}

/**
 * Loads the complete chrome bookmarks tree and converts it to BookmarkLab format.
 * Returns a promise resolving to the root BookmarkLab tree node.
 */
export function loadChromeBookmarks() {
  return new Promise((resolve, reject) => {
    if (!chrome?.bookmarks?.getTree) {
      reject(new Error('chrome.bookmarks API not available'));
      return;
    }

    chrome.bookmarks.getTree((tree) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      // Chrome's bookmark tree has two root containers:
      //   tree[0] = root node (id: "0") containing:
      //     "1" = Bookmarks Bar
      //     "2" = Other Bookmarks
      //     "3" = Mobile Bookmarks (if synced)
      const chromeRoot = tree[0];
      if (!chromeRoot || !chromeRoot.children) {
        reject(new Error('No bookmark data received from chrome.bookmarks'));
        return;
      }

      // Flatten: merge Bookmarks Bar, Other Bookmarks, and Mobile Bookmarks
      // under a single virtual "Bookmarks Bar" root to match BookmarkLab's tree model.
      const bookmarksBarNode = chromeRoot.children.find(c => c.id === '1');
      const otherNode = chromeRoot.children.find(c => c.id === '2');
      const mobileNode = chromeRoot.children.find(c => c.id === '3');

      const rootChildren = [];

      // Add Bookmarks Bar children directly at root level
      if (bookmarksBarNode && Array.isArray(bookmarksBarNode.children)) {
        bookmarksBarNode.children.forEach(c => {
          const node = chromeNodeToLabNode(c);
          if (node) rootChildren.push(node);
        });
      }

      // Add "Other Bookmarks" as a folder if it has contents
      if (otherNode && Array.isArray(otherNode.children) && otherNode.children.length > 0) {
        const otherLabNode = chromeNodeToLabNode(otherNode);
        if (otherLabNode) rootChildren.push(otherLabNode);
      }

      // Add "Mobile Bookmarks" as a folder if it has contents
      if (mobileNode && Array.isArray(mobileNode.children) && mobileNode.children.length > 0) {
        const mobileLabNode = chromeNodeToLabNode(mobileNode);
        if (mobileLabNode) rootChildren.push(mobileLabNode);
      }

      resolve({
        id: 'root',
        title: 'Bookmarks Bar',
        type: 'folder',
        dateAdded: Date.now(),
        children: rootChildren,
        // Store the real chrome Bookmarks Bar ID for live-write operations
        _chromeBarId: bookmarksBarNode ? bookmarksBarNode.id : '1'
      });
    });
  });
}

/**
 * Moves a bookmark or folder to a different parent folder in Chrome's live bookmarks.
 * 
 * @param {string} chromeId - The chrome bookmark/folder node ID
 * @param {string} targetChromeParentId - The target chrome parent folder ID
 * @returns {Promise}
 */
export function chromeMoveNode(chromeId, targetChromeParentId) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.move(chromeId, { parentId: targetChromeParentId }, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Updates a bookmark's title and/or URL in Chrome's live bookmarks.
 * 
 * @param {string} chromeId - The chrome bookmark node ID
 * @param {object} changes - Object with optional `title` and `url` fields
 * @returns {Promise}
 */
export function chromeUpdateNode(chromeId, changes) {
  return new Promise((resolve, reject) => {
    const update = {};
    if (changes.title !== undefined) update.title = changes.title;
    if (changes.url !== undefined) update.url = changes.url;

    chrome.bookmarks.update(chromeId, update, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Deletes a bookmark from Chrome's live bookmarks.
 *
 * @param {string} chromeId - The chrome bookmark node ID
 * @returns {Promise}
 */
export function chromeRemoveNode(chromeId) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.remove(chromeId, () => {
      if (chrome.runtime.lastError) {
        // Try removeTree for folders
        chrome.bookmarks.removeTree(chromeId, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  });
}

/**
 * Creates a new bookmark in Chrome's live bookmarks.
 *
 * @param {string} parentChromeId - The chrome parent folder ID
 * @param {object} node - BookmarkLab node object (must have title and url)
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
export function chromeCreateBookmark(parentChromeId, node) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.create({
      parentId: parentChromeId,
      title: node.title || '',
      url: node.url
    }, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Creates a new folder in Chrome's live bookmarks.
 *
 * @param {string} parentChromeId - The chrome parent folder ID
 * @param {string} title - Folder title
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
export function chromeCreateFolder(parentChromeId, title) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.create({
      parentId: parentChromeId,
      title: title
    }, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Checks if the chrome.bookmarks API is available in this context.
 * Returns true if we're in an extension context with bookmarks permission.
 */
export function isChromeExtensionContext() {
  return typeof chrome !== 'undefined' && !!chrome.bookmarks;
}
