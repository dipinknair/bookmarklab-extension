# BookmarkLab — Browser Extension

A powerful, privacy-first browser extension that gives you live access to your Chrome/Edge/Brave bookmarks — directly within BookmarkLab's beautiful, full-featured workspace.

## Features

### 🔗 Live Chrome Bookmark Sync
- **Auto-loads** your real Chrome bookmarks the moment you open the extension dashboard
- No export/import needed — your actual bookmarks are loaded directly via the `chrome.bookmarks` API
- Changes you make in BookmarkLab are tracked in the dashboard session

### 🧹 Full Bookmark Management Suite
| Feature | Description |
|---|---|
| **Duplicate Detection** | Find & auto-resolve duplicate bookmarks across all folders |
| **Auto-Cluster** | Organize bookmarks into folders by domain or smart topic category |
| **Clean Tracking URLs** | Strip `utm_*`, `fbclid`, `gclid`, `ref`, and other tracking parameters |
| **Link Health Check** | Verify all bookmarks are reachable in one click |
| **Drag & Drop** | Reorganize folders and bookmarks with drag-and-drop |
| **Undo / Redo** | Full undo/redo history (Cmd+Z / Cmd+Shift+Z) |
| **Export** | Export cleaned bookmarks as HTML, Markdown, or JSON |

### 📊 Quick Popup (Toolbar)
Click the extension icon to see:
- Total bookmark count, folder count
- Duplicate count, tracking tags count
- Quick-action buttons to launch Auto-Cluster, Dedupe, or Clean Tracking in the full dashboard

---

## Loading the Extension

### Chrome / Edge / Brave / Chromium-based Browsers

1. Open your browser and navigate to the extensions page:
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`
   - **Brave**: `brave://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select the `/bookmarklab-extension` folder (this directory)
5. The BookmarkLab icon will appear in your browser toolbar 🎉

### Firefox Developer Mode

Firefox uses Manifest V3 with some differences. To load:

1. Open Firefox and navigate to `about:debugging`
2. Click **"This Firefox"** in the left sidebar
3. Click **"Load Temporary Add-on..."**
4. Select the `manifest.json` file inside this directory
5. The extension loads temporarily until you restart Firefox

> **Note**: Firefox support requires adjustments to `manifest.json` (using `browser_action` instead of `action`). Chrome/Edge/Brave are the primary supported targets.

---

## File Structure

```
bookmarklab-extension/
├── manifest.json           # Extension manifest (Manifest V3)
├── background.js           # Service worker
├── index.html              # Full dashboard (opens in new tab)
├── popup.html              # Toolbar popup UI
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── css/
│   └── styles.css          # Complete design system
└── js/
    ├── app.js              # Main application controller (with Chrome sync)
    ├── state.js            # State manager with undo/redo
    ├── chromeBookmarks.js  # chrome.bookmarks API bridge
    ├── popup.js            # Popup controller
    ├── parsers/
    │   ├── htmlParser.js   # Netscape Bookmark HTML parser
    │   ├── jsonParser.js   # Chrome JSON bookmark parser
    │   └── exporter.js     # HTML / Markdown / JSON exporter
    ├── components/
    │   ├── treeView.js     # Left sidebar folder tree
    │   ├── mainView.js     # Grid/List bookmark view
    │   ├── inspector.js    # Right panel inspector/editor
    │   └── modals.js       # Dedupe, cluster, export modals
    └── utils/
        ├── urlUtils.js     # URL parsing, favicon, dedup, categorize
        └── demoData.js     # Sample bookmark dataset
```

---

## Privacy

BookmarkLab processes all your bookmarks **locally in your browser**. No data is sent to any external server. The `chrome.bookmarks` permission only grants read/write access to your bookmarks — nothing else.

---

## Development

To work on the extension locally:

1. Make your changes to any file in this directory
2. In `chrome://extensions`, click the **refresh icon** on the BookmarkLab extension card to reload changes
3. For popup or background script changes, click the **reload** button after each edit
