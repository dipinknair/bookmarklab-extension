/**
 * Theme & Color Mode Manager for BookmarkLab
 * Supports 2 Color Modes: 'dark' (default) and 'light' (white)
 * Supports 5 Accent Colors: 'purple' (default), 'emerald', 'cyan', 'gold', 'rose'
 * Follows SoC and DRY principles.
 */

const THEME_STORAGE_KEY = 'bookmarklab_theme';
const MODE_STORAGE_KEY = 'bookmarklab_mode';

const VALID_THEMES = ['purple', 'emerald', 'cyan', 'gold', 'rose'];
const VALID_MODES = ['dark', 'light'];

/**
 * Initializes saved accent theme and dark/light color mode from storage.
 *
 * @returns {Promise<{ theme: string, mode: string }>}
 */
export async function initTheme() {
  let savedTheme = 'purple';
  let savedMode = 'dark';

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get([THEME_STORAGE_KEY, MODE_STORAGE_KEY]);
      if (data) {
        if (data[THEME_STORAGE_KEY]) savedTheme = data[THEME_STORAGE_KEY];
        if (data[MODE_STORAGE_KEY]) savedMode = data[MODE_STORAGE_KEY];
      }
    } else if (typeof localStorage !== 'undefined') {
      savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'purple';
      savedMode = localStorage.getItem(MODE_STORAGE_KEY) || 'dark';
    }
  } catch (e) {
    savedTheme = 'purple';
    savedMode = 'dark';
  }

  applyTheme(savedTheme);
  applyMode(savedMode);
  return { theme: savedTheme, mode: savedMode };
}

/**
 * Applies an accent color theme across the application.
 *
 * @param {string} themeName - 'purple' | 'emerald' | 'cyan' | 'gold' | 'rose'
 */
export function applyTheme(themeName) {
  const theme = VALID_THEMES.includes(themeName) ? themeName : 'purple';
  document.documentElement.setAttribute('data-theme', theme);

  // Update UI accent dots
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
      chrome.storage.local.set({ [THEME_STORAGE_KEY]: theme });
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch (e) {
    // Storage silent fail
  }
}

/**
 * Applies dark or light (white) mode across the application.
 *
 * @param {string} modeName - 'dark' | 'light'
 */
export function applyMode(modeName) {
  const mode = VALID_MODES.includes(modeName) ? modeName : 'dark';
  document.documentElement.setAttribute('data-mode', mode);

  if (document.body) {
    document.body.classList.remove('dark-theme', 'light-theme');
    document.body.classList.add(`${mode}-theme`);
  }

  // Update mode toggle buttons
  document.querySelectorAll('.theme-mode-btn').forEach(btn => {
    btn.dataset.currentMode = mode;
    btn.title = mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    btn.setAttribute('aria-label', mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode');
  });

  // Save preference
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [MODE_STORAGE_KEY]: mode });
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    }
  } catch (e) {
    // Storage silent fail
  }
}

/**
 * Toggles between dark and light color modes.
 *
 * @returns {string} New active mode ('dark' | 'light')
 */
export function toggleMode() {
  const currentMode = document.documentElement.getAttribute('data-mode') || 'dark';
  const newMode = currentMode === 'dark' ? 'light' : 'dark';
  applyMode(newMode);
  return newMode;
}

/**
 * Sets up click event listeners for both accent color dots and the dark/light toggle button.
 */
export function setupThemeSelector() {
  document.querySelectorAll('.theme-dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const theme = dot.dataset.theme;
      if (theme) applyTheme(theme);
    });
  });

  document.querySelectorAll('.theme-mode-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMode();
    });
  });
}
