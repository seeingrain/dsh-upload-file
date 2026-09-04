# dsh-upload-file

[![CI](https://git.6.seeingrain.fun:6443/dsh/dsh-upload-file/actions/workflows/ci.yml/badge.svg)](https://git.6.seeingrain.fun:6443/dsh/dsh-upload-file/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> 🇨🇳 中文: [README.md](README.md)

Adds a **📎 file library** to DSH Web chat: upload files into the current session's private directory, with one action per row — **@ reference for the model, ↗ open, 🗑️ delete**. After upload, an `@UPLOAD:` reference is inserted into the composer automatically, so the model never needs a path from you. Every session's files are isolated, and re-uploading a name auto-suffixes `_1`/`_2` instead of clobbering.

| Library window (upload / list / row actions) | Composer entry (paperclip next to the plus button) |
| :---: | :---: |
| ![Library window](https://git.6.seeingrain.fun:6443/dsh/dsh-upload-file/media/branch/main/assets/preview-1-library.png) | ![Composer entry](https://git.6.seeingrain.fun:6443/dsh/dsh-upload-file/media/branch/main/assets/preview-2-composer.png) |

## Features

- **📎 File library** button in the composer toolbar (next to the plus button), with a badge showing this session's file count
- Library window:
  - **Upload**: file picker, multi-select in one go
  - List: type icon (live thumbnails for images/video) + name + absolute path + size
  - Three actions per row: **@** insert reference / **↗** open / **🗑️** delete
- **@**: inserts `@UPLOAD: <file>` into the composer (auto-inserted after upload completes)
- **↗**: goes through DSH's unified `workspaces.openPath` funnel — Better Sidebar editor when installed, otherwise falls back to `xdg-open` (system default app)
- **🗑️**: deletes the file on disk after a native browser confirm (no recycle bin — use with care)
- Upload drafts while in flight (progress / cancel / retry / remove)
- Upload actions in past messages re-render as interactive tool rows (same three buttons)

## Storage (filesystem as registry, no JSON index)

- One subdirectory per session: `<workspace>/uploaded_files/<sessionId>/`
- **The filename is the identity** (no displayName indirection); re-uploading the same name in one session gets an auto `_1`/`_2` suffix, and the `@UPLOAD:` reference always equals the actual file name on disk
- Sessions are fully isolated: the same name in different sessions never conflicts
- Listing = `readdir` + `stat` (sorted by mtime descending — newest upload on top)
- The system prompt injects the session's upload-directory convention per session (skipped when the directory is empty)

## Security

- SHA-256 verification for the whole upload (client-side digest, compared server-side at commit)
- Path-traversal guards on every file operation (`normalize(join())` must stay inside the session directory)
- `sessionId` strictly validated (UUID format); the workspace is resolved from the session's own `header.cwd` — client-supplied paths are never trusted

## HTTP API (prefix /dsh-upload-file/v1)

- `POST /uploads/prepare` `{sessionId, name, size}` → `{uploadId, putUrl, commitUrl, deleteUrl}`
- `PUT /uploads/<id>` streaming upload (application/octet-stream, inline sha256)
- `POST /uploads/<id>/commit` `{expectedSha256}` → `{name, displayName, absolutePath, size, createdAt}`
- `DELETE /uploads/<id>` cancel (an already-committed id returns 404; the client swallows it)
- `GET /sessions/<sessionId>/attachments` directory listing
- `GET /attachments/content?sessionId&name` download / open (traversal-safe)
- `DELETE /sessions/<sessionId>/attachments?name=` delete a committed file

## Build

```bash
pnpm install
pnpm run build
```

## Install

```sh
dsh plugin --profile web add https://git.6.seeingrain.fun:6443/dsh/dsh-upload-file
# the host half needs a web restart; the client half loads on next page refresh
```

Local dev link: add `"dsh-upload-file": "link:<path to this repo>"` to
`profiles/web/package.json` dependencies, append `dsh-upload-file` to the
bundles list, then `pnpm install`.

## License

MIT — see [LICENSE](LICENSE).
