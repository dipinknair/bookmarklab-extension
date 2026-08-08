/**
 * URL Utilities for BookmarkLab Bookmark Organizer
 */

/**
 * Extracts a clean domain name from a URL string (e.g. "github.com")
 */
export function getDomainName(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    let hostname = parsed.hostname.replace(/^www\./, '');
    return hostname;
  } catch (e) {
    return url;
  }
}

/**
 * Extracts high level category / brand name from domain (e.g. "github.com" -> "GitHub")
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
 * Gets favicon URL for a given domain
 */
export function getFaviconUrl(url) {
  const domain = getDomainName(url);
  if (!domain) return '';
  // Use Google's reliable public favicon service
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

/**
 * Strips tracking parameters (utm_*, fbclid, gclid, ref, etc.) from a URL
 */
export function cleanTrackingParameters(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'fbclid', 'gclid', 'ref', 'ref_src', 'ref_url', '_ga', 'mc_cid', 'mc_eid',
      'igshid', 'twclid', 'si'
    ];
    
    let hasChanges = false;
    trackingParams.forEach(param => {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.delete(param);
        hasChanges = true;
      }
    });

    return {
      cleanedUrl: parsed.toString(),
      hasChanges
    };
  } catch (e) {
    return { cleanedUrl: url, hasChanges: false };
  }
}

/**
 * Normalizes URL for deduplication comparison (strips trailing slashes, protocol, http vs https)
 */
export function normalizeUrlForDedupe(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    let host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let pathname = parsed.pathname.replace(/\/$/, ''); // Remove trailing slash
    let search = parsed.search; // Query parameters
    return `${host}${pathname}${search}`.toLowerCase();
  } catch (e) {
    return url.trim().toLowerCase().replace(/\/$/, '');
  }
}

/**
 * Evaluates whether a bookmark belongs to a specific topic category based on domain/keywords
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
