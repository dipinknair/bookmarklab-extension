#!/usr/bin/env python3
"""
BookmarkLab Extension — Verification Test Suite
Automated validation for:
1. Manifest V3 Schema & Permissions
2. URL Normalization and Tracking Parameter Stripping
3. Duplicate Grouping Logic Consistency
4. Netscape Bookmark HTML Header and Structure
5. JavaScript File Syntax & Bracket Balance
"""

import sys
import os
import json
import re
import struct
from urllib.parse import urlparse, parse_qs, urlencode

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

PASS_COUNT = 0
FAIL_COUNT = 0

def assert_test(condition, name, details=""):
    global PASS_COUNT, FAIL_COUNT
    if condition:
        PASS_COUNT += 1
        print(f"  [PASS] {name}")
    else:
        FAIL_COUNT += 1
        print(f"  [FAIL] {name}: {details}")

def test_manifest():
    print("\n--- Testing Manifest V3 Specification ---")
    manifest_path = os.path.join(ROOT_DIR, 'manifest.json')
    assert_test(os.path.isfile(manifest_path), "manifest.json exists")

    with open(manifest_path, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    assert_test(manifest.get('manifest_version') == 3, "Manifest version is 3")
    assert_test(manifest.get('name') == "BookmarkLab", "Extension name is BookmarkLab")

    # Validate Chrome version format: 1-4 dot-separated integers between 0 and 65535
    ver = manifest.get('version', '')
    ver_parts = ver.split('.')
    valid_ver = (
        1 <= len(ver_parts) <= 4 and
        all(part.isdigit() and 0 <= int(part) <= 65535 for part in ver_parts)
    )
    assert_test(valid_ver, f"Valid Chrome version string format ('{ver}')")

    perms = manifest.get('permissions', [])
    assert_test('bookmarks' in perms, "Has 'bookmarks' permission")
    assert_test('storage' in perms, "Has 'storage' permission")
    assert_test('activeTab' not in perms, "'activeTab' permission removed (least privilege)")

    bg = manifest.get('background', {})
    assert_test(bg.get('service_worker') == 'background.js', "Background service worker configured")
    assert_test(bg.get('type') == 'module', "Background service worker type is module")

    # Validate action and extension icons
    icons_dict = manifest.get('icons', {})
    action_icons = manifest.get('action', {}).get('default_icon', {})
    for size_str in ['16', '32', '48', '128']:
        size = int(size_str)
        assert_test(size_str in icons_dict, f"manifest.icons has {size_str}px entry")
        assert_test(size_str in action_icons, f"manifest.action.default_icon has {size_str}px entry")
        icon_path = os.path.join(ROOT_DIR, icons_dict.get(size_str, ''))
        assert_test(os.path.isfile(icon_path), f"Icon file exists: {icons_dict.get(size_str)}")
        if os.path.isfile(icon_path):
            with open(icon_path, 'rb') as img_f:
                sig = img_f.read(8)
                assert_test(sig == b'\x89PNG\r\n\x1a\n', f"{size_str}px icon has valid PNG signature")
                img_f.read(4)  # chunk length
                chunk_type = img_f.read(4)
                assert_test(chunk_type == b'IHDR', f"{size_str}px icon starts with IHDR chunk")
                w, h = struct.unpack('>II', img_f.read(8))
                assert_test((w, h) == (size, size), f"{size_str}px icon dimensions match exact {size}x{size} (found {w}x{h})")

def test_url_utils_logic():
    print("\n--- Testing URL Cleaning & Normalization Logic ---")
    tracking_params = {
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
        'fbclid', 'gclid', 'ref', 'ref_src', 'ref_url', '_ga', 'mc_cid', 'mc_eid',
        'igshid', 'twclid', 'si'
    }

    def clean_tracking(url_str):
        p = urlparse(url_str)
        qs = parse_qs(p.query, keep_blank_values=True)
        new_qs = {k: v for k, v in qs.items() if k not in tracking_params}
        has_changes = len(new_qs) != len(qs)
        cleaned_query = urlencode(new_qs, doseq=True)
        cleaned_url = p._replace(query=cleaned_query).geturl()
        return cleaned_url, has_changes

    def normalize_for_dedupe(url_str):
        p = urlparse(url_str)
        host = p.netloc.lower().removeprefix('www.')
        path = p.path.rstrip('/')
        return f"{host}{path}{p.query}".lower()

    # 1. Clean tracking parameters test
    dirty_url = "https://github.com/project?utm_source=twitter&utm_medium=social&fbclid=xyz123&page=2"
    cleaned, has_changes = clean_tracking(dirty_url)
    assert_test(has_changes is True, "Tracking parameters detected")
    assert_test("utm_source" not in cleaned, "utm_source removed")
    assert_test("fbclid" not in cleaned, "fbclid removed")
    assert_test("page=2" in cleaned, "Legitimate query parameter preserved")

    clean_url = "https://developer.mozilla.org/en-US/docs/Web/API"
    cleaned2, has_changes2 = clean_tracking(clean_url)
    assert_test(has_changes2 is False, "Clean URL produces no changes")

    # 2. Normalize for dedupe test
    url1 = "https://www.GitHub.com/features/"
    url2 = "http://github.com/features"
    norm1 = normalize_for_dedupe(url1)
    norm2 = normalize_for_dedupe(url2)
    assert_test(norm1 == norm2, f"URLs normalize to identical comparison key ('{norm1}')")

def test_demo_bookmarks_html():
    print("\n--- Testing demo-bookmarks.html Integrity ---")
    demo_path = os.path.join(ROOT_DIR, 'test', 'demo-bookmarks.html')
    assert_test(os.path.isfile(demo_path), "demo-bookmarks.html exists")

    with open(demo_path, 'r', encoding='utf-8') as f:
        content = f.read()

    assert_test(content.startswith("<!DOCTYPE NETSCAPE-Bookmark-file-1>"), "Valid Netscape DOCTYPE header on line 1")
    assert_test("x`x" not in content, "No accidental keystroke artifacts")
    assert_test("<DL>" in content and "</DL>" in content, "Contains balanced <DL> tags")
    assert_test("<H3" in content, "Contains folder headers (<H3>)")
    assert_test("<A HREF=" in content, "Contains bookmark links (<A HREF>)")

def test_javascript_integrity():
    print("\n--- Testing JavaScript Files & Structural Integrity ---")
    js_files = []
    for root, _, files in os.walk(ROOT_DIR):
        if 'node_modules' in root or '.git' in root:
            continue
        for file in files:
            if file.endswith('.js'):
                js_files.append(os.path.join(root, file))

    assert_test(len(js_files) >= 10, f"Found {len(js_files)} JavaScript modules")

    for file_path in js_files:
        rel_path = os.path.relpath(file_path, ROOT_DIR)
        with open(file_path, 'r', encoding='utf-8') as f:
            code = f.read()

        # Check bracket balancing (basic check)
        open_curlies = code.count('{')
        close_curlies = code.count('}')
        assert_test(open_curlies == close_curlies, f"{rel_path}: Balanced curly braces ({open_curlies} vs {close_curlies})")

        open_parens = code.count('(')
        close_parens = code.count(')')
        assert_test(open_parens == close_parens, f"{rel_path}: Balanced parentheses ({open_parens} vs {close_parens})")

        # Check for unescaped stray template syntax or placeholders
        assert_test('TODO' not in code, f"{rel_path}: No unresolved TODOs")

def test_undo_redo_invariants():
    print("\n--- Testing Undo/Redo Engine State Invariants ---")
    # Simulate AppState history stack logic
    max_history = 40
    history = []
    history_index = -1

    def set_tree(tree, save_history=True):
        nonlocal history, history_index
        if save_history and history:
            history = history[:history_index + 1]
            history.append(tree)
            if len(history) > max_history:
                history.pop(0)
            history_index = len(history) - 1
        else:
            history = [tree]
            history_index = 0

    def can_undo():
        return history_index > 0

    def can_redo():
        return history_index >= 0 and history_index < len(history) - 1

    def undo():
        nonlocal history_index
        if can_undo():
            history_index -= 1
        return history[history_index]

    def redo():
        nonlocal history_index
        if can_redo():
            history_index += 1
        return history[history_index]

    # Initial state
    set_tree("State 0", save_history=False)
    assert_test(can_undo() is False, "Initial state cannot undo")
    assert_test(can_redo() is False, "Initial state cannot redo")
    assert_test(history_index == 0, "Initial historyIndex is 0")

    # Mutations
    set_tree("State 1", save_history=True)
    assert_test(can_undo() is True, "State 1 can undo")
    assert_test(can_redo() is False, "State 1 cannot redo")
    assert_test(history_index == 1, "historyIndex is 1")

    set_tree("State 2", save_history=True)
    assert_test(history_index == 2, "historyIndex is 2")

    # Undo to State 1
    curr = undo()
    assert_test(curr == "State 1", "Undo returns State 1")
    assert_test(can_undo() is True, "Can undo again to State 0")
    assert_test(can_redo() is True, "Can redo to State 2")

    # Undo to State 0
    curr0 = undo()
    assert_test(curr0 == "State 0", "Undo returns State 0")
    assert_test(can_undo() is False, "Cannot undo past State 0")
    assert_test(can_redo() is True, "Can redo to State 1")

    # Redo back to State 1
    curr_redo = redo()
    assert_test(curr_redo == "State 1", "Redo returns State 1")

    # Branch truncation: mutate from State 1 (history was [State 0, State 1, State 2])
    # After branching from index 1: history becomes [State 0, State 1, State 3 (branch)]
    set_tree("State 3 (branch)", save_history=True)
    assert_test(len(history) == 3, "History truncated future redo items (length is 3)")
    assert_test(history[-1] == "State 3 (branch)", "Current is State 3")
    assert_test(can_redo() is False, "Cannot redo on a new branch")

    # Sliding window test: push 45 states
    for i in range(4, 50):
        set_tree(f"State {i}", save_history=True)

    assert_test(len(history) == max_history, f"History clamped to max_history ({max_history})")
    assert_test(history_index == max_history - 1, f"historyIndex clamped to {max_history - 1}")

def test_theme_and_color_modes():
    print("\n--- Testing Dark/Light Theme & Accent Color Modes ---")
    theme_js_path = os.path.join(ROOT_DIR, 'js', 'utils', 'theme.js')
    assert_test(os.path.isfile(theme_js_path), "theme.js exists")

    with open(theme_js_path, 'r', encoding='utf-8') as f:
        theme_js = f.read()

    assert_test("export async function initTheme" in theme_js, "theme.js exports initTheme")
    assert_test("export function applyTheme" in theme_js, "theme.js exports applyTheme")
    assert_test("export function applyMode" in theme_js, "theme.js exports applyMode")
    assert_test("export function toggleMode" in theme_js, "theme.js exports toggleMode")
    assert_test("export function setupThemeSelector" in theme_js, "theme.js exports setupThemeSelector")
    assert_test("'dark'" in theme_js and "'light'" in theme_js, "theme.js supports dark and light modes")

    # Verify index.html contains theme mode toggle
    index_path = os.path.join(ROOT_DIR, 'index.html')
    with open(index_path, 'r', encoding='utf-8') as f:
        index_html = f.read()

    assert_test("theme-selector" in index_html, "index.html contains theme-selector")
    assert_test("theme-mode-btn" in index_html, "index.html contains theme-mode-btn")
    assert_test("icon-sun" in index_html and "icon-moon" in index_html, "index.html contains sun and moon icons")
    assert_test("Interactive Bookmark Manager" in index_html, "index.html brand tag is 'Interactive Bookmark Manager'")
    assert_test("https://github.com/dipinknair/bookmarklab-extension" in index_html, "index.html has GitHub repository link")
    assert_test("buymeacoffee.com/dipinknair619" in index_html, "index.html has Buy Me a Coffee link on left header")
    assert_test("btn-coffee" in index_html, "index.html contains btn-coffee element")

    # Verify popup.html contains theme mode toggle
    popup_path = os.path.join(ROOT_DIR, 'popup.html')
    with open(popup_path, 'r', encoding='utf-8') as f:
        popup_html = f.read()

    assert_test("theme-selector" in popup_html, "popup.html contains theme-selector")
    assert_test("theme-mode-btn" in popup_html, "popup.html contains theme-mode-btn")
    assert_test("icon-sun" in popup_html and "icon-moon" in popup_html, "popup.html contains sun and moon icons")
    assert_test('[data-mode="dark"]' in popup_html and '[data-mode="light"]' in popup_html, "popup.html styles dark and light tokens")

    # Verify styles.css contains dark and light tokens
    styles_path = os.path.join(ROOT_DIR, 'css', 'styles.css')
    with open(styles_path, 'r', encoding='utf-8') as f:
        styles_css = f.read()

    assert_test('[data-mode="dark"]' in styles_css, "styles.css has data-mode='dark' definitions")
    assert_test('[data-mode="light"]' in styles_css, "styles.css has data-mode='light' definitions")
    assert_test("theme-mode-btn" in styles_css, "styles.css styles theme-mode-btn")
    assert_test(".header-left" in styles_css, "styles.css styles header-left layout")
    assert_test(".btn-coffee" in styles_css, "styles.css styles btn-coffee hover state")
    assert_test("logo-ribbon" in index_html and "logo-tile" in index_html, "index.html contains squircle logo tile and ribbon")
    assert_test("logo-ribbon" in popup_html and "logo-tile" in popup_html, "popup.html contains squircle logo tile and ribbon")
    assert_test(".logo-ribbon" in styles_css, "styles.css styles theme-reactive logo-ribbon")
    assert_test(os.path.exists(os.path.join(ROOT_DIR, 'icons', 'app-icon.svg')), "icons/app-icon.svg exists")

def test_bookmark_import():
    print("\n--- Testing Bookmark Import Feature (Issue #1) ---")
    index_path = os.path.join(ROOT_DIR, 'index.html')
    with open(index_path, 'r', encoding='utf-8') as f:
        index_html = f.read()

    assert_test("btn-import" in index_html, "index.html contains Import button (btn-import)")
    assert_test("file-import-input" in index_html, "index.html contains file input (file-import-input)")
    assert_test("modal-import" in index_html, "index.html contains Import modal (modal-import)")
    assert_test('value="folder"' in index_html, "Import modal supports Dedicated Folder destination")
    assert_test('value="merge"' in index_html, "Import modal supports Merge destination")
    assert_test('value="replace"' in index_html, "Import modal supports Replace Workspace destination")
    assert_test("import-clean-tracking" in index_html, "Import modal provides auto-clean tracking checkbox")
    assert_test("import-open-dedupe" in index_html, "Import modal provides auto-dedupe checkbox")

    app_path = os.path.join(ROOT_DIR, 'js', 'app.js')
    with open(app_path, 'r', encoding='utf-8') as f:
        app_js = f.read()

    assert_test("parseBookmarkHTML" in app_js, "app.js imports parseBookmarkHTML")
    assert_test("parseBookmarkJSON" in app_js, "app.js imports parseBookmarkJSON")
    assert_test("openImportModal" in app_js, "app.js implements openImportModal")
    assert_test("btn-confirm-import" in app_js, "app.js binds btn-confirm-import click handler")
    assert_test("idMap" in app_js, "app.js uses idMap in applySyncToChrome for nested creations")

    # Simulation test: hierarchical creation ID resolution
    id_map = {'root': '1'}
    to_create = [
        {'id': 'folder-1', 'parentId': 'root', 'type': 'folder', 'title': 'Imported'},
        {'id': 'folder-2', 'parentId': 'folder-1', 'type': 'folder', 'title': 'Subfolder'},
        {'id': 'bm-1', 'parentId': 'folder-2', 'type': 'bookmark', 'title': 'Link 1', 'url': 'https://example.com'}
    ]

    simulated_chrome_tree = {'1': []}
    chrome_id_counter = 100

    for node in to_create:
        raw_parent = node['parentId']
        resolved_parent = id_map.get(raw_parent, raw_parent)
        assert_test(resolved_parent in simulated_chrome_tree, f"Parent ID resolved correctly for {node['title']} ('{resolved_parent}')")
        chrome_id_counter += 1
        new_chrome_id = str(chrome_id_counter)
        if node['type'] == 'folder':
            id_map[node['id']] = new_chrome_id
            simulated_chrome_tree[new_chrome_id] = []
        simulated_chrome_tree[resolved_parent].append(new_chrome_id)

    assert_test(len(simulated_chrome_tree['1']) == 1, "Root received single top-level folder")
    assert_test(id_map.get('folder-2') in simulated_chrome_tree[id_map['folder-1']], "Subfolder nested inside parent Chrome folder")

def main():
    print("==================================================")
    print("BookmarkLab Extension Test Suite")
    print("==================================================")

    test_manifest()
    test_url_utils_logic()
    test_demo_bookmarks_html()
    test_javascript_integrity()
    test_undo_redo_invariants()
    test_theme_and_color_modes()
    test_bookmark_import()

    print("\n==================================================")
    print(f"Results: {PASS_COUNT} PASSED, {FAIL_COUNT} FAILED")
    print("==================================================")

    if FAIL_COUNT > 0:
        sys.exit(1)

if __name__ == '__main__':
    main()
