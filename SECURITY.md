# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in BookmarkLab, please do not open a public GitHub issue.

Instead, report it privately by emailing the repository owner or by using [GitHub's private vulnerability reporting](https://github.com/dipinknair/bookmarklab-extension/security/advisories/new).

Please include:
- A description of the vulnerability and its potential impact.
- Steps to reproduce it.
- Any relevant environment details (Chrome version, OS, extension version).

You can expect an acknowledgement within 48 hours and a resolution or update within 7 days depending on severity.

## Scope

BookmarkLab runs entirely within the browser and does not transmit data externally. Security issues of interest include:

- Any way the extension could leak bookmark data to an external party.
- Content Security Policy bypass.
- Permission escalation or abuse of the `bookmarks` or `storage` APIs beyond the stated purpose.
