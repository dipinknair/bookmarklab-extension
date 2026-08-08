/**
 * Theme Manager for BookmarkLab
 * Supports 5 themes: 'purple' (default), 'emerald', 'cyan', 'gold', 'rose'
 */

const STORAGE_KEY = 'bookmarklab_theme';
const VALID_THEMES = ['purple', 'emerald', 'cyan', 'gold', 'rose'];

export async function initTheme() {
  let savedTheme = 'purple';
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      if (data && data[STORAGE_KEY]) savedTheme = data[STORAGE_KEY];
    } else if (typeof localStorage !== 'undefined') {
      savedTheme = localStorage.getItem(STORAGE_KEY) || 'purple';
    }
  } catch (e) {
    savedTheme = 'purple';
  }

  applyTheme(savedTheme);
  return savedTheme;
}

export function applyTheme(themeName) {
  const theme = VALID_THEMES.includes(themeName) ? themeName : 'purple';
  document.documentElement.setAttribute('data-theme', theme);

  // Update UI dots if present
  document.querySelectorAll('.theme-dot').forEach(dot => {
    if (dot.dataset.theme === theme) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });

  // Save preference
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: theme });
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  } catch (e) {
    // Storage silent fail
  }
}

export function setupThemeSelector() {
  document.querySelectorAll('.theme-dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const theme = dot.dataset.theme;
      if (theme) applyTheme(theme);
    });
  });
}
