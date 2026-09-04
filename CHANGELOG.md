# Changelog

All notable changes to dsh-upload-file are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.3] - 2026-09-05

### Changed
- Removed the absolute-path sub-line from file rows.
- File names now wrap to at most two lines (CSS `-webkit-line-clamp:2`)
  instead of a single middle-ellipsis line; the full path remains
  available via the "Copy full path" menu action.

## [0.2.2] - 2026-09-05

### Fixed
- Long-pressing the context menu's title (file name) on phones could
  still trigger the native text-selection callout — the suppression
  previously covered only the table. Selection suppression (CSS +
  native `selectstart` blocker) now covers the entire overlay:
  window, action menu, and toasts.

## [0.2.1] - 2026-09-05

### Fixed
- Long-pressing a row on phones could trigger the browser's native
  text-selection / copy-paste callout. `user-select` /
  `-webkit-touch-callout` are now applied to every text element inside
  the table (they do not inherit from the row), plus a native
  `selectstart` blocker on the list container.

## [0.2.0] - 2026-09-05

### Changed
- Replaced the three inline row buttons with a context menu: right-click
  (desktop) or long-press (touch) on a file row opens a menu with
  Mention / Open / Copy name / Copy full path / Delete.
- Dropped the actions column — the file-name column gets the space back.

### Added
- Copy filename / copy full path actions (async Clipboard API with
  `execCommand` fallback).
- Toast feedback for every action (red toast on failure).

## [0.1.2] - 2026-09-05

### Changed
- File list now sorts by upload time **descending** — the most recently
  uploaded file appears at the top (previously ascending, newest at the bottom).

## [0.1.1] - 2026-09-05

### Fixed
- Responsive column widths: on narrow (phone) viewports the fixed columns
  (icon / size / actions) and the row buttons shrink via a `max-width:640px`
  media query, returning the space to the file-name column — names are no
  longer truncated to a few characters on phones.

## [0.1.0] - 2026-09-04

### Added
- Paperclip file-library button in the composer toolbar (per-session file count badge).
- Library window: multi-file upload with per-file progress draft (cancel / retry / remove),
  type icons with live image/video thumbnails, name + absolute path + size.
- Per-row actions: `@` insert reference, `↗` open via DSH `workspaces.openPath` funnel
  (Better Sidebar editor when installed, system default app otherwise), `🗑️` delete
  (browser-native confirm).
- Uploads land in `<workspace>/uploaded_files/<sessionId>/` — per-session isolation,
  filename is the sole identity (re-upload dedup with `_1`/`_2` suffixes).
- `@UPLOAD: <file>` references in the composer and in past messages (re-rendered as
  interactive action rows).
- System-prompt context injection of the session's upload directory (only when non-empty).
- SHA-256 verification of every upload (client-side digest, server-side commit check).
