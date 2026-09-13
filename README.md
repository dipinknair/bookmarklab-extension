# BookmarkLab

[![CI](https://github.com/dipinknair/bookmarklab-extension/actions/workflows/ci.yml/badge.svg)](https://github.com/dipinknair/bookmarklab-extension/actions/workflows/ci.yml)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-BookmarkLab-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/bookmarklab/lppfdghjnnndidlpfddfngijmfbfkflm)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-7d85d8?style=flat-square&logo=googlechrome&logoColor=white)
[![GitHub Release](https://img.shields.io/github/v/release/dipinknair/bookmarklab-extension?style=flat-square&color=d49f69&label=version)](https://github.com/dipinknair/bookmarklab-extension/releases)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Donate-FFDD00?style=flat-square&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/dipinknair619)
[![License: MIT](https://img.shields.io/badge/License-MIT-5fa88d?style=flat-square)](LICENSE)

BookmarkLab is a fast, privacy-respecting browser extension designed to help you organize, deduplicate, and clean your browser bookmarks in a visual workspace.

Instead of making live edits immediately to your browser database, BookmarkLab loads your bookmarks into an in-memory workspace where you can freely organize, auto-cluster, deduplicate, and clean them. Once you are satisfied with the changes, you can review an exact diff summary and sync them back to Chrome with one click.

---

## Key Features

- **Cross-Browser Bookmark Import**: Import standard bookmark backup files (`.html`, `.json`) exported from other browsers. Choose between creating an isolated **Dedicated Folder** (keeping your existing tree 100% clean), **Merging** into matching folders, or **Replacing** the workspace. Supports drag-and-drop file imports directly onto the window.
- **Safe Stage-and-Commit Model**: Preview all proposed deletions, moves, renames, and creations before committing them to your browser.
- **Clean Minimalist Design**: Modern, high-craft interface inspired by tools like Linear and Raycast, featuring calm neutral surfaces, crisp 1px borders, and solid pastel buttons with zero distracting neon glows.
- **Drag-and-Drop Organization**: Reorganize bookmarks and folders effortlessly across the tree view and main workbench.
- **One-Click Backup**: Export a 100% compliant Netscape HTML backup of your live Chrome bookmarks before making changes.
- **Duplicate Detection & Auto-Resolution**: Find duplicate bookmarks sharing normalized URLs and remove excess copies while keeping the oldest or chosen bookmark.
- **Auto-Clustering Engine**: Automatically group bookmarks into structured folders by domain name (e.g. GitHub, YouTube) or smart topic categories (Developer Tools, Media, Reading & Research, Shopping, Finance, News).
- **Clean Tracking Parameters**: Detect and strip marketing query parameters (`utm_*`, `fbclid`, `gclid`, `ref`, `_ga`, etc.) with a side-by-side diff preview.
- **Link Health Check**: Verify bookmark availability via non-CORS background probes to identify broken or unreachable links.
- **Full-Text Instant Search**: Search across titles, URLs, tags, and domain names in real time.
- **Batch Operations**: Multi-select bookmarks to move, tag, or delete in bulk.
- **Dark & Light (White) Mode**: Toggle effortlessly between sleek dark mode and crisp light/white mode with full contrast adaptation.
- **Muted Pastel Theme Accents**: Choose between 5 calming, aesthetic pastel tones (Pastel Lavender, Pastel Sage, Pastel Mist Blue, Pastel Sand, and Pastel Dusty Rose), persisted via `chrome.storage.local`.
- **Offline / Standalone Preview**: Load built-in demo bookmarks when opened directly in a browser or test environment outside the extension runtime.

---

## Bookmark Import Guide

BookmarkLab makes migrating bookmarks effortless and safe using industry-standard formats:

| Format / Source Type | Standard Export Method | Supported in BookmarkLab |
|---|---|:---:|
| **Standard Netscape Bookmark HTML (`.html`, `.htm`)** | File / Library → Export Bookmarks to HTML | ✅ Full Support |
| **JSON Bookmark Backup (`.json`)** | Bookmark Manager → Export Bookmarks JSON | ✅ Full Support |
| **Chromium-based Browsers** | Bookmark Manager (`Cmd+Option+B` / `Ctrl+Shift+O`) → Export Bookmarks | ✅ Full Support |
| **Other Desktop Browsers** | Bookmarks / Favorites Menu → Export Bookmarks | ✅ Full Support |

### How Import Works:
1. **Choose File**: Click **Import** in the header or drag-and-drop any `.html`, `.htm`, or `.json` file directly onto the dashboard window.
2. **Select Destination Strategy**:
   - **Dedicated Folder (Default)**: Nests imported bookmarks in a new folder named `Imported - [Date]` under Other Bookmarks. Your existing folder structure is completely untouched.
   - **Merge into Existing Folders**: Matches top-level folders (e.g., Bookmarks Bar) and appends imported bookmarks without duplicating existing structure.
   - **Replace Active Workspace**: Clears the in-memory tree and loads the imported bookmarks for a clean slate.
3. **Optional Pre-Cleaning**: Check **Clean tracking parameters** to automatically strip marketing parameters (`utm_*`, `fbclid`, etc.) and **Deduplicate bookmarks** to keep only unique URLs.
4. **Stage and Review**: All imported bookmarks are loaded into memory first. Review your tree, make manual adjustments, and click **Sync Bookmarks** only when ready.

---

## Keyboard Shortcuts

| Shortcut | Action | Scope |
|---|---|---|
| `Cmd + Z` / `Ctrl + Z` | Undo last edit | Workspace (guarded against active input typing) |
| `Cmd + Shift + Z` / `Ctrl + Shift + Z` | Redo last undone edit | Workspace (guarded against active input typing) |
| `Double Click` on Card | Open bookmark URL in new tab / open folder | Workbench cards |
| `Cmd + Click` / `Ctrl + Click` | Multi-select bookmarks or folders | Tree & Grid views |

---

## Architecture & Code Quality Principles

BookmarkLab is engineered following strict software design principles:

- **DRY (Don't Repeat Yourself)**: Shared HTML sanitization (`js/utils/domUtils.js`), duplicate detection, URL normalization, and tracking parameter stripping (`js/utils/urlUtils.js`).
- **YAGNI (You Aren't Gonna Need It)**: Pure standard ES modules and CSS with zero external npm dependencies or bundlers.
- **SoC (Separation of Concerns)**: Clear boundaries between UI rendering (`js/components/`), central state and undo/redo history (`js/state.js`), Chrome API bridge (`js/chromeBookmarks.js`), and export/import format parsers (`js/parsers/`).
- **SOLID Principles**: Single responsibility modules, open/closed hash action router, and dependency-injected UI callbacks.

For in-depth technical details on the state machine, diff engine, and data flow, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Installation

### Option 1: Chrome Web Store (Recommended)

Get [BookmarkLab on the Chrome Web Store](https://chromewebstore.google.com/detail/bookmarklab/lppfdghjnnndidlpfddfngijmfbfkflm). Compatible with Google Chrome and other Chromium-based browsers.

### Option 2: From Source (Developer Mode)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/dipinknair/bookmarklab-extension.git
   ```
2. Open your browser and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the repository directory.
5. Click the BookmarkLab icon in your browser toolbar to open the popup or launch the full dashboard.

---

## Development, Testing & CI/CD

Because BookmarkLab uses standard ES modules and vanilla CSS, no bundlers or compilation steps are required.

### Automated Test Suite
Run the test suite locally with:
```bash
python3 test/verify_suite.py
```

The test suite validates:
- **Manifest V3 Specification**: Required fields, version format, minimal permissions (`bookmarks`, `storage`), and module service worker.
- **URL Engine & Normalization**: Strips tracking query parameters (`utm_*`, `fbclid`, `gclid`, `ref`, etc.) while preserving valid parameters and computes consistent deduplication keys.
- **HTML Export & Import Balance**: Netscape bookmark file compliance with balanced `<DL>` and `<H3>` tags.
- **JavaScript Structural Integrity**: Validates balanced brackets, braces, parentheses, and syntax across all 16 modules.
- **Undo / Redo Engine Invariants**: History stack branching, sliding-window depth clamping (40 states), and state restoration.
- **Theme Modes & Pastel Palettes**: Dark and Light mode tokens and 5 muted pastel accent themes.
- **Bookmark Import Engine (Issue #1)**: Cross-browser HTML/JSON parsing, destination routing (dedicated folder, merge, replace), and parent-child Chrome creation ID resolution.

### Continuous Integration (CI/CD)
GitHub Actions workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) executes on every `push` and `pull_request` to `main`:
- Matrix validation across **Python 3.10, 3.11, and 3.12**.
- Validates JSON schemas and executes the 130 automated verification tests.
- Semantic release workflow ([`.github/workflows/release.yml`](.github/workflows/release.yml)) verifies the test suite before packaging and publishing tagged releases (`v*`).

---

## Privacy & Permissions

BookmarkLab runs 100% locally within your browser:
- **Zero data transmission**: No bookmark titles, URLs, or browsing histories are transmitted externally.
- **Minimal permissions**: Requests only `bookmarks` (to read and update bookmarks) and `storage` (to persist user theme preferences).

---

## Documentation & References

- [ARCHITECTURE.md](ARCHITECTURE.md) — Detailed technical specifications, data flow, stage-and-commit model, and state engine invariants.
- [CHANGELOG.md](CHANGELOG.md) — Release notes and chronological history of all features, fixes, and improvements.
- [PRIVACY_POLICY.md](PRIVACY_POLICY.md) — Plain-English declaration of data handling, permissions, and local storage.
- [CONTRIBUTING.md](CONTRIBUTING.md) — Guidelines for reporting issues, contributing features, and development practices.
- [SECURITY.md](SECURITY.md) — Vulnerability reporting policy and security scope.
- [Web Documentation](https://dipinknair.github.io/bookmarklab-extension/) — GitHub Pages landing page.

---

## Support & Donations

If BookmarkLab saves you time, simplifies your workflow, and keeps your bookmarks cleanly organized, consider supporting its independent development:

<a href="https://buymeacoffee.com/dipinknair619" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 48px !important;width: 174px !important;" ></a>

- ☕ **Buy Me a Coffee**: [buymeacoffee.com/dipinknair619](https://buymeacoffee.com/dipinknair619)
- ⭐ **Star this repository**: If you find BookmarkLab helpful, giving it a star on GitHub helps other users discover it.

---

## License

[MIT](LICENSE) © BookmarkLab
