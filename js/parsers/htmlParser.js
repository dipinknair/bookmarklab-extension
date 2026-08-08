/**
 * Netscape Bookmark HTML Parser
 * Parses standard Netscape Bookmark HTML files exported by Chrome, Firefox, Safari, Edge, Brave, etc.
 */

export function parseBookmarkHTML(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // Find the primary root DL element or document body
  const rootDL = doc.querySelector('dl') || doc.body;

  let idCounter = 1;

  function processDL(dlElement, parentTitle = 'Bookmarks Bar') {
    const children = [];
    if (!dlElement) return children;

    // Filter direct children or target elements inside DL
    const rawElements = Array.from(dlElement.children);
    const dtElements = rawElements.filter(el => el.tagName.toLowerCase() === 'dt');
    const targets = dtElements.length > 0 ? dtElements : rawElements;

    for (const el of targets) {
      const tag = el.tagName.toLowerCase();
      
      const h3 = tag === 'h3' ? el : (el.querySelector(':scope > h3') || el.querySelector('h3'));
      const a = tag === 'a' ? el : (el.querySelector(':scope > a') || el.querySelector('a'));

      if (h3) {
        // It's a Folder
        const folderTitle = h3.textContent.trim() || 'Untitled Folder';
        const dateAdded = h3.getAttribute('add_date') ? parseInt(h3.getAttribute('add_date'), 10) * 1000 : Date.now();
        const dateModified = h3.getAttribute('last_modified') ? parseInt(h3.getAttribute('last_modified'), 10) * 1000 : Date.now();
        const isPersonalToolbar = (h3.getAttribute('personal_toolbar_folder') || h3.getAttribute('PERSONAL_TOOLBAR_FOLDER') || '').toLowerCase() === 'true';
        
        // Find child DL element for this folder
        const childDL = el.querySelector(':scope > dl') || el.querySelector('dl') || (el.nextElementSibling && el.nextElementSibling.tagName.toLowerCase() === 'dl' ? el.nextElementSibling : null);

        const folderNode = {
          id: `folder-${idCounter++}`,
          title: folderTitle,
          type: 'folder',
          dateAdded,
          dateModified,
          isPersonalToolbar,
          children: childDL ? processDL(childDL, folderTitle) : []
        };

        children.push(folderNode);
      } else if (a) {
        // It's a Bookmark
        const title = a.textContent ? a.textContent.trim() : '';
        const url = a.getAttribute('href') || '';
        const dateAdded = a.getAttribute('add_date') ? parseInt(a.getAttribute('add_date'), 10) * 1000 : Date.now();
        const icon = a.getAttribute('icon') || '';

        if (url) {
          children.push({
            id: `bm-${idCounter++}`,
            title: title,
            url: url,
            type: 'bookmark',
            dateAdded,
            icon,
            tags: []
          });
        }
      }
    }

    return children;
  }

  let rootChildren = processDL(rootDL);

  // Fallback: If primary DL tree parsing yielded no links at all, do a direct extraction of all <a> elements
  if (rootChildren.length === 0) {
    const allLinks = Array.from(doc.querySelectorAll('a[href]'));
    rootChildren = allLinks.map((a, idx) => ({
      id: `bm-${idx + 1}`,
      title: a.textContent ? a.textContent.trim() : '',
      url: a.getAttribute('href') || '',
      type: 'bookmark',
      dateAdded: a.getAttribute('add_date') ? parseInt(a.getAttribute('add_date'), 10) * 1000 : Date.now(),
      icon: a.getAttribute('icon') || '',
      tags: []
    })).filter(bm => bm.url);
  }

  // If Chrome/Safari/Firefox/Edge exported a "Bookmarks Bar" wrapper folder,
  // promote its contents directly to root so individual bookmarks and subfolders appear in exact order
  const barFolderIndex = rootChildren.findIndex(child => 
    child.type === 'folder' && 
    (child.isPersonalToolbar || /^(bookmarks\s*bar|bookmarks\s*menu|bookmarks|personal\s*toolbar|favorites\s*bar|favorites)$/i.test((child.title || '').trim()))
  );

  if (barFolderIndex !== -1) {
    const barFolder = rootChildren[barFolderIndex];
    rootChildren.splice(barFolderIndex, 1, ...(barFolder.children || []));
  }

  return {
    id: 'root',
    title: 'Bookmarks Bar',
    type: 'folder',
    children: rootChildren
  };
}
