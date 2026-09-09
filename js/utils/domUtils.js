/**
 * DOM and Sanitization Utilities for BookmarkLab Extension
 * Follows Single Responsibility Principle (SRP) and DRY principles.
 */

/**
 * Escapes special HTML characters to prevent XSS vulnerabilities
 * when rendering dynamic strings into HTML templates.
 *
 * @param {string|null|undefined} str - Raw string to escape
 * @returns {string} Sanitized string safe for HTML insertion
 */
export function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Triggers a browser download of generated text content (HTML, Markdown, JSON)
 * and safely revokes the temporary Object URL after trigger.
 *
 * @param {string} content - Text content to download
 * @param {string} filename - Target filename for download
 * @param {string} [mimeType='text/html'] - MIME type of the file
 */
export function downloadFile(content, filename, mimeType = 'text/html') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
