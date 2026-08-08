/**
 * Chrome JSON Bookmarks Parser
 */

export function parseBookmarkJSON(jsonString) {
  let data;
  try {
    data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
  } catch (e) {
    throw new Error('Invalid JSON format');
  }

  let idCounter = 1;

  function convertNode(node) {
    if (node.type === 'folder' || node.children) {
      return {
        id: node.id || `folder-${idCounter++}`,
        title: node.name || node.title || 'Untitled Folder',
        type: 'folder',
        dateAdded: node.date_added ? parseInt(node.date_added, 10) / 1000 : Date.now(),
        children: Array.isArray(node.children) ? node.children.map(convertNode) : []
      };
    } else {
      return {
        id: node.id || `bm-${idCounter++}`,
        title: node.name || node.title || node.url || 'Untitled Bookmark',
        url: node.url || '',
        type: 'bookmark',
        dateAdded: node.date_added ? parseInt(node.date_added, 10) / 1000 : Date.now(),
        icon: node.icon || '',
        tags: node.tags || []
      };
    }
  }

  if (data.roots) {
    // Standard Chrome JSON structure
    const rootChildren = [];
    if (data.roots.bookmark_bar && data.roots.bookmark_bar.children) {
      rootChildren.push(...data.roots.bookmark_bar.children.map(convertNode));
    }
    if (data.roots.other && data.roots.other.children && data.roots.other.children.length > 0) {
      rootChildren.push(convertNode(data.roots.other));
    }
    if (data.roots.synced && data.roots.synced.children && data.roots.synced.children.length > 0) {
      rootChildren.push(convertNode(data.roots.synced));
    }

    return {
      id: 'root',
      title: 'Bookmarks Bar',
      type: 'folder',
      children: rootChildren
    };
  }

  if (data.children || data.type === 'folder') {
    return convertNode(data);
  }

  throw new Error('Unrecognized JSON bookmark format');
}
