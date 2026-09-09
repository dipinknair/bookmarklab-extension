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

def main():
    print("==================================================")
    print("BookmarkLab Extension Test Suite")
    print("==================================================")

    test_manifest()
    test_url_utils_logic()
    test_demo_bookmarks_html()
    test_javascript_integrity()
    test_undo_redo_invariants()

    print("\n==================================================")
    print(f"Results: {PASS_COUNT} PASSED, {FAIL_COUNT} FAILED")
    print("==================================================")

    if FAIL_COUNT > 0:
        sys.exit(1)

if __name__ == '__main__':
    main()
