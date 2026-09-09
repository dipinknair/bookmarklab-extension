# Changelog

All notable changes to BookmarkLab will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project uses [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- Deep-link hash routing for all popup quick actions (`#dedupe`, `#cluster`, `#clean`) with initial load dispatching and live `hashchange` event listeners.
- Standalone / offline demo dataset loader button on the dashboard fallback screen for local development and GitHub Pages preview without live Chrome bookmarks.
- Comprehensive technical documentation in `ARCHITECTURE.md` covering system data flow, stage-and-commit diff engine, and design principles (DRY, YAGNI, SoC, SOLID).
- Automated verification test suite (`test/verify_suite.py`) testing URL normalization, tracking query removal, duplicate detection, Netscape HTML formatting, and JS syntax.
- Centralized DOM and download utilities in `js/utils/domUtils.js`.

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
