/**
 * dsh-upload-file — host half.
 *
 * Stores files in the session workspace's `.uploaded_files/<sessionId>/`
 * directory (hidden by design). The filesystem IS the registry: no JSON
 * index, no display-name
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
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs'
import { mkdir, rename, rm, stat, unlink } from 'node:fs/promises'
import { basename, join, normalize, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { SessionId } from '@deepseek-ai/dsh-session'

/** Services required before mounting. */
export const inject = ['agents', 'webServer', 'systemPrompt']

const API_PREFIX = '/dsh-upload-file/v1'
/** 隐藏目录：dot 前缀让目录不出现在文件管理器/备份工具的显眼位置 */
const UPLOAD_DIR_NAME = '.uploaded_files'
/** v0.4.0 之前的目录名，用于一次性迁移 */
const LEGACY_UPLOAD_DIR_NAME = 'uploaded_files'
const MAX_FILE_BYTES = 8 * 1024 * 1024 * 1024 // 8 GiB, aligned with local open-file limits
/** Session ids arrive as `session-<uuid>` (persisted) or bare `<uuid>`; the
 *  `session-` prefix is part of the id, not a formatting artifact. */
const SESSION_ID_RE = /^(?:session-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Per-session upload directory: <workspace>/.uploaded_files/<sessionId>.
 *  首次访问时若发现旧版 `uploaded_files/<sessionId>` 存在且新目录不存在，
 *  整体 rename 迁移（同分区原子操作）；新目录已存在则不合并，避免复杂化。 */
function sessionUploadDir(workspace, sessionId) {
  const ws = String(workspace)
  const dir = join(ws, UPLOAD_DIR_NAME, String(sessionId))
  try {
    const legacy = join(ws, LEGACY_UPLOAD_DIR_NAME, String(sessionId))
    if (existsSync(legacy) && !existsSync(dir)) {
      mkdirSync(join(ws, UPLOAD_DIR_NAME), { recursive: true })
      renameSync(legacy, dir)
    }
  } catch { /* 迁移失败不阻塞：新上传走新目录，旧目录留存 */ }
  return dir
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
/* thumbnails（服务端抽帧：图片/视频/PDF → ≤10KB JPEG）                  */
/*                                                                     */
/* 存放：<sessionDir>/.thumbs/<原文件名>.jpg（隐藏目录，列表接口天然跳过） */
/* 原文件名在会话内唯一且永不被覆盖 → 缩略图生成一次即终态，可永久缓存。   */
/* docx/xlsx/pptx 等办公文档：注册表预留（null = 暂不生成，客户端回徽章）。 */
/* ------------------------------------------------------------------ */

const THUMBS_DIR_NAME = '.thumbs'
const THUMB_MAX_BYTES = 10 * 1024
const THUMB_MAX_DIM = 160 // 图标盒 44×36 CSS px，3x 屏 ≈132 物理 px，160 足够

function runCmd(cmd, args, timeoutMs = 30000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err) => resolve(err ? null : true))
  })
}

/** 按扩展名判定可生成缩略图的家族；null = 不支持（客户端回落）。 */
function thumbFamily(name) {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'ogv'].includes(ext)) return 'video'
  if (ext === 'pdf') return 'pdf'
  // svg：矢量图体积小、浏览器原生渲染 → 不生成
  return null
}

/** 生成器注册表：family → 生成函数。null = 预留接口（暂不生成）。 */
const THUMB_GENERATORS = {
  image: genImageOrVideoThumb, // 位图/动图取首帧
  video: genImageOrVideoThumb, // 视频 seek 到 5% 抽一帧
  pdf: genPdfThumb,
  // 办公文档预留——未来接 LibreOffice 无头转 PDF 链路后填入实现：
  word: null,
  excel: null,
  powerpoint: null,
}

async function genImageOrVideoThumb(src, dst, thumbsDir, name) {
  const seek = await videoSeekArgs(src)
  const scaleFilter = `scale='if(gt(iw,ih),${THUMB_MAX_DIM},-2)':'if(gt(iw,ih),-2,${THUMB_MAX_DIM})'`
  for (const q of [4, 6, 9, 13]) {
    await runCmd('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...seek, '-i', src, '-frames:v', '1', '-vf', scaleFilter, '-q:v', String(q), dst])
    let sz = 0
    try { sz = (await stat(dst)).size } catch { /* 无输出 */ }
    if (sz > 0 && (sz <= THUMB_MAX_BYTES || q === 13)) return true
    await rm(dst, { force: true }).catch(() => {})
  }
  return false
}

/** 视频 seek 参数：5% 处（避开片头黑场），上限 60s；ffprobe 失败则不 seek。 */
async function videoSeekArgs(src) {
  try {
    const out = await new Promise((resolve) => {
      execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', src], { timeout: 15000 }, (err, so) => resolve(err ? '' : so))
    })
    const dur = parseFloat(String(out).trim())
    if (Number.isFinite(dur) && dur > 0) {
      return ['-ss', String(Math.min(Math.max(dur * 0.05, 0.05), 60)).toFixed(2)]
    }
  } catch { /* ignore */ }
  return []
}

async function genPdfThumb(src, dst, thumbsDir) {
  const prefix = join(thumbsDir, `gen-${randomUUID()}`)
  let last = null
  try {
    for (const q of [80, 65, 50, 35]) {
      await runCmd('pdftoppm', ['-jpeg', '-jpegopt', `quality=${q}`, '-f', '1', '-l', '1', '-r', '25', src, prefix])
      const base = prefix.split(sep).pop()
      const files = readdirSyncSafe(thumbsDir).filter((f) => f.startsWith(`${base}-`))
      if (files.length > 0) {
        const p = join(thumbsDir, files[0])
        let sz = 0
        try { sz = (await stat(p)).size } catch { /* ignore */ }
        if (sz > 0) {
          last = p
          if (sz <= THUMB_MAX_BYTES) break
          await rm(p, { force: true }).catch(() => {})
        }
      }
    }
    if (!last) return false
    await rename(last, dst)
    // 清掉其余中间页产物（last 已 rename 到 dst，不再匹配前缀，不受影响）
    const base = prefix.split(sep).pop()
    for (const f of readdirSyncSafe(thumbsDir).filter((x) => x.startsWith(`${base}-`))) {
      await rm(join(thumbsDir, f), { force: true }).catch(() => {})
    }
    return true
  } catch {
    return false
  }
}

/** 确保缩略图存在并返回其路径；不支持或失败返回 null。 */
const thumbInFlight = new Map() // dstPath -> Promise<string|null>（并发去重）

function ensureThumbnail(dir, name) {
  const family = thumbFamily(name)
  const gen = family ? THUMB_GENERATORS[family] : undefined
  if (typeof gen !== 'function') return Promise.resolve(null)
  const src = join(dir, name)
  const thumbsDir = join(dir, THUMBS_DIR_NAME)
  const dst = join(thumbsDir, `${name}.jpg`)
  const work = async () => {
    try {
      const info = await stat(dst)
      if (info.isFile() && info.size > 0) return dst // 命中缓存
    } catch { /* 生成 */ }
    await mkdir(thumbsDir, { recursive: true }).catch(() => {})
    const ok = await gen(src, dst, thumbsDir, name)
    if (!ok) {
      await rm(dst, { force: true }).catch(() => {})
      return null
    }
    return dst
  }
  let p = thumbInFlight.get(dst)
  if (!p) {
    p = work().catch(() => null).finally(() => thumbInFlight.delete(dst))
    thumbInFlight.set(dst, p)
  }
  return p
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
      // 尽力预生成缩略图（不阻塞上传响应；失败无碍，取图时懒生成兜底）
      void ensureThumbnail(dir, fileName).catch(() => {})

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
      // mtime 降序：新上传的文件在最顶上
      attachments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
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
      // 连带删除缩略图（若有）
      await unlink(join(dir, THUMBS_DIR_NAME, `${name}.jpg`)).catch(() => {})
      return writeJson(res, 200, { ok: true, name })
    }

    /* ---- GET /attachments/thumbnail?sessionId&name（服务端缩略图，懒生成+永久缓存） ---- */
    if (req.method === 'GET' && path === `${API_PREFIX}/attachments/thumbnail`) {
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
      const thumb = await ensureThumbnail(dir, name)
      if (!thumb) {
        return writeError(res, 404, 'FILE_THUMB_UNSUPPORTED', 'No thumbnail available for this file type.')
      }
      // 缩略图不可变（原文件永不被覆盖）→ 永久缓存
      res.writeHead(200, {
        'content-type': 'image/jpeg',
        'cache-control': 'public, max-age=31536000, immutable',
      })
      pipeline(createReadStream(thumb), res).catch(() => { res.destroy() })
      return
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
