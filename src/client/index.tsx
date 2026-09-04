/**
 * dsh-upload-file — client half.
 *
 * Adds a paperclip button to the composer tool row (beside the resident
 * chrome / plus menu). Clicking it opens a small popover listing:
 *   - "Upload new attachment" (multi-select file picker)
 *   - every attachment already uploaded in this session:
 *       [type icon] filename  size  [copy-link]
 * Clicking an attachment inserts a markdown reference into the composer:
 *       [Attached file: filename](absolute path)
 *
 * Uploads stream through the host routes with progress; drafts appear as
 * cards above the composer (progress / cancel / retry / remove) and ride the
 * sent message as appended markdown links. Historical messages project those
 * links back into clickable attachment cards.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

/* ------------------------------------------------------------------ */
/* constants                                                           */
/* ------------------------------------------------------------------ */

const API = '/dsh-upload-file/v1'
const MAX_DRAFT_FILES = 20

/* ------------------------------------------------------------------ */
/* styles                                                              */
/* ------------------------------------------------------------------ */

const STYLE_ID = 'dsh-upload-file-client-style'
const CSS = `
.duf-badge{position:relative;box-sizing:border-box;grid-column:1;grid-row:1/3;display:grid;place-items:center;width:30px;height:34px;overflow:visible;border:0;border-radius:0;background:transparent;color:#6b7280;line-height:1;text-align:center}
.duf-glyph{display:block;width:30px;height:34px;stroke-width:1.65}.duf-format{font-family:Inter,var(--dsw-font-family,sans-serif)}
.duf-badge[data-family="pdf"]{color:#d93d48}.duf-badge[data-family="word"]{color:#3478d4}.duf-badge[data-family="powerpoint"]{color:#d96b32}.duf-badge[data-family="excel"]{color:#278254}.duf-badge[data-family="archive"]{color:#a76e10}.duf-badge[data-family="image"]{color:#167f8a}.duf-badge[data-family="video"]{color:#7856a8}.duf-badge[data-family="audio"]{color:#a76e10}.duf-badge[data-family="text"]{color:#667085}.duf-badge[data-family="code"]{color:#5267bd}.duf-badge[data-family="config"]{color:#78833f}.duf-badge[data-family="generic"]{color:#6b7280}
.duf-paperclip{display:inline-flex;align-items:center;gap:4px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#555);cursor:pointer;padding:4px 6px;font-size:13px;line-height:16px;position:relative}
.duf-paperclip:hover,.duf-paperclip:focus-visible{background:var(--dsw-alias-interactive-bg-hover,#eee);outline:none}
/* Tool-row seat: between the plus menu (order 0) and the permission select.
   The slot anchor is display:contents, so this span is the direct flex item;
   the permission container is the sibling immediately before the slot anchor. */
.duf-paperclip-root{order:1}
div:has(+ div[data-slot="conversation.input.left"]){order:2}
.duf-badge-dot{position:absolute;top:1px;right:1px;min-width:14px;height:14px;border-radius:7px;background:var(--dsw-alias-state-business-primary,#4b6bfb);color:#fff;font-size:9px;font-weight:700;line-height:14px;text-align:center;padding:0 3px;box-sizing:border-box}
/* core window (file library) */
.duf-lib-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)}
.duf-lib{box-sizing:border-box;width:min(720px,92vw);max-height:80vh;display:flex;flex-direction:column;background:#fff;color:#111;border:1px solid rgba(17,17,17,.14);border-radius:12px;box-shadow:0 18px 48px rgba(0,0,0,.28);overflow:hidden}
.duf-lib-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid rgba(17,17,17,.10)}
.duf-lib-title{font-size:14px;font-weight:650;min-width:0}
.duf-lib-close{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;flex:none;border:none;background:transparent;border-radius:7px;color:rgba(17,17,17,.55);font-size:15px;cursor:pointer}
.duf-lib-close:hover{background:rgba(17,17,17,.08);color:#111}
.duf-lib-upload{display:inline-flex;align-items:center;justify-content:center;gap:8px;flex:1;min-width:0;max-width:440px;height:30px;border:1px solid #111;background:#111;color:#fff;border-radius:8px;padding:0 16px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.duf-lib-upload:hover{background:#333}
.duf-lib-scroll{overflow:auto;padding:2px 6px 10px;min-height:40px}
.duf-lib-empty{padding:28px 16px;text-align:center;color:rgba(17,17,17,.45);font-size:13px}
.duf-lib-table{width:100%;border-collapse:collapse;font-size:13px}
.duf-lib-table td{padding:7px 10px;border-bottom:1px solid rgba(17,17,17,.06);vertical-align:middle}
.duf-lib-table tr:last-child td{border-bottom:none}
.duf-lib-icon{display:inline-flex;align-items:center;justify-content:center;width:44px;height:36px;border-radius:6px;overflow:hidden;background:rgba(17,17,17,.05);flex:none}
.duf-lib-icon img,.duf-lib-icon video{width:100%;height:100%;object-fit:cover;display:block;background:rgba(17,17,17,.05)}
.duf-lib-name{display:block;font-weight:520;white-space:nowrap;overflow:hidden}
.duf-lib-name-sub{display:block;color:rgba(17,17,17,.42);font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden}
.duf-lib-size{color:rgba(17,17,17,.5);white-space:nowrap;font-variant-numeric:tabular-nums}
.duf-lib-actions{display:flex;gap:6px;justify-content:flex-end;align-items:center}
.duf-lib-btn{border:1px solid rgba(17,17,17,.16);background:#fff;border-radius:6px;padding:4px 9px;font-size:12px;cursor:pointer;line-height:1.1;font-family:inherit}
.duf-lib-btn:hover{background:rgba(17,17,17,.06)}
.duf-lib-btn.duf-lib-btn-danger{color:#c2410c;border-color:rgba(194,65,12,.32)}
.duf-lib-btn.duf-lib-btn-danger:hover{background:rgba(194,65,12,.08)}
.duf-lib-progress-row{display:flex;align-items:center;gap:8px}
.duf-lib-progress{flex:1;max-width:110px;height:6px;border-radius:3px;background:rgba(17,17,17,.10);overflow:hidden;display:inline-block}
.duf-lib-progress i{display:block;height:100%;background:#4f7cff;border-radius:3px}
.duf-lib-prog-pct{font-size:11px;color:rgba(17,17,17,.5);min-width:34px;text-align:right;font-variant-numeric:tabular-nums}
`

function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.append(style)
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/* 单行显示：过长时隐去中间部分（保留头部与尾部，尾部含扩展名） */
function middleEllipsis(str, head, tail) {
  const s = String(str ?? '')
  if (s.length <= head + tail + 3) return s
  return `${s.slice(0, head)}...${s.slice(-tail)}`
}

/* 用系统默认应用打开文件（DSH 通用接口 host.openPath → xdg-open） */
async function openWithSystem(absolutePath) {
  const rpcId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const resp = await fetch('/api/host.openPath', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method: 'host.openPath',
      payload: { path: absolutePath },
    }),
  })
  const data = await resp.json().catch(() => null)
  if (!data?.result?.ok) throw new Error(data?.result?.error?.message ?? `open failed (http ${resp.status})`)
}

const EXT_SPECS = {
  pdf: ['pdf', 'PDF'], doc: ['word', 'DOC'], docx: ['word', 'DOCX'], odt: ['word', 'ODT'],
  rtf: ['word', 'RTF'], ppt: ['powerpoint', 'PPT'], pptx: ['powerpoint', 'PPTX'],
  xls: ['excel', 'XLS'], xlsx: ['excel', 'XLSX'], csv: ['excel', 'CSV'], tsv: ['excel', 'TSV'],
  zip: ['archive', 'ZIP'], rar: ['archive', 'RAR'], '7z': ['archive', '7Z'], tar: ['archive', 'TAR'], gz: ['archive', 'GZ'],
  png: ['image', 'PNG'], jpg: ['image', 'JPG'], jpeg: ['image', 'JPG'], gif: ['image', 'GIF'],
  webp: ['image', 'WEBP'], bmp: ['image', 'BMP'], svg: ['image', 'SVG'], ico: ['image', 'ICO'],
  mp4: ['video', 'MP4'], webm: ['video', 'WEBM'], mov: ['video', 'MOV'], mkv: ['video', 'MKV'], avi: ['video', 'AVI'],
  mp3: ['audio', 'MP3'], wav: ['audio', 'WAV'], flac: ['audio', 'FLAC'], ogg: ['audio', 'OGG'], m4a: ['audio', 'M4A'],
  txt: ['text', 'TXT'], md: ['text', 'MD'], log: ['text', 'LOG'],
  js: ['code', 'JS'], mjs: ['code', 'MJS'], cjs: ['code', 'CJS'], ts: ['code', 'TS'], tsx: ['code', 'TSX'],
  jsx: ['code', 'JSX'], py: ['code', 'PY'], java: ['code', 'JAVA'], go: ['code', 'GO'], rs: ['code', 'RS'],
  c: ['code', 'C'], cpp: ['code', 'CPP'], h: ['code', 'H'], hpp: ['code', 'HPP'], sh: ['code', 'SH'], json: ['config', 'JSON'],
  yaml: ['config', 'YAML'], yml: ['config', 'YAML'], toml: ['config', 'TOML'], ini: ['config', 'INI'], env: ['config', 'ENV'],
  xml: ['config', 'XML'], html: ['code', 'HTML'], htm: ['code', 'HTML'], css: ['code', 'CSS'],
}

function specForName(name) {
  const base = String(name ?? '').split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ['generic', 'FILE']
  return EXT_SPECS[base.slice(dot + 1).toLowerCase()] ?? ['generic', 'FILE']
}

function VideoThumb({ src, alt }) {
  const [poster, setPoster] = useState('')
  useEffect(() => {
    let cancelled = false
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    v.playsInline = true
    v.src = src
    const draw = () => {
      if (cancelled || v.videoWidth === 0) return
      try {
        const c = document.createElement('canvas')
        const W = 160, H = 96
        c.width = W
        c.height = H
        const ctx = c.getContext('2d')
        const scale = Math.max(W / v.videoWidth, H / v.videoHeight)
        const sw = W / scale, sh = H / scale
        const sx = (v.videoWidth - sw) / 2, sy = (v.videoHeight - sh) / 2
        ctx.drawImage(v, sx, sy, sw, sh, 0, 0, W, H)
        setPoster(c.toDataURL('image/jpeg', 0.72))
      } catch { /* ignore */ }
    }
    v.onloadedmetadata = () => {
      try { v.currentTime = Math.min(0.1, (v.duration || 1) * 0.05) } catch { draw() }
    }
    v.onseeked = draw
    v.onerror = () => { v.onloadedmetadata = null; v.onseeked = null }
    return () => {
      cancelled = true
      v.onloadedmetadata = null
      v.onseeked = null
      v.onerror = null
      v.removeAttribute('src')
      v.load()
    }
  }, [src])
  if (poster) return React.createElement('img', { src: poster, alt, style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } })
  return React.createElement('video', { src, preload: 'metadata', muted: true, playsInline: true, 'aria-label': alt })
}

function FileBadge({ name, small }) {
  const [family, label] = specForName(name)
  return React.createElement('span', {
    className: 'duf-badge',
    'data-family': family,
    role: 'img',
    'aria-label': `${label} file`,
  }, React.createElement('svg', {
    className: 'duf-glyph', xmlns: 'http://www.w3.org/2000/svg', width: small ? 24 : 30,
    height: small ? 26 : 34, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
  },
    React.createElement('path', { d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z' }),
    React.createElement('path', { d: 'M14 2v5a1 1 0 0 0 1 1h5' }),
    family === 'generic'
      ? React.createElement(React.Fragment, null,
          React.createElement('path', { d: 'M10 9H8' }),
          React.createElement('path', { d: 'M16 13H8' }),
          React.createElement('path', { d: 'M16 17H8' }))
      : React.createElement('text', {
          className: 'duf-format', x: 12, y: 14.1, fill: 'currentColor', stroke: 'none',
          fontSize: label.length > 3 ? 4.2 : 5.2, fontWeight: 800, letterSpacing: 0.15,
          textAnchor: 'middle', dominantBaseline: 'middle',
        }, label),
  ))
}

/* ------------------------------------------------------------------ */
/* upload API + queue                                                  */
/* ------------------------------------------------------------------ */

async function responseJson(res) {
  let payload = {}
  try { payload = await res.json() } catch {}
  if (!res.ok) {
    const err = new Error(payload?.error?.message ?? `HTTP ${res.status}`)
    err.code = payload?.error?.code ?? 'FILE_UPLOAD_INCOMPLETE'
    throw err
  }
  return payload
}

class UploadApi {
  async prepare(sessionId, file) {
    const res = await fetch(`${API}/uploads/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, name: file.name, size: file.size }),
      credentials: 'same-origin',
    })
    return responseJson(res)
  }
  upload(url, file, onProgress, signal) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest()
      const abort = () => request.abort()
      const cleanup = () => signal.removeEventListener('abort', abort)
      request.open('PUT', url, true)
      request.withCredentials = true
      request.setRequestHeader('Content-Type', 'application/octet-stream')
      request.responseType = 'json'
      request.upload.onprogress = (e) => onProgress(e.loaded, e.total || file.size)
      request.onload = () => {
        cleanup()
        if (request.status >= 200 && request.status < 300) { resolve(request.response); return }
        const code = request.response?.error?.code
        reject(Object.assign(new Error(request.response?.error?.message ?? `PUT ${request.status}`), { code: typeof code === 'string' ? code : 'FILE_UPLOAD_INCOMPLETE' }))
      }
      request.onerror = () => { cleanup(); reject(Object.assign(new Error('upload failed'), { code: 'FILE_UPLOAD_INCOMPLETE' })) }
      request.onabort = () => { cleanup(); reject(Object.assign(new Error('aborted'), { code: 'FILE_ABORTED' })) }
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) { request.abort(); return }
      request.send(file)
    })
  }
  async commit(url, expectedSha256) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedSha256 }),
      credentials: 'same-origin',
    })
    return responseJson(res)
  }
  async cancel(url) {
    await fetch(url, { method: 'DELETE', credentials: 'same-origin' }).catch(() => {})
  }
  async deleteAttachment(sessionId, name) {
    const res = await fetch(`${API}/sessions/${encodeURIComponent(sessionId)}/attachments?name=${encodeURIComponent(name)}`, {
      method: 'DELETE', credentials: 'same-origin',
    })
    return responseJson(res)
  }
  async list(sessionId) {
    const res = await fetch(`${API}/sessions/${encodeURIComponent(sessionId)}/attachments`, { credentials: 'same-origin' })
    const payload = await responseJson(res)
    return payload.attachments ?? []
  }
  contentUrl(sessionId, name) {
    return `${API}/attachments/content?sessionId=${encodeURIComponent(sessionId)}&name=${encodeURIComponent(name)}`
  }
}

class AttachmentQueue {
  constructor(api) {
    this.api = api
    this.sessions = new Map()
    this.running = 0
    this.sequence = 0
    this.pumpScheduled = false
  }
  session(sessionId) {
    let s = this.sessions.get(sessionId)
    if (!s) {
      s = { drafts: [], listeners: new Set(), snapshot: Object.freeze([]) }
      this.sessions.set(sessionId, s)
    }
    return s
  }
  subscribe(sessionId, listener) {
    const s = this.session(sessionId)
    s.listeners.add(listener)
    return () => s.listeners.delete(listener)
  }
  getSnapshot(sessionId) {
    return this.session(sessionId).snapshot
  }
  hasDrafts(sessionId) {
    return this.session(sessionId).drafts.length > 0
  }
  enqueue(sessionId, files) {
    const s = this.session(sessionId)
    for (const file of files) {
      if (s.drafts.length >= MAX_DRAFT_FILES) break
      s.drafts.push({
        id: `attachment-${++this.sequence}`,
        file,
        displayName: file.name,
        size: file.size,
        state: 'waiting',
        progress: 0,
        prepared: undefined,
        ready: undefined,
        errorCode: undefined,
        controller: undefined,
        cancelled: false,
      })
    }
    this.publish(s)
    this.schedulePump()
  }
  publish(s) {
    s.snapshot = Object.freeze(s.drafts.map((d) => Object.freeze({
      id: d.id,
      displayName: d.displayName,
      size: d.size,
      state: d.state,
      progress: d.progress,
      errorCode: d.errorCode,
      fileRef: d.ready?.absolutePath,
    })))
    for (const listener of s.listeners) listener()
  }
  schedulePump() {
    if (this.pumpScheduled) return
    this.pumpScheduled = true
    queueMicrotask(() => { this.pumpScheduled = false; this.pump() })
  }
  pump() {
    while (this.running < 3) {
      let next
      for (const s of this.sessions.values()) {
        const draft = s.drafts.find((d) => d.state === 'waiting')
        if (draft) { next = { s, draft }; break }
      }
      if (!next) return
      this.running += 1
      next.draft.state = 'uploading'
      this.publish(next.s)
      void this.run(next.s, next.draft).finally(() => { this.running -= 1; this.schedulePump() })
    }
  }
  async run(s, draft) {
    const sessionId = [...this.sessions].find(([, v]) => v === s)?.[0]
    if (!sessionId) return
    const controller = new AbortController()
    draft.controller = controller
    try {
      const prepared = await this.api.prepare(sessionId, draft.file)
      draft.prepared = prepared
      if (draft.cancelled) throw Object.assign(new Error('aborted'), { code: 'FILE_ABORTED' })
      const streamed = await this.api.upload(prepared.putUrl, draft.file, (loaded, total) => {
        if (draft.state !== 'uploading') return
        draft.progress = total <= 0 ? 0 : Math.max(0, Math.min(1, loaded / total))
        this.publish(s)
      }, controller.signal)
      if (draft.cancelled) throw Object.assign(new Error('aborted'), { code: 'FILE_ABORTED' })
      const ready = await this.api.commit(prepared.commitUrl, streamed.sourceSha256 ?? streamed.sha256 ?? streamed.bytes ?? streamed)
      draft.ready = ready
      draft.progress = 1
      draft.state = 'ready'
      draft.errorCode = undefined
    } catch (error) {
      draft.state = 'failed'
      draft.errorCode = error?.code ?? 'FILE_UPLOAD_INCOMPLETE'
    } finally {
      draft.controller = undefined
      this.publish(s)
    }
  }
  async cancel(sessionId, id) {
    const s = this.session(sessionId)
    const draft = s.drafts.find((d) => d.id === id)
    if (!draft) return
    draft.cancelled = true
    draft.controller?.abort()
    if (draft.prepared) await this.api.cancel(draft.prepared.deleteUrl).catch(() => {})
    draft.controller = undefined
    draft.state = 'failed'
    draft.errorCode = 'FILE_ABORTED'
    this.publish(s)
  }
  async retry(sessionId, id) {
    const s = this.session(sessionId)
    const draft = s.drafts.find((d) => d.id === id)
    if (!draft || draft.state !== 'failed') return
    draft.cancelled = false
    draft.prepared = undefined
    draft.ready = undefined
    draft.errorCode = undefined
    draft.progress = 0
    draft.state = 'waiting'
    this.publish(s)
    this.schedulePump()
  }
  async remove(sessionId, id) {
    const s = this.session(sessionId)
    const draft = s.drafts.find((d) => d.id === id)
    if (!draft) return
    draft.cancelled = true
    draft.controller?.abort()
    if (draft.prepared) await this.api.cancel(draft.prepared.deleteUrl).catch(() => {})
    s.drafts = s.drafts.filter((d) => d.id !== id)
    this.publish(s)
    this.schedulePump()
  }
  async waitUntilReady(sessionId) {
    const s = this.session(sessionId)
    for (;;) {
      const failed = s.drafts.find((d) => d.state === 'failed')
      if (failed) throw Object.assign(new Error(`Upload failed: ${failed.displayName}`), { code: failed.errorCode })
      if (s.drafts.every((d) => d.state === 'ready')) {
        return s.drafts.map((d) => ({ displayName: d.displayName, absolutePath: d.ready.absolutePath }))
      }
      await new Promise((resolve) => {
        const off = this.subscribe(sessionId, () => { off(); resolve() })
      })
    }
  }
  async adoptAndClear(sessionId) {
    const s = this.session(sessionId)
    s.drafts = []
    this.publish(s)
  }
  dispose() {
    for (const s of this.sessions.values()) {
      for (const d of s.drafts) d.controller?.abort()
      s.listeners.clear()
    }
    this.sessions.clear()
  }
}

/* ------------------------------------------------------------------ */
/* core window: paperclip button + file library table                  */
/* ------------------------------------------------------------------ */

function FileLibraryWindow({ queue, sessionId, inputActions, useInput, openFile }) {
  ensureStyles()
  const [open, setOpen] = useState(false)
  const [attachments, setAttachments] = useState(null)
  const [version, setVersion] = useState(0)
  const api = useMemo(() => new UploadApi(), [])
  const fileInputRef = useRef(null)
  const overlayRef = useRef(null)

  let liveDraft = ''
  try { liveDraft = useInput ? (useInput((s) => s.draft) ?? '') : '' } catch { liveDraft = '' }

  const drafts = useSyncExternalStore(
    (listener) => queue.subscribe(sessionId, listener),
    () => queue.getSnapshot(sessionId),
    () => queue.getSnapshot(sessionId),
  )
  const activeDrafts = drafts.filter((d) => d.state === 'waiting' || d.state === 'uploading' || d.state === 'failed')
  const totalFiles = (attachments?.length ?? 0) + activeDrafts.length

  const refresh = useCallback(async () => {
    try {
      const list = await api.list(sessionId)
      list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      setAttachments(list)
    } catch {
      setAttachments([])
    }
  }, [api, sessionId])

  useEffect(() => { void refresh() }, [refresh, version, open])

  // 上传完成（ready）后：自动往 composer 插 @UPLOAD 标记 + 刷新列表 + 清理 ready 的 draft
  const autoRef = useRef(new Set())
  useEffect(() => {
    if (!open) return
    const done = drafts.filter((d) => d.state === 'ready')
    if (done.length === 0) return
    for (const d of done) {
      if (!autoRef.current.has(d.id)) {
        autoRef.current.add(d.id)
        const marker = `@UPLOAD: ${d.displayName}`
        const cur = liveDraft
        inputActions?.setDraft?.(cur.length > 0 ? `${cur.replace(/\s*$/, '')}\n${marker}` : marker)
      }
    }
    void refresh()
    for (const d of done) void queue.remove(sessionId, d.id)
  }, [drafts, open, refresh, queue, sessionId, liveDraft, inputActions])

  const openWin = useCallback(() => { setAttachments(null); setOpen(true) }, [])
  const closeWin = useCallback(() => { setOpen(false) }, [])

  const onPickFiles = useCallback((files) => {
    queue.enqueue(sessionId, files)
  }, [queue, sessionId])

  const insertReference = useCallback((displayName) => {
    const marker = `@UPLOAD: ${displayName}`
    const next = liveDraft.length > 0 ? `${liveDraft.replace(/\s*$/, '')}\n${marker}` : marker
    inputActions?.setDraft?.(next)
    closeWin()
  }, [inputActions, liveDraft, closeWin])

  const iconFor = (entry) => {
    const [family] = specForName(entry.displayName)
    if (family === 'image') {
      return React.createElement('img', { src: api.contentUrl(sessionId, entry.name), alt: entry.displayName, loading: 'lazy', draggable: false })
    }
    if (family === 'video') {
      return React.createElement(VideoThumb, { src: api.contentUrl(sessionId, entry.name), alt: entry.displayName })
    }
    return React.createElement(FileBadge, { name: entry.displayName, small: true })
  }

  return React.createElement('span', { className: 'duf-paperclip-root', style: { position: 'relative', display: 'inline-flex' } },
    React.createElement('button', {
      className: 'duf-paperclip', type: 'button', title: 'Workspace files',
      'aria-expanded': open, onClick: openWin,
    },
      React.createElement('svg', {
        xmlns: 'http://www.w3.org/2000/svg', width: 16, height: 16, viewBox: '0 0 24 24',
        fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
      }, React.createElement('path', { d: 'm21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48' })),
      totalFiles > 0 ? React.createElement('span', { className: 'duf-badge-dot' }, String(totalFiles)) : null,
    ),
    React.createElement('input', {
      ref: fileInputRef, type: 'file', multiple: true, hidden: true,
      onChange: (e) => { const files = Array.from(e.target.files ?? []); if (files.length > 0) onPickFiles(files); e.target.value = '' },
    }),
    open
      ? React.createElement('div', {
          className: 'duf-lib-overlay', ref: overlayRef,
          onMouseDown: (e) => { if (e.target === overlayRef.current) closeWin() },
          onKeyDown: (e) => { if (e.key === 'Escape') closeWin() },
          tabIndex: -1,
        },
          React.createElement('div', { className: 'duf-lib', role: 'dialog', 'aria-label': 'Workspace files' },
            React.createElement('div', { className: 'duf-lib-header' },
              React.createElement('span', { className: 'duf-lib-title' }, `Workspace files${totalFiles ? ` (${totalFiles})` : ''}`),
              React.createElement('button', {
                className: 'duf-lib-upload', type: 'button', title: 'Upload files',
                onClick: () => fileInputRef.current?.click(),
              }, '⬆ Upload'),
              React.createElement('button', {
                className: 'duf-lib-close', type: 'button', title: 'Close',
                onClick: closeWin,
              }, '✕'),
            ),
            React.createElement('div', { className: 'duf-lib-scroll' },
              activeDrafts.length > 0
                ? React.createElement('table', { className: 'duf-lib-table', style: { tableLayout: 'fixed' } },
                    React.createElement('colgroup', null,
                      React.createElement('col', { style: { width: 64 } }),
                      React.createElement('col'),
                      React.createElement('col', { style: { width: 72 } }),
                      React.createElement('col', { style: { width: 132 } })),
                    React.createElement('tbody', null,
                      activeDrafts.map((d) => React.createElement('tr', { key: d.id },
                        React.createElement('td', null, React.createElement('span', { className: 'duf-lib-icon' }, React.createElement(FileBadge, { name: d.displayName, small: true }))),
                        React.createElement('td', null,
                          React.createElement('span', { className: 'duf-lib-name', title: d.displayName }, middleEllipsis(d.displayName, 14, 26)),
                          React.createElement('span', { className: 'duf-lib-name-sub' },
                            d.state === 'uploading' ? `Uploading ${Math.round(d.progress * 100)}%` : d.state === 'failed' ? (d.errorCode ?? 'Failed') : 'Waiting'),
                        ),
                        React.createElement('td', { className: 'duf-lib-size' }, formatSize(d.size)),
                        React.createElement('td', null,
                          React.createElement('div', { className: 'duf-lib-progress-row' },
                            React.createElement('span', { className: 'duf-lib-progress' }, React.createElement('i', { style: { width: `${Math.round(d.progress * 100)}%` } })),
                            React.createElement('span', { className: 'duf-lib-prog-pct' }, `${Math.round(d.progress * 100)}%`)),
                        ),
                      )),
                    ),
                  )
                : null,
              attachments === null
                ? null
                : attachments.length === 0 && activeDrafts.length === 0
                  ? React.createElement('div', { className: 'duf-lib-empty' }, 'No files yet. Click "Upload" to add.')
                  : attachments.length > 0
                    ? React.createElement('table', { className: 'duf-lib-table', style: { tableLayout: 'fixed' } },
                        React.createElement('colgroup', null,
                          React.createElement('col', { style: { width: 64 } }),
                          React.createElement('col'),
                          React.createElement('col', { style: { width: 72 } }),
                          React.createElement('col', { style: { width: 140 } })),
                        React.createElement('tbody', null,
                          attachments.map((entry) => React.createElement('tr', { key: entry.name },
                            React.createElement('td', null, React.createElement('span', { className: 'duf-lib-icon' }, iconFor(entry))),
                            React.createElement('td', null,
                              React.createElement('span', { className: 'duf-lib-name', title: entry.displayName }, middleEllipsis(entry.displayName, 14, 26)),
                              React.createElement('span', { className: 'duf-lib-name-sub', title: entry.absolutePath }, middleEllipsis(entry.absolutePath, 10, 36))),
                            React.createElement('td', { className: 'duf-lib-size' }, formatSize(entry.size)),
                            React.createElement('td', null,
                              React.createElement('div', { className: 'duf-lib-actions' },
                                React.createElement('button', {
                                  className: 'duf-lib-btn', type: 'button', title: 'Insert path into composer',
                                  onClick: () => insertReference(entry.displayName),
                                }, '@'),
                                React.createElement('button', {
                                  className: 'duf-lib-btn', type: 'button', title: 'Open with default app',
                                  onClick: async () => {
                                    try {
                                      if (typeof openFile === 'function') await openFile(entry.absolutePath)
                                      else await openWithSystem(entry.absolutePath)
                                    } catch (e) { window.alert(`Open failed: ${e.message}`) }
                                  },
                                }, '↗'),
                                React.createElement('button', {
                                  className: 'duf-lib-btn duf-lib-btn-danger', type: 'button', title: 'Delete file',
                                  onClick: () => {
                                    if (!window.confirm(`Delete "${entry.name}"? This removes the file from disk.`)) return
                                    void api.deleteAttachment(sessionId, entry.name).catch(() => {}).finally(() => setVersion((v) => v + 1))
                                  },
                                }, '🗑️'),
                              )),
                          )),
                        ),
                      )
                    : null,
            ),
          ),
        )
      : null,
  )
}

/* ------------------------------------------------------------------ */
/* entry                                                               */
/* ------------------------------------------------------------------ */

export const inject = ['slots', 'conversation', 'workspaces']

export function apply(context) {
  context.effect(() => {
    const api = new UploadApi()
    const queue = new AttachmentQueue(api)

    function ToolRowEntry(props) {
      const sessionId = typeof props?.sessionId === 'string'
        ? props.sessionId
        : String(props?.session?.sessionId ?? '')
      const inputActions = props?.inputActions
      const useInput = props?.useInput
      return React.createElement(FileLibraryWindow, {
        queue, sessionId, inputActions, useInput,
        /* 走 workspaces.openPath 漏斗：Better Sidebar 装了就进侧栏，没装回退 xdg-open */
        openFile: (path) => context.workspaces.openPath(path),
      })
    }

    const disposers = [
      () => queue.dispose(),
      context.slots.inject('conversation.input.left', () =>
        context.slots.register(
          {
            name: 'conversation.input.left',
            id: 'dsh-upload-file.paperclip',
            order: 10,
            registrant: 'dsh-upload-file',
          },
          ToolRowEntry,
        )),
    ]

    return () => { for (const dispose of disposers.reverse()) dispose() }
  }, 'dsh-upload-file.client')
}
