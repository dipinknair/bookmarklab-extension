/**
 * URL Utilities for BookmarkLab Bookmark Organizer
 * Centralizes URL normalization, tracking cleanup, domain categorization,
 * duplicate detection, and health checking (DRY & SoC).
 */

/**
 * Standard list of marketing and analytics tracking query parameters to clean.
 */
export const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'fbclid', 'gclid', 'ref', 'ref_src', 'ref_url', '_ga', 'mc_cid', 'mc_eid',
  'igshid', 'twclid', 'si'
];

/**
 * Extracts a clean domain name from a URL string (e.g. "github.com")
 *
 * @param {string} url - Target URL string
 * @returns {string} Hostname without "www." or raw string if parsing fails
 */
export function getDomainName(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch (e) {
    return url;
  }
}

/**
 * Extracts high-level category / brand name from domain (e.g. "github.com" -> "GitHub")
 *
 * @param {string} domain - Domain string
 * @returns {string} Capitalized brand name
 */
export function getBrandName(domain) {
  if (!domain) return 'Other';
  const parts = domain.split('.');
  if (parts.length >= 2) {
    const brand = parts[parts.length - 2];
    return brand.charAt(0).toUpperCase() + brand.slice(1);
  }
  return domain;
}

/**
 * Gets favicon URL for a given domain using Google's public favicon service
 *
 * @param {string} url - Target URL string
 * @returns {string} Favicon URL
 */
export function getFaviconUrl(url) {
  const domain = getDomainName(url);
  if (!domain) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

/**
 * Strips tracking parameters (utm_*, fbclid, gclid, ref, etc.) from a URL
 *
 * @param {string} url - Target URL string
 * @returns {{ cleanedUrl: string, hasChanges: boolean, removedParams: string[] }}
 */
export function cleanTrackingParameters(url) {
  if (!url) return { cleanedUrl: '', hasChanges: false, removedParams: [] };
  try {
    const parsed = new URL(url);
    const removedParams = [];

    TRACKING_PARAMS.forEach(param => {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.delete(param);
        removedParams.push(param);
      }
    });

    const hasChanges = removedParams.length > 0;
    return {
      cleanedUrl: parsed.toString(),
      hasChanges,
      removedParams
    };
  } catch (e) {
    return { cleanedUrl: url, hasChanges: false, removedParams: [] };
  }
}

/**
 * Normalizes URL for deduplication comparison
 * (strips trailing slashes, protocol, www prefix, query sorting)
 *
 * @param {string} url - Target URL string
 * @returns {string} Normalized string key for comparison
 */
export function normalizeUrlForDedupe(url) {
  if (!url) return '';
  try {
    const cleaned = cleanTrackingParameters(url).cleanedUrl;
    const parsed = new URL(cleaned);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsed.pathname.replace(/\/+$/, ''); // Remove trailing slashes
    const search = parsed.search;
    return `${host}${pathname}${search}`.toLowerCase();
  } catch (e) {
    return url.trim().toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * Finds all groups of duplicate bookmarks from a flat list of bookmarks.
 * Single source of truth for duplicate detection across the app (DRY).
 *
 * @param {Array<object>} bookmarks - Array of bookmark node objects
 * @returns {Array<{ key: string, title: string, url: string, items: Array<object> }>}
 */
export function findDuplicateGroups(bookmarks = []) {
  const urlMap = new Map();
  for (const bm of bookmarks) {
    if (!bm || !bm.url) continue;
    const key = normalizeUrlForDedupe(bm.url);
    if (!urlMap.has(key)) {
      urlMap.set(key, []);
    }
    urlMap.get(key).push(bm);
  }

  const duplicates = [];
  for (const [key, items] of urlMap.entries()) {
    if (items.length > 1) {
      duplicates.push({
        key,
        title: items[0].title || items[0].url || 'Untitled Bookmark',
        url: items[0].url,
        items
      });
    }
  }
  return duplicates;
}

/**
 * Validates whether a bookmarked link is reachable via a non-CORS HEAD request.
 * Automatically clears timeout timer to prevent memory and handle leaks.
 *
 * @param {string} url - URL to validate
 * @param {number} [timeoutMs=4500] - Timeout in milliseconds
 * @returns {Promise<boolean>} True if reachable, false otherwise
 */
export async function validateLink(url, timeoutMs = 4500) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
      return true;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return false;
  }
}

/**
 * Evaluates whether a bookmark belongs to a specific topic category based on domain/keywords
 *
 * @param {string} url - Bookmark URL
 * @param {string} [title=''] - Bookmark Title
 * @returns {string} Category name
 */
export function categorizeBookmark(url, title = '') {
  const domain = getDomainName(url).toLowerCase();
  const text = (url + ' ' + title).toLowerCase();

  if (domain.includes('github') || domain.includes('gitlab') || domain.includes('stackoverflow') || domain.includes('npmjs') || domain.includes('developer') || domain.includes('docs.') || text.includes('api') || text.includes('code')) {
    return 'Developer Tools';
  }
  if (domain.includes('youtube') || domain.includes('vimeo') || domain.includes('netflix') || domain.includes('spotify') || domain.includes('twitch') || text.includes('video') || text.includes('music')) {
    return 'Media & Video';
  }
  if (domain.includes('twitter') || domain.includes('x.com') || domain.includes('linkedin') || domain.includes('reddit') || domain.includes('facebook') || domain.includes('instagram')) {
    return 'Social & Community';
  }
  if (domain.includes('medium') || domain.includes('dev.to') || domain.includes('wikipedia') || domain.includes('arxiv') || text.includes('blog') || text.includes('article') || text.includes('guide')) {
    return 'Reading & Research';
  }
  if (domain.includes('amazon') || domain.includes('ebay') || domain.includes('etsy') || domain.includes('shop') || text.includes('store')) {
    return 'Shopping';
  }
  if (domain.includes('finance') || domain.includes('bank') || domain.includes('crypto') || domain.includes('coinbase') || domain.includes('stripe')) {
    return 'Finance & Business';
  }
  if (domain.includes('news') || domain.includes('nytimes') || domain.includes('bbc') || domain.includes('techcrunch') || domain.includes('theverge')) {
    return 'News';
  }

  return 'General';
}
