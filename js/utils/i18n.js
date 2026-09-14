/**
 * Internationalization (i18n) Helper Utility for BookmarkLab
 * Provides safe translation queries and automated DOM tree localization.
 */

/**
 * Retrieve a localized string by message key.
 * Safely falls back to provided fallback string or key if chrome.i18n is not available.
 * 
 * @param {string} key - The message key defined in _locales/.../messages.json
 * @param {string} [fallback=''] - Optional fallback string if key is missing or chrome.i18n is unavailable
 * @returns {string}
 */
export function t(key, fallback = '') {
  try {
    if (typeof chrome !== 'undefined' && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
      const msg = chrome.i18n.getMessage(key);
      if (msg) return msg;
    }
  } catch (err) {
    // Suppress errors in environments where chrome.i18n throws (e.g. cross-origin iframe or standalone preview)
  }
  return fallback || key;
}

/**
 * Automatically scans and localizes elements inside the given root element (defaults to document).
 * Supports:
 * - data-i18n: sets element textContent
 * - data-i18n-title: sets element title attribute
 * - data-i18n-placeholder: sets element placeholder attribute
 * - data-i18n-aria-label: sets element aria-label attribute
 * 
 * @param {Document|HTMLElement} [root=document]
 */
export function localizeDOM(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return;

  // 1. Text Content
  const textElements = root.querySelectorAll('[data-i18n]');
  textElements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const translated = t(key, el.textContent);
    if (translated) {
      el.textContent = translated;
    }
  });

  // 2. Title attribute (tooltips)
  const titleElements = root.querySelectorAll('[data-i18n-title]');
  titleElements.forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (!key) return;
    const translated = t(key, el.title);
    if (translated) {
      el.title = translated;
    }
  });

  // 3. Placeholder attribute
  const placeholderElements = root.querySelectorAll('[data-i18n-placeholder]');
  placeholderElements.forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key) return;
    const translated = t(key, el.placeholder);
    if (translated) {
      el.placeholder = translated;
    }
  });

  // 4. Aria Label attribute
  const ariaElements = root.querySelectorAll('[data-i18n-aria-label]');
  ariaElements.forEach(el => {
    const key = el.getAttribute('data-i18n-aria-label');
    if (!key) return;
    const current = el.getAttribute('aria-label') || '';
    const translated = t(key, current);
    if (translated) {
      el.setAttribute('aria-label', translated);
    }
  });
}
