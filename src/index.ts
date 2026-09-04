/**
 * dsh-upload-file — host half.
 *
 * Stores files in the session workspace's `uploaded_files/<sessionId>/`
 * directory. The filesystem IS the registry: no JSON index, no display-name
 * indirection — the filename is the single identity. The per-session system
 * prompt points the model at this session's own directory, so same-named
 * files from different sessions never collide.
 *
 * Routes (prefix /dsh-upload-file/v1):
 *   POST   /uploads/prepare   {sessionId, name, size}
 *   PUT    /uploads/<id>      application/octet-stream  (streamed, sha256 inline)
 *   POST   /uploads/<id>/commit {expectedSha256}
 *   DELETE /uploads/<id>
 *   GET    /sessions/<sessionId>/attachments          (directory listing + stat)
 *   GET    /attachments/content?sessionId&name         (download / open)
 *   DELETE /sessions/<sessionId>/attachments?name=     (delete a committed upload)
 */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream, readdirSync } from 'node:fs'
import { mkdir, rename, rm, stat, unlink } from 'node:fs/promises'
import { basename, join, normalize, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { SessionId } from '@deepseek-ai/dsh-session'

/** Services required before mounting. */
export const inject = ['agents', 'webServer', 'systemPrompt']

const API_PREFIX = '/dsh-upload-file/v1'
const UPLOAD_DIR_NAME = 'uploaded_files'
const MAX_FILE_BYTES = 8 * 1024 * 1024 * 1024 // 8 GiB, aligned with local open-file limits
/** Session ids arrive as `session-<uuid>` (persisted) or bare `<uuid>`; the
 *  `session-` prefix is part of the id, not a formatting artifact. */
const SESSION_ID_RE = /^(?:session-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Per-session upload directory: <workspace>/uploaded_files/<sessionId> */
function sessionUploadDir(workspace, sessionId) {
  return join(String(workspace), UPLOAD_DIR_NAME, String(sessionId))
}

/** Sanitize a display name into a safe filesystem basename. */
function safeBasename(name) {
  const base = basename(String(name ?? '').replaceAll('\\', '/')).trim()
  const cleaned = base.replace(/[\u0000-\u001f\u007f/\\:]/g, '_').replace(/^\.+/, '')
  return cleaned.length > 0 ? cleaned : 'file'
}

/** Resolve a non-colliding filename inside dir: the desired name as-is, or
 *  desired_1, desired_2, … (numeric suffix inserted before the extension).
 *  The chosen name becomes the file's identity, so it is returned as-is. */
function uniqueNameIn(dir, desired) {
  if (!readdirSyncSafe(dir).includes(desired)) return desired
  const dot = desired.lastIndexOf('.')
  const base = dot > 0 ? desired.slice(0, dot) : desired
  const ext = dot > 0 ? desired.slice(dot) : ''
  let n = 1
  let next
  do {
    next = `${base}_${n}${ext}`
    n += 1
  } while (readdirSyncSafe(dir).includes(next))
  return next
}

function readdirSyncSafe(dir) {
  try { return readdirSync(dir) } catch { return [] }
}

function readBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function writeJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function writeError(res, status, code, message) {
  writeJson(res, status, { error: { code, message } })
}

function sendFile(res, absPath, displayName) {
  const type = mimeFor(basename(absPath).slice(basename(absPath).lastIndexOf('.'))).toLowerCase()
  res.writeHead(200, {
    'content-type': type,
    'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(displayName)}`,
    'cache-control': 'no-store',
  })
  pipeline(createReadStream(absPath), res).catch(() => { res.destroy() })
}

function mimeFor(ext) {
  const map = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.json': 'application/json',
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
    '.mp4': 'video/mp4',
    '.mp3': 'audio/mpeg',
  }
  return map[ext] ?? 'application/octet-stream'
}

/* ------------------------------------------------------------------ */
/* router                                                              */
/* ------------------------------------------------------------------ */

export function apply(context) {
  /** Resolve the session workspace root, or null when the session is unknown. */
  const resolveWorkspace = (sessionId) => {
    if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) return null
    try {
      const agent = context.agents.get(SessionId(sessionId))
      return agent?.session.header.cwd ?? null
    } catch {
      return null
    }
  }

  /** Pending upload bookkeeping: uploadId -> {sessionId, name, size, tmpPath, hash, bytes} */
  const pending = new Map()

  const handler = async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname

    /* ---- POST /uploads/prepare ---- */
    if (req.method === 'POST' && path === `${API_PREFIX}/uploads/prepare`) {
      let body
      try {
        body = JSON.parse(await readBody(req))
      } catch {
        return writeError(res, 400, 'FILE_BAD_REQUEST', 'Invalid JSON body.')
      }
      const { sessionId, name, size } = body ?? {}
      if (typeof sessionId !== 'string' || typeof name !== 'string' || typeof size !== 'number') {
        return writeError(res, 400, 'FILE_BAD_REQUEST', 'sessionId, name and size are required.')
      }
      const workspace = resolveWorkspace(sessionId)
      if (!workspace) {
        return writeError(res, 404, 'FILE_SESSION_NOT_FOUND', 'Session workspace not found.')
      }
      if (size > MAX_FILE_BYTES || size < 0) {
        return writeError(res, 413, 'FILE_UPLOAD_TOO_LARGE', `File exceeds ${MAX_FILE_BYTES} bytes.`)
      }
      const uploadId = randomUUID()
      const tmpDir = join(sessionUploadDir(workspace, sessionId), '.tmp')
      await mkdir(tmpDir, { recursive: true })
      pending.set(uploadId, {
        sessionId,
        displayName: safeBasename(name),
        size,
        tmpPath: join(tmpDir, uploadId),
        hash: createHash('sha256'),
        bytes: 0,
      })
      return writeJson(res, 200, {
        uploadId,
        putUrl: `${API_PREFIX}/uploads/${uploadId}`,
        commitUrl: `${API_PREFIX}/uploads/${uploadId}/commit`,
        deleteUrl: `${API_PREFIX}/uploads/${uploadId}`,
      })
    }

    /* ---- PUT /uploads/<id> (stream) ---- */
    const putMatch = path.match(new RegExp(`^${API_PREFIX}/uploads/([0-9a-f-]+)$`))
    if (req.method === 'PUT' && putMatch) {
      const upload = pending.get(putMatch[1])
      if (!upload) return writeError(res, 404, 'FILE_UPLOAD_NOT_FOUND', 'Unknown upload.')
      try {
        const sink = createWriteStream(upload.tmpPath)
        req.on('data', (chunk) => {
          upload.bytes += chunk.length
          upload.hash.update(chunk)
          if (upload.bytes > upload.size) {
            sink.destroy(new Error('size exceeded'))
          }
        })
        await pipeline(req, sink)
        upload.sha256 = upload.hash.digest('hex')
        return writeJson(res, 200, { ok: true, bytes: upload.bytes, sourceSha256: upload.sha256 })
      } catch (err) {
        await rm(upload.tmpPath, { force: true }).catch(() => {})
        pending.delete(putMatch[1])
        return writeError(res, 400, 'FILE_UPLOAD_INCOMPLETE', err.message)
      }
    }

    /* ---- POST /uploads/<id>/commit ---- */
    const commitMatch = path.match(new RegExp(`^${API_PREFIX}/uploads/([0-9a-f-]+)/commit$`))
    if (req.method === 'POST' && commitMatch) {
      const upload = pending.get(commitMatch[1])
      if (!upload) return writeError(res, 404, 'FILE_UPLOAD_NOT_FOUND', 'Unknown upload.')
      let body
      try {
        body = JSON.parse(await readBody(req))
      } catch {
        return writeError(res, 400, 'FILE_BAD_REQUEST', 'Invalid JSON body.')
      }
      const expected = body?.expectedSha256
      const actual = upload.sha256
      if (typeof expected !== 'string' || expected !== actual) {
        await rm(upload.tmpPath, { force: true }).catch(() => {})
        pending.delete(commitMatch[1])
        return writeError(res, 400, 'FILE_CHECKSUM_MISMATCH', 'Checksum mismatch.')
      }
      const workspace = resolveWorkspace(upload.sessionId)
      if (!workspace) {
        await rm(upload.tmpPath, { force: true }).catch(() => {})
        pending.delete(commitMatch[1])
        return writeError(res, 404, 'FILE_SESSION_NOT_FOUND', 'Session workspace not found.')
      }
      const dir = sessionUploadDir(workspace, upload.sessionId)
      await mkdir(dir, { recursive: true })
      // 文件名即身份：重名时加 _1/_2 后缀，且该后缀名就是后续 @UPLOAD 引用名
      const fileName = uniqueNameIn(dir, upload.displayName)
      const finalPath = join(dir, fileName)
      await rename(upload.tmpPath, finalPath)
      pending.delete(commitMatch[1])

      return writeJson(res, 200, {
        name: fileName,
        displayName: fileName,
        absolutePath: finalPath,
        size: upload.bytes,
        createdAt: new Date().toISOString(),
      })
    }

    /* ---- DELETE /uploads/<id> ---- */
    if (req.method === 'DELETE' && putMatch) {
      const upload = pending.get(putMatch[1])
      if (!upload) return writeError(res, 404, 'FILE_UPLOAD_NOT_FOUND', 'Unknown upload.')
      await rm(upload.tmpPath, { force: true }).catch(() => {})
      pending.delete(putMatch[1])
      return writeJson(res, 200, { ok: true })
    }

    /* ---- GET /sessions/<sessionId>/attachments (directory listing + stat) ---- */
    const listMatch = path.match(new RegExp(`^${API_PREFIX}/sessions/([^/]+)/attachments$`))
    if (req.method === 'GET' && listMatch) {
      const sessionId = decodeURIComponent(listMatch[1])
      const workspace = resolveWorkspace(sessionId)
      if (!workspace) {
        return writeError(res, 404, 'FILE_SESSION_NOT_FOUND', 'Session workspace not found.')
      }
      const dir = sessionUploadDir(workspace, sessionId)
      const attachments = []
      for (const n of readdirSyncSafe(dir)) {
        if (n.startsWith('.')) continue
        try {
          const info = await stat(join(dir, n))
          if (!info.isFile()) continue
          attachments.push({
            name: n,
            displayName: n,
            absolutePath: join(dir, n),
            size: info.size,
            createdAt: info.mtime.toISOString(),
          })
        } catch { /* vanished mid-listing */ }
      }
      attachments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      return writeJson(res, 200, { attachments })
    }

    /* ---- GET /attachments/content?sessionId&name ---- */
    if (req.method === 'GET' && path === `${API_PREFIX}/attachments/content`) {
      const sessionId = url.searchParams.get('sessionId') ?? ''
      const name = url.searchParams.get('name') ?? ''
      const workspace = resolveWorkspace(sessionId)
      if (!workspace) {
        return writeError(res, 404, 'FILE_SESSION_NOT_FOUND', 'Session workspace not found.')
      }
      if (!name) return writeError(res, 400, 'FILE_BAD_REQUEST', 'name is required.')
      const dir = normalize(sessionUploadDir(workspace, sessionId))
      const target = normalize(join(dir, name))
      if (target !== dir && !target.startsWith(dir + sep)) {
        return writeError(res, 400, 'FILE_BAD_REQUEST', 'Path escapes the session upload directory.')
      }
      try {
        const info = await stat(target)
        if (!info.isFile()) throw new Error('not a file')
      } catch {
        return writeError(res, 404, 'FILE_NOT_FOUND', 'Attachment file is missing on disk.')
      }
      return sendFile(res, target, name)
    }

    /* ---- DELETE /sessions/<sessionId>/attachments?name= (delete a committed upload) ---- */
    const delMatch = path.match(new RegExp(`^${API_PREFIX}/sessions/([^/]+)/attachments$`))
    if (req.method === 'DELETE' && delMatch) {
      const sessionId = decodeURIComponent(delMatch[1])
      const name = url.searchParams.get('name') ?? ''
      if (!name) return writeError(res, 400, 'FILE_BAD_REQUEST', 'name is required.')
      const workspace = resolveWorkspace(sessionId)
      if (!workspace) {
        return writeError(res, 404, 'FILE_SESSION_NOT_FOUND', 'Session workspace not found.')
      }
      const dir = normalize(sessionUploadDir(workspace, sessionId))
      const target = normalize(join(dir, name))
      if (target !== dir && !target.startsWith(dir + sep)) {
        return writeError(res, 400, 'FILE_BAD_REQUEST', 'Path escapes the session upload directory.')
      }
      await unlink(target).catch(() => {})
      return writeJson(res, 200, { ok: true, name })
    }

    return writeError(res, 404, 'FILE_NOT_FOUND', 'Route not found.')
  }

  context.effect(function* registerUploadFileHost() {
    yield context.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler,
    })
  }, 'dsh-upload-file.host')

  // 按会话注入「上传文件引用约定」到 system prompt：指向本会话自己的子目录，
  // 模型见到 "@UPLOAD: 文件名" 即去该目录读取对应文件（纯文本安全，无 base64）。
  context.inject(['systemPrompt'], (scope) => scope.systemPrompt.context({
    name: 'dsh-upload-file:session-files',
    order: 110,
    text: (assemblyContext) => {
      try {
        const agent = (assemblyContext as unknown as { agent?: unknown })?.agent
        const header = (agent as { session?: { header?: { cwd?: string; id?: string } } } | undefined)?.session?.header
        const cwd = header?.cwd
        const sessionId = header?.id
        if (!cwd || !sessionId || !SESSION_ID_RE.test(String(sessionId))) return ''
        const sessionDir = join(String(cwd), UPLOAD_DIR_NAME, String(sessionId))
        // 本会话目录不存在或无可见文件 → 不注入（保持 system prompt 精简）
        const names = readdirSyncSafe(sessionDir)
        if (!names.some((n) => !n.startsWith('.'))) return ''
        return `本会话的上传文件存放在 ${sessionDir}/ 目录；消息中的 "@UPLOAD: <文件名>" 指该目录下的同名文件（同会话重传同名文件时，文件名会自动带 _1/_2 数字后缀，以目录内实际文件名为准）。`
      } catch {
        return ''
      }
    },
  }), 'dsh-upload-file.system-prompt')
}
