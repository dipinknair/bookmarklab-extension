# Changelog

All notable changes to BookmarkLab will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project uses [Semantic Versioning](https://semver.org/).

---

## [1.1.0] — 2026-09-09

### Added
- **Cross-Browser Bookmark Import (#1)**:
  - Added support for importing bookmarks exported from **Safari, Firefox, Microsoft Edge, Arc Browser, Brave, Opera, and Google Chrome**.
  - Supports both standard Netscape HTML (`.html`, `.htm`) and Chromium JSON (`.json`) formats.
  - Three distinct destination strategies:
    - **Dedicated Folder (Default)**: Stages imported hierarchy inside an isolated `Imported - [Date]` folder to protect existing bookmark structure.
    - **Merge into Existing Folders**: Reconciles top-level folder names and appends bookmarks to matching folders.
    - **Replace Active Workspace**: Clears the workspace and imports bookmarks for a clean slate.
  - Direct file drag-and-drop support onto the workspace with drop-zone overlay.
  - Optional pre-import sanitization: automatic tracking parameter stripping (`cleanTrackingParameters`) and duplicate resolution.
- **Hierarchical Creation Resolution (`idMap`)**:
  - Implemented client-to-Chrome synthetic ID mapping in `applySyncToChrome`, guaranteeing nested imported folders and child bookmarks sync cleanly to Chrome without parent ID lookup errors.
- **Dark & White (Light) Theme Toggle**:
  - Instant toggle button with Sun and Moon icons across dashboard and popup.
  - High-contrast, crisp white light mode with neutral slate borders and surface layers.
- **Calm Pastel Accent Palette**:
  - Replaced high-saturation accents with 5 curated, aesthetic pastel tones: **Pastel Lavender** (`#7d85d8`), **Pastel Sage** (`#5fa88d`), **Pastel Mist Blue** (`#6897bb`), **Pastel Sand** (`#d49f69`), and **Pastel Dusty Rose** (`#c4798e`).
- **Comprehensive Automated Test Suite**:
  - Expanded `test/verify_suite.py` to **130 automated verification tests** covering Manifest V3, URL cleaning, Netscape HTML/JSON parsing, JS structural integrity, state machine undo/redo invariants, theme tokens, the import engine, and Buy Me a Coffee header badges.
- **Buy Me a Coffee & Creator Sponsorship Integration**:
  - Added Buy Me a Coffee donation badge (`#btn-coffee`) directly next to the main left top banner in the dashboard header, followed by the GitHub creator badge (`#btn-github`).
  - Added repository funding metadata in `.github/FUNDING.yml`.
  - Added Buy Me a Coffee badges and support sections across `README.md` and `docs/index.html`.
- Deep-link hash routing for all popup quick actions (`#dedupe`, `#cluster`, `#clean`) with initial load dispatching and live `hashchange` event listeners.
- Standalone / offline demo dataset loader button on the dashboard fallback screen for local development and GitHub Pages preview without live Chrome bookmarks.
- Centralized DOM and download utilities in `js/utils/domUtils.js`.

### Changed
- **Minimalist Design System Refinement**:
  - Removed flashy ambient glow blobs (`body::before`, `body::after`), distracting neon box-shadows (`--shadow-glow`), and bouncy hover scale transforms.
  - Refined layout with compact 52px header, crisp 1px neutral borders (`rgba(255,255,255,0.07)` / `rgba(0,0,0,0.08)`), calm obsidian/slate surfaces, and solid flat pastel buttons.
  - Updated branding header to "BookmarkLab — Interactive Bookmark Manager" and added repository link.

### Fixed
- Fixed undo/redo history engine in `js/state.js`: corrected stack pointer mathematics when mutations exceed `maxHistory`, and fixed snapshot restoration so `undo()` and `redo()` are deterministic.
- Added input safety guards to global `Cmd+Z` / `Ctrl+Z` keyboard handlers to avoid intercepting native undo/redo while typing in text inputs or textareas.
- Fixed blank titles in Deduplication and Clean Tracking modals for icon-only bookmarks, falling back to clean domain names.
- Fixed syntax error on line 1 of `test/demo-bookmarks.html`.
- Fixed potential timer handle leak in link health verification by adding `clearTimeout`.

### Refactored
- **DRY (Don't Repeat Yourself)**: Centralized HTML entity escaping (`escapeHTML`) across all components, replacing 4 duplicate implementations.
- **DRY**: Centralized duplicate bookmark detection (`findDuplicateGroups`) in `urlUtils.js`, synchronizing counts across the popup stats, dashboard smart views, and modal dialogs.
- **SoC (Separation of Concerns)**: Encapsulated tree mutations in `runAutoCluster` through state methods rather than direct mutation of `state.tree.children`.
- **DRY**: Refactored `popup.js` to reuse `cleanTrackingParameters` and `findDuplicateGroups` from `urlUtils.js`.

---

## [1.0.0] — 2026-08-08

### Added
- Initial release of BookmarkLab Chrome extension.
- Load and display all Chrome bookmarks in a visual workspace (folder tree + grid/list view).
- Stage-and-commit sync model — all edits are made in memory and only applied to Chrome after the user reviews and confirms a diff summary.
- One-click backup — downloads a full HTML copy of live Chrome bookmarks before any changes are made.
- Duplicate finder — detects bookmarks sharing the same URL and allows keeping one or removing all copies.
- Auto-cluster — automatically organizes bookmarks into folders by domain name or smart topic category.
- Clean Tracking — strips utm_*, fbclid, gclid, and other marketing parameters from bookmark URLs.
- Link health check — verifies whether bookmarked URLs are still reachable.
- Full-text search across titles, URLs, and domains.
- Smart views: All Bookmarks, Duplicates, Uncategorized, With Tracking Tags, Unreachable Links.
- Undo and redo support for all edit operations.
- Drag-and-drop folder tree with sidebar resize.
- Inspector panel for editing bookmark title, URL, and parent folder.
- Support for Chrome, Edge, Brave, and other Chromium-based browsers.
