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
│   • Theme accent & Dark/Light mode selector                 │
└──────────────────────────────┬──────────────────────────────┘
                               │ Opens full tab
┌──────────────────────────────▼──────────────────────────────┐
│                  Dashboard (index.html / app.js)            │
│   • Stage-and-commit controller & diff engine               │
│   • Deep-link hash navigation router                        │
│   • Cross-browser import (file picker & drag-and-drop)      │
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
│ • Safe batch sync engine  │             │ • Cross-Browser Import:   │
│ • Hierarchical `idMap`    │             │   Safari, Firefox, Edge,  │
│   creation resolution     │             │   Arc, Chrome (HTML/JSON) │
└───────────────────────────┘             │ • Clean Export (HTML/JSON)│
                                          └───────────────────────────┘
```

---

## 3. The Stage-and-Commit Model

Traditional bookmark extensions edit browser bookmarks live on every user click, risking accidental data loss, clobbered folders, or disruption to browser synchronization. BookmarkLab employs a **stage-and-commit model**:

1. **Initial Snapshot**:
   When the dashboard opens, `loadChromeBookmarks()` fetches the full tree and stores an immutable `originalChromeSnapshot`.
2. **In-Memory Manipulation**:
   All user actions (folder renames, drag-and-drop reorganization, deduplication, tracking parameter cleanup, additions, deletions, and cross-browser imports) mutate only the in-memory tree in `state.js`.
3. **Diff Computation (`computeDiff`)**:
   When the user clicks **Sync Bookmarks**, the current tree is flattened into `currentNodes` and compared with `originalChromeSnapshot`:
   - `toDelete`: Nodes present in original snapshot but absent from current tree.
   - `toMove`: Nodes whose `parentId` changed.
   - `toUpdate`: Nodes whose `title` or `url` changed.
   - `toCreate`: Nodes created newly by the user (manual folder creation or imported trees).
4. **Interactive Summary Modal**:
   The user reviews an exact count and categorized breakdown of changes before confirmation.
5. **Ordered Batch Application (`applySyncToChrome`)**:
   Operations are committed to `chrome.bookmarks` in strict dependency order:
   1. **Deletions** (folders first to allow Chrome's recursive deletion).
   2. **Updates** (title and URL updates on existing nodes).
   3. **Moves** (re-parenting to target folders).
   4. **Creations** (creating new folders first, followed by bookmarks, utilizing `idMap`).

### 3.1. Hierarchical Creation Resolution (`idMap`)

When new bookmarks and deeply nested folder trees are imported into the workspace (or created offline), they are assigned synthetic in-memory IDs (e.g., `imported_folder_1`, `imported_subfolder_2`). Chrome's native `chrome.bookmarks.create({ parentId, title, url })` API requires a live Chrome-assigned parent ID.

To guarantee that deeply nested hierarchies sync accurately without parent-not-found errors:
1. `toCreate` operations are partitioned: folder nodes are created first, ordered by tree depth.
2. An `idMap = new Map()` tracks client synthetic IDs to Chrome-assigned IDs:
   ```js
   const created = await chrome.bookmarks.create({
     parentId: resolvedParentId,
     title: item.title
   });
   idMap.set(item.id, created.id);
   ```
3. Subsequent folder and bookmark creations resolve their parent ID dynamically:
   ```js
   const resolvedParentId = idMap.get(item.parentId) || item.parentId;
   ```
4. Move operations similarly resolve target parent IDs via `idMap`, ensuring newly created parent folders can immediately receive moved bookmarks.

### 3.2. Cross-Browser Import Pipeline & Isolation Strategies

BookmarkLab supports importing bookmark files from **Safari, Firefox, Microsoft Edge, Arc, Brave, Opera, and Google Chrome**:

- **Format Parsing**:
  - **Netscape Bookmark HTML (`htmlParser.js`)**: Parses standard `<DL><DT><H3>` and `<A HREF>` structures via the browser's native `DOMParser`, extracting folder hierarchies, timestamps (`ADD_DATE`), and URLs.
  - **Chrome / Chromium JSON (`jsonParser.js`)**: Parses native Chrome JSON bookmark dumps into standard internal node representations.
- **Three Destination Strategies**:
  1. **Dedicated Folder (Default)**: Creates an isolated container folder (e.g., `Imported - Sep 9, 2026`) under *Other Bookmarks*. The user's existing tree remains 100% clean and isolated until they choose to reorganize.
  2. **Merge into Existing Folders**: Reconciles top-level roots (`Bookmarks Bar`, `Other Bookmarks`) and merges imported bookmarks into matching folders without clobbering existing bookmarks.
  3. **Replace Active Workspace**: Clears the in-memory tree and adopts the imported hierarchy as the new workspace state (guarded by confirmation).
- **Automated Ingestion Pre-Processing**:
  - **Tracking Parameter Sanitization**: Users can toggle automatic URL cleaning to strip `utm_*`, `fbclid`, `gclid`, and marketing parameters during import.
  - **Duplicate Deduplication**: Automatically detects bookmarks with identical normalized URLs and retains only unique entries.
- **Drag-and-Drop File Ingestion**:
  - Users can drag `.html`, `.htm`, or `.json` files directly from their OS desktop onto the BookmarkLab dashboard. A visual drop-zone overlay intercepts `dragenter`/`dragover`/`drop` events and prompts the import dialog.

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
- **Local-Only File Processing**: Bookmark file imports (`.html`, `.json`) are processed entirely on the client side via the browser's `FileReader` and `DOMParser` / `JSON.parse`. Files are never uploaded or transmitted across the network.
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
├── index.html                 # Main dashboard UI (workbench, import & modals)
├── popup.html                 # Quick action popup UI
├── css/
│   └── styles.css             # Minimalist design system, dark/light & pastel tokens
├── js/
│   ├── app.js                 # Dashboard controller, import router & sync orchestrator
│   ├── popup.js               # Extension popup controller
│   ├── state.js               # Central state & undo/redo engine
│   ├── chromeBookmarks.js     # Native chrome.bookmarks API bridge
│   ├── components/
│   │   ├── treeView.js        # Left sidebar folder explorer
│   │   ├── mainView.js        # Center grid / list bookmark workbench
│   │   ├── inspector.js       # Right detail inspection & edit panel
│   │   └── modals.js          # Deduplication, cluster, clean & import dialogs
│   ├── parsers/
│   │   ├── htmlParser.js      # Netscape Bookmark HTML parser & importer
│   │   ├── jsonParser.js      # Chrome JSON bookmark parser & importer
│   │   └── exporter.js        # Netscape HTML, Markdown, JSON exporter
│   └── utils/
│       ├── domUtils.js        # HTML sanitization & download helpers
│       ├── urlUtils.js        # Normalization, tracking cleaning, health check
│       ├── theme.js           # Multi-accent theme engine & persistence
│       └── demoData.js        # Sample dataset for testing & offline mode
├── test/
│   ├── demo-bookmarks.html    # Netscape HTML test dataset
│   └── verify_suite.py        # 126 automated verification tests
├── store-assets/
│   └── screenshots.html       # Web Store marketing screenshot generator (1280x800)
├── docs/                      # GitHub Pages landing page (docs/index.html)
├── ARCHITECTURE.md            # Technical specifications (this document)
├── CHANGELOG.md               # Release history & version changelog
├── PRIVACY_POLICY.md          # Privacy disclosures
├── CONTRIBUTING.md           # Contribution guidelines
└── SECURITY.md                # Security policy & reporting guidelines
```
