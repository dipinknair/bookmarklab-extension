# BookmarkLab Architecture & Engineering Specifications

This document outlines the software architecture, data flow, component hierarchy, and design principles implemented in the BookmarkLab browser extension.

---

## 1. Architectural Philosophy & Principles

BookmarkLab is designed following modern software engineering principles:

| Principle | Implementation in BookmarkLab |
|---|---|
| **DRY** (Don't Repeat Yourself) | Centralized HTML entity sanitization (`domUtils.js`), single source of truth for duplicate detection and URL tracking stripping (`urlUtils.js`), shared link health checking, and unified theme persistence. |
| **YAGNI** (You Aren't Gonna Need It) | Built with pure standard ES modules and CSS with zero external npm dependencies or bundlers. Eliminates build steps, minimizes asset footprint, and loads instantly (<50ms). |
| **SoC** (Separation of Concerns) | Clear separation between data access (`chromeBookmarks.js`), state management (`state.js`), format transformation (`parsers/`), UI rendering (`components/`), and application orchestration (`app.js`). |
| **SOLID** | **Single Responsibility**: Each module owns exactly one domain (e.g., URL utils vs DOM utils vs State).<br>**Open/Closed**: Extension via pub/sub listeners and route dispatching.<br>**Dependency Inversion**: UI components receive callbacks rather than coupling directly to global runtime elements. |

---

## 2. System Overview & Component Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                     Popup UI (popup.html)                   │
│   • Instant stats: Total Bookmarks, Folders, Dupes, Tags    │
│   • Quick Action deep-links: #dedupe, #cluster, #clean      │
│   • Theme accent selector                                   │
└──────────────────────────────┬──────────────────────────────┘
                               │ Opens full tab
┌──────────────────────────────▼──────────────────────────────┐
│                  Dashboard (index.html / app.js)            │
│   • Stage-and-commit controller & diff engine               │
│   • Deep-link hash navigation router                        │
│   • Sidebar resize, search, smart views, keyboard shortcuts │
└───────┬──────────────────────┬──────────────────────┬───────┘
        │                      │                      │
┌───────▼───────┐      ┌───────▼───────┐      ┌───────▼──────┐
│  Tree View    │      │   Main View   │      │  Inspector   │
│ (treeView.js) │      │ (mainView.js) │      │(inspector.js)│
└───────┬───────┘      └───────┬───────┘      └───────┬──────┘
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               │
                ┌──────────────▼─────────────┐
                │   Central State (state.js) │
                │   • In-memory tree model   │
                │   • Deterministic History  │
                │   • Pub/Sub subscribers    │
                └──────────────┬─────────────┘
                               │
      ┌────────────────────────┴────────────────────────┐
      ▼                                                 ▼
┌───────────────────────────┐             ┌───────────────────────────┐
│     Chrome API Bridge     │             │       Format Parsers      │
│   (chromeBookmarks.js)    │             │  (htmlParser / jsonParser │
│ • Tree translation        │             │        / exporter)        │
│ • Safe batch sync engine  │             │ • Netscape HTML & JSON    │
└───────────────────────────┘             └───────────────────────────┘
```

---

## 3. The Stage-and-Commit Model

Traditional bookmark extensions edit browser bookmarks live on every user click, risking accidental data loss or disruption to syncing browsers. BookmarkLab employs a **stage-and-commit model**:

1. **Initial Snapshot**:
   When the dashboard opens, `loadChromeBookmarks()` fetches the full tree and stores an immutable `originalChromeSnapshot`.
2. **In-Memory Manipulation**:
   All user actions (folder renames, drag-and-drop reorganization, deduplication, tracking parameter cleanup, additions, and deletions) mutate only the in-memory tree in `state.js`.
3. **Diff Computation (`computeDiff`)**:
   When the user clicks **Sync Bookmarks**, the current tree is flattened into `currentNodes` and compared with `originalChromeSnapshot`:
   - `toDelete`: Nodes present in original snapshot but absent from current tree.
   - `toMove`: Nodes whose `parentId` changed.
   - `toUpdate`: Nodes whose `title` or `url` changed.
   - `toCreate`: Nodes created newly by the user.
4. **Interactive Summary Modal**:
   The user reviews an exact count and breakdown of changes before confirmation.
5. **Ordered Batch Application (`applySyncToChrome`)**:
   Operations are committed to `chrome.bookmarks` in strict dependency order:
   1. **Deletions** (folders first to allow Chrome's recursive deletion).
   2. **Updates** (title and URL updates on existing nodes).
   3. **Moves** (re-parenting to target folders).
   4. **Creations** (creating new folders, followed by bookmarks).

---

## 4. State Management & Undo/Redo Engine

The state architecture in `js/state.js` implements a deterministic sliding-window history stack:

```
[ State_0 ] ──> [ State_1 ] ──> [ State_2 ] (Current: historyIndex = 2)
```

- **Invariants**:
  - `history` holds up to `maxHistory` (default 40) deep-cloned tree snapshots.
  - `historyIndex` points to the active snapshot.
  - `canUndo()` evaluates `historyIndex > 0`.
  - `canRedo()` evaluates `historyIndex < history.length - 1`.
- **Branch Truncation**:
  If a user undoes to `historyIndex = 1` and makes a new edit, future snapshots are discarded (`history.slice(0, historyIndex + 1)`), starting a clean new branch.
- **Sliding Window**:
  When `history.length` exceeds `maxHistory`, the oldest state is shifted out and `historyIndex` is updated to maintain index integrity.
- **Deep Cloning**:
  Uses native `structuredClone` with a JSON serialization fallback, ensuring zero reference leakage between historical snapshots.

---

## 5. Security and Privacy Model

- **Zero Remote Tracking**: BookmarkLab communicates with zero third-party servers. All bookmark analysis, deduplication, search indexing, and URL cleaning happen locally within the browser.
- **XSS Prevention**: All user-controlled strings (titles, URLs, tags, folder names) are sanitized through `escapeHTML()` in `js/utils/domUtils.js` before being interpolated into HTML markup.
- **Input Guarding**: Global keyboard shortcuts (`Cmd+Z` / `Ctrl+Z`) check `document.activeElement` to ensure native text editing inside `<input>` and `<textarea>` elements is never intercepted.
- **Principle of Least Privilege**:
  - Only requests `bookmarks` and `storage`.
  - No `activeTab` or host permissions (`<all_urls>` script injection is NOT requested).

---

## 6. Directory Structure

```
bookmarklab-extension/
├── manifest.json              # Chrome Manifest V3 configuration
├── background.js              # Background service worker
├── index.html                 # Main dashboard UI
├── popup.html                 # Quick action popup UI
├── css/
│   └── styles.css             # Comprehensive design system & themes
├── js/
│   ├── app.js                 # Dashboard controller & sync orchestrator
│   ├── popup.js               # Extension popup controller
│   ├── state.js               # Central state & undo/redo engine
│   ├── chromeBookmarks.js     # Native chrome.bookmarks API bridge
│   ├── components/
│   │   ├── treeView.js        # Left sidebar folder explorer
│   │   ├── mainView.js        # Center grid / list bookmark workbench
│   │   ├── inspector.js       # Right detail inspection & edit panel
│   │   └── modals.js          # Deduplication, cluster, clean & batch dialogs
│   ├── parsers/
│   │   ├── htmlParser.js      # Netscape Bookmark HTML parser
│   │   ├── jsonParser.js      # Chrome JSON bookmark parser
│   │   └── exporter.js        # Netscape HTML, Markdown, JSON exporter
│   └── utils/
│       ├── domUtils.js        # HTML sanitization & download helpers
│       ├── urlUtils.js        # Normalization, tracking cleaning, health check
│       ├── theme.js           # Multi-accent theme engine & persistence
│       └── demoData.js        # Sample dataset for testing & offline mode
├── test/
│   └── demo-bookmarks.html    # Netscape HTML test dataset
├── docs/                      # GitHub Pages landing page
└── ARCHITECTURE.md            # Technical specifications (this document)
```
