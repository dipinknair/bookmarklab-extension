# Contributing to BookmarkLab

Thank you for your interest in contributing. Contributions of all kinds are welcome — bug reports, feature suggestions, documentation improvements, and code changes.

## Reporting a Bug

1. Check the [existing issues](https://github.com/dipinknair/bookmarklab-extension/issues) to see if it has already been reported.
2. If not, open a new issue using the **Bug Report** template.
3. Include your Chrome version, OS, and clear steps to reproduce the problem.

## Suggesting a Feature

Open an issue using the **Feature Request** template. Describe the problem you are trying to solve and why the feature would be useful.

## Making a Code Change

1. Fork the repository and create a branch from `main`.
2. Make your changes. Keep commits focused and descriptive.
3. Test your changes by loading the extension as an unpacked extension in Chrome (`chrome://extensions` → Developer mode → Load unpacked).
4. Open a pull request against `main` with a clear description of what you changed and why.

## Branch and Release Model

- All development happens on `main`.
- Releases are tagged from the `main` or `release` branches.
- Tags must follow the format `v1.0.0` to trigger the automated release workflow.

## Code Style

- Plain JavaScript (ES modules, no build step required).
- Keep functions small and focused.
- Comment anything non-obvious.
- Do not introduce external dependencies without discussion first.

## Questions

If you are unsure about anything, open a discussion or issue before spending time on a large change.
