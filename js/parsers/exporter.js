/**
 * Bookmark Exporters
 * Netscape HTML, Markdown, and JSON exporters
 */

/**
 * Generates 100% compliant Netscape Bookmark HTML format
 */
export function exportToNetscapeHTML(treeNode) {
  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;

  function renderChildren(children, indentLevel = 1) {
    const indent = '    '.repeat(indentLevel);
    let result = '';

    for (const node of children) {
      if (node.type === 'folder') {
        const addDate = Math.floor((node.dateAdded || Date.now()) / 1000);
        const lastMod = Math.floor((node.dateModified || Date.now()) / 1000);
        const toolbarAttr = (node.isPersonalToolbar || node.personalToolbar) ? ' PERSONAL_TOOLBAR_FOLDER="true"' : '';
        result += `${indent}<DT><H3 ADD_DATE="${addDate}" LAST_MODIFIED="${lastMod}"${toolbarAttr}>${escapeHTML(node.title)}</H3>\n`;
        result += `${indent}<DL><p>\n`;
        if (node.children && node.children.length > 0) {
          result += renderChildren(node.children, indentLevel + 1);
        }
        result += `${indent}</DL><p>\n`;
      } else if (node.type === 'bookmark') {
        const addDate = Math.floor((node.dateAdded || Date.now()) / 1000);
        const iconAttr = node.icon ? ` ICON="${node.icon}"` : '';
        result += `${indent}<DT><A HREF="${escapeHTML(node.url)}" ADD_DATE="${addDate}"${iconAttr}>${escapeHTML(node.title)}</A>\n`;
      }
    }

    return result;
  }

  const children = treeNode.children || [treeNode];

  // Check if any top-level child is already explicitly designated as the personal toolbar folder
  const hasToolbarChild = children.some(c => 
    c.type === 'folder' && 
    (c.isPersonalToolbar || c.personalToolbar || /^(bookmarks\s*bar|bookmarks\s*menu|personal\s*toolbar|favorites\s*bar)$/i.test((c.title || '').trim()))
  );

  if (hasToolbarChild) {
    const processedChildren = children.map(c => {
      if (c.type === 'folder' && /^(bookmarks\s*bar|bookmarks\s*menu|personal\s*toolbar|favorites\s*bar)$/i.test((c.title || '').trim())) {
        return { ...c, isPersonalToolbar: true };
      }
      return c;
    });
    html += renderChildren(processedChildren, 1);
  } else {
    // Root level represents the Favorites/Bookmarks Bar itself.
    // Firefox uses PERSONAL_TOOLBAR_FOLDER="true" on <H3> for Bookmarks Toolbar
    // and UNFILED_BOOKMARKS_FOLDER="true" for Other Bookmarks.
    const addDate = Math.floor((treeNode.dateAdded || Date.now()) / 1000);
    const lastMod = Math.floor((treeNode.dateModified || Date.now()) / 1000);
    const barTitle = treeNode.title || 'Bookmarks Toolbar';

    html += `    <DT><H3 ADD_DATE="${addDate}" LAST_MODIFIED="${lastMod}" PERSONAL_TOOLBAR_FOLDER="true">${escapeHTML(barTitle)}</H3>\n`;
    html += `    <DL><p>\n`;
    html += renderChildren(children, 2);
    html += `    </DL><p>\n`;
  }

  html += `</DL><p>\n`;

  return html;
}

/**
 * Generates Markdown document representation
 */
export function exportToMarkdown(treeNode) {
  let md = `# ${treeNode.title || 'Bookmarks'}\n\n`;

  function renderMarkdownFolder(folder, depth = 2) {
    const headingPrefix = '#'.repeat(Math.min(depth, 6));
    let result = '';

    if (folder.title && folder.id !== 'root') {
      result += `${headingPrefix} ${folder.title}\n\n`;
    }

    if (folder.children) {
      for (const item of folder.children) {
        if (item.type === 'folder') {
          result += renderMarkdownFolder(item, depth + 1);
        } else if (item.type === 'bookmark') {
          result += `- [${item.title}](${item.url})\n`;
        }
      }
      result += '\n';
    }

    return result;
  }

  md += renderMarkdownFolder(treeNode, 2);
  return md;
}

/**
 * Generates formatted JSON export
 */
export function exportToJSON(treeNode) {
  return JSON.stringify(treeNode, null, 2);
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
