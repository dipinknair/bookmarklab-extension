# Privacy Policy

**Last updated: September 2026**

BookmarkLab is a browser extension that helps you organize, clean, and manage your bookmarks.

## Data Collection

BookmarkLab does not collect any personal data. Specifically:

- No names, email addresses, or account information are collected.
- No browsing history is accessed or recorded.
- No bookmark data is transmitted to any external server or third party.
- No analytics, tracking, or crash reporting services are used.

## Data Access

BookmarkLab reads your browser bookmarks solely to display them inside the extension's workspace. Bookmark data never leaves your device.

When you use the "Sync Bookmarks" feature, changes are applied directly from your browser to your browser using the browser's built-in `chrome.bookmarks` API. This communication happens entirely within Chrome on your local machine.

## Local Storage

The extension uses `chrome.storage` to save minor UI preferences — such as your current view mode (grid or list), selected theme accent color, dark/light mode preference, and which folders are expanded in the sidebar. This data is stored locally on your device and is never transmitted anywhere.

## Backup & Export Feature

When you use the Backup or Export feature, an HTML, Markdown, or JSON file is generated locally in your browser and downloaded to your computer. This file is not uploaded or sent anywhere.

## Bookmark Import Feature

When you import bookmarks from another browser (using standard HTML or JSON export files), files are selected locally via your operating system's file picker or dragged directly onto the workspace. BookmarkLab parses the file entirely in-memory using your browser's local `DOMParser` or `JSON.parse`. The contents of your imported files are never uploaded, sent over the network, or stored outside your local session.

## Third Parties

BookmarkLab does not share data with, sell data to, or integrate with any third-party services.

## Changes to This Policy

If this policy changes in a future version, the updated version will be published in this repository with an updated date.

## Contact

If you have questions about this privacy policy, please open an issue at:
https://github.com/dipinknair/bookmarklab-extension/issues
