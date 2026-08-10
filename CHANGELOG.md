# Changelog

All notable changes to BookmarkLab will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and this project uses [Semantic Versioning](https://semver.org/).

---

## [1.0.1] — 2026-08-10

### Added
- Theme Accent Color selector — choose between Glassy Purple (Default), Glassy Emerald, Cyber Cyan, Muted Gold, and Neon Rose.
- Persistent theme preferences saved across sessions using `chrome.storage.local`.
- Clean Tracking Diff Preview Modal — displays a side-by-side URL comparison (Original vs Cleaned) with stripped parameters highlighted in red before applying edits.
- Deep-link hash navigation (`#clean`) from popup quick actions directly into the Clean Tracking Diff Modal.

### Changed
- Standardized UI accent colors to Glassy Purple across the dashboard, popup, buttons, and card hover effects.
- Renamed "Sync to Chrome" toolbar label to "Sync Bookmarks" for clear cross-browser compatibility.
- Removed unused `activeTab` permission from `manifest.json`.

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
- GitHub Actions workflow for automated releases on version tags.
- Support for Chrome, Edge, Brave, and other Chromium-based browsers.
