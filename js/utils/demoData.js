/**
 * Demo Dataset for BookmarkLab Bookmark Organizer
 * Realistic sample tree containing individual bookmarks (with icon-only links), duplicates, tracking tags, and nested folders
 */

export const DEMO_BOOKMARK_TREE = {
  id: 'root',
  title: 'Bookmarks Bar',
  type: 'folder',
  children: [
    // 1. Individual Bookmarks (Top of Bookmarks Bar)
    {
      id: 'bm-icon-1',
      title: '', // Icon-only bookmark (Gmail)
      url: 'https://mail.google.com/',
      type: 'bookmark',
      dateAdded: 1680000000000,
      tags: ['email', 'work']
    },
    {
      id: 'bm-icon-2',
      title: '', // Icon-only bookmark (YouTube with tracking tag)
      url: 'https://www.youtube.com/?fbclid=IwAR1234567890',
      type: 'bookmark',
      dateAdded: 1680100000000
    },
    {
      id: 'bm-icon-3',
      title: '', // Icon-only bookmark (Medium with tracking tag)
      url: 'https://medium.com/?ref=browser_bar',
      type: 'bookmark',
      dateAdded: 1680200000000
    },
    {
      id: 'bm-icon-4',
      title: '', // Icon-only bookmark (Reddit)
      url: 'https://reddit.com/',
      type: 'bookmark',
      dateAdded: 1680300000000
    },
    {
      id: 'bm-1',
      title: 'GitHub: Let’s build from here',
      url: 'https://github.com/?utm_source=bookmark&utm_medium=browser',
      type: 'bookmark',
      dateAdded: 1680400000000,
      tags: ['git', 'code']
    },
    {
      id: 'bm-2',
      title: 'Stack Overflow - Developer Q&A',
      url: 'https://stackoverflow.com/questions?utm_campaign=daily_digest',
      type: 'bookmark',
      dateAdded: 1680500000000,
      tags: ['q&a', 'dev']
    },
    {
      id: 'bm-3',
      title: 'MDN Web Docs',
      url: 'https://developer.mozilla.org/en-US/',
      type: 'bookmark',
      dateAdded: 1680600000000,
      tags: ['documentation', 'web']
    },

    // 2. Folders (Below individual bookmarks)
    {
      id: 'folder-dev',
      title: 'Development & Engineering',
      type: 'folder',
      children: [
        {
          id: 'bm-4',
          title: 'React – User Interfaces',
          url: 'https://react.dev/',
          type: 'bookmark',
          dateAdded: 1680700000000
        },
        {
          id: 'bm-5',
          title: 'Vite Frontend Tooling',
          url: 'https://vitejs.dev/',
          type: 'bookmark',
          dateAdded: 1680800000000
        },
        {
          id: 'bm-6',
          title: 'TypeScript Syntax',
          url: 'https://www.typescriptlang.org/',
          type: 'bookmark',
          dateAdded: 1680900000000
        }
      ]
    },
    {
      id: 'folder-media',
      title: 'Media & Reading',
      type: 'folder',
      children: [
        {
          id: 'bm-7',
          title: 'Hacker News - Tech & Startups',
          url: 'https://news.ycombinator.com/',
          type: 'bookmark',
          dateAdded: 1681000000000
        },
        {
          id: 'bm-8',
          title: 'ArXiv.org e-Print Archive',
          url: 'https://arxiv.org/',
          type: 'bookmark',
          dateAdded: 1681100000000
        }
      ]
    },
    {
      id: 'folder-duplicates',
      title: 'Unsorted Import (Messy)',
      type: 'folder',
      children: [
        {
          id: 'bm-dup-1',
          title: 'GitHub Homepage',
          url: 'https://github.com/', // DUPLICATE of bm-1
          type: 'bookmark',
          dateAdded: 1681200000000
        },
        {
          id: 'bm-dup-2',
          title: 'YouTube Video Streaming',
          url: 'https://www.youtube.com/', // DUPLICATE of bm-icon-2
          type: 'bookmark',
          dateAdded: 1681300000000
        },
        {
          id: 'bm-11',
          title: 'The Verge - Tech News',
          url: 'https://www.theverge.com/?utm_source=twitter&utm_medium=social',
          type: 'bookmark',
          dateAdded: 1681400000000
        }
      ]
    }
  ]
};
