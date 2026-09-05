# dsh-upload-file

[![CI](https://git.6.seeingrain.fun:6443/dsh/dsh-upload-file/actions/workflows/ci.yml/badge.svg)](https://git.6.seeingrain.fun:6443/dsh/dsh-upload-file/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> 🇬🇧 English: [README.en.md](README.en.md)

给 DSH Web 聊天加一个 **📎 文件库**：把文件传进当前会话的私有目录，一行一个动作——**@  引用给模型、↗ 直接打开、🗑️ 删掉**。模型不用你再报路径，上传完自动在输入框插好 `@UPLOAD:` 引用；每个会话的文件互相隔离，重传同名文件自动加后缀，不会互相覆盖。

| 文件库窗口（上传 / 列表 / 行内动作） | 输入区入口（加号旁的回形针） |
| :---: | :---: |
| ![文件库窗口](https://git.6.seeingrain.fun:6443/dsh/dsh-upload-file/media/branch/main/assets/preview-1-library.png) | ![输入区回形针入口](https://git.6.seeingrain.fun:6443/dsh/dsh-upload-file/media/branch/main/assets/preview-2-composer.png) |

## 功能

- 输入区工具行（加号旁）新增 **📎 文件库** 按钮，带角标显示本会话文件数
- 点开弹层：
  - **上传新文件**：文件选择器，支持一次多选
  - 文件列表：类型图标（图片 / 视频 / PDF 显示服务端生成的缩略图——图片取原图、视频取 5% 处帧、PDF 取首页，统一压到 ≤10KB；其余文件显示类型徽章）+ 文件名（最多两行，超出省略）+ 大小，按上传时间降序（最新置顶）；完整路径不显示，可用菜单「复制完整路径」获取
  - 行操作：PC **鼠标右键** / 触摸屏**长按**文件行，弹出操作菜单
- 操作菜单（6 项）：
  - **@ 提及文件**：在输入框插入 `@UPLOAD: 文件名`（上传完成后也会自动插入）
  - **↗ 打开文件**：走 DSH 统一 `workspaces.openPath` 漏斗——装了 Better Sidebar 就进侧栏编辑器打开，没装/禁用则回退 xdg-open 系统默认程序
  - **复制文件名** / **复制完整路径**：复制到剪贴板（经典复制图标）
  - **重新下载**：浏览器原生二次确认后把该文件重新下载回浏览器本地（经典下载图标）
  - **🗑️ 删除文件**：浏览器原生二次确认后直接删除磁盘文件（无回收站，慎用）
- 所有操作成功后有 **toast** 反馈（失败为红色 toast）
- 上传中草稿行（进度条 + 百分比）

## 存储（文件系统即注册表，无 JSON 索引）

- 每个会话一个子目录：`<会话工作区>/.uploaded_files/<sessionId>/`（隐藏目录）
- **文件名就是唯一身份**（无 displayName 间接层）；同会话重传同名文件自动加 `_1`/`_2` 数字后缀，`@UPLOAD:` 引用名 = 目录内实际文件名
- 会话间完全隔离：同名文件在不同会话目录互不冲突
- 列表 = `readdir` + `stat`（按 mtime 降序，最新上传在最顶上）
- system prompt 按会话注入指向本会话目录的约定文本（目录为空时不注入）

## 缩略图（服务端抽帧，图片 / 视频 / PDF）

- 图片（png/jpg/gif/webp/bmp/ico）取原图、视频（mp4/webm/mov/mkv/avi）取 5% 处帧（避开片头黑场，上限 60s）、PDF 取首页，统一缩放到最长边 160px 的 JPEG，质量阶梯递减压到 **≤10KB**
- 存在会话目录的隐藏子目录 `.thumbs/<原文件名>.jpg`；列表接口天然跳过点开头目录，不污染文件库
- 原文件名在会话内唯一且永不被覆盖 → 缩略图生成一次即终态，响应带 `immutable` 长期缓存
- **懒生成 + 并发去重**：首次请求缩略图时按需生成（上传 commit 时也会尽力预生成，失败无碍，取图时兜底）；同一文件并发请求只生成一次
- **降级友好**：依赖系统 `ffmpeg`（图片/视频）与 `pdftoppm`（PDF，poppler）；缺失或失败时该文件回落为原图（图片）或类型徽章（视频/PDF），不影响上传与列表
- 办公文档（docx/xlsx/pptx）在生成器注册表中**预留接口**（当前不生成，回类型徽章），后续接 LibreOffice 无头转 PDF 链路即可启用；SVG 为矢量、体积天然小，浏览器原生渲染，不生成

## 安全

- 上传全程 SHA-256 校验（客户端摘要 → 提交时服务端比对）
- 所有文件路径操作做目录穿越防护（`normalize(join())` 必须仍在本会话目录内）
- `sessionId` 严格校验（UUID 格式），工作区从会话自身 `header.cwd` 解析，不信任客户端传入的路径

## HTTP 接口（前缀 /dsh-upload-file/v1）

- `POST /uploads/prepare` `{sessionId, name, size}` → `{uploadId, putUrl, commitUrl, deleteUrl}`
- `PUT /uploads/<id>` 流式上传（application/octet-stream，inline sha256）
- `POST /uploads/<id>/commit` `{expectedSha256}` → `{name, displayName, absolutePath, size, createdAt}`
- `DELETE /uploads/<id>` 取消（已 commit 的 id 返回 404，客户端吞掉）
- `GET /sessions/<sessionId>/attachments` 目录列表
- `GET /attachments/content?sessionId&name` 下载 / 打开（防路径穿越）
- `GET /attachments/thumbnail?sessionId&name` 服务端缩略图（懒生成，`image/jpeg` + `immutable` 缓存；不支持的类型 404，客户端回落）
- `DELETE /sessions/<sessionId>/attachments?name=` 删除已提交文件（连带删除缩略图）

## 构建

```bash
pnpm install
pnpm run build
```

## 安装

```sh
dsh plugin --profile web add https://git.6.seeingrain.fun:6443/dsh/dsh-upload-file
# host 半边需要重启 web；client 半边下次刷新页面即加载
```

本地开发链接方式：在 `profiles/web/package.json` 的 dependencies 里加
`"dsh-upload-file": "link:<本仓库路径>"`，并在 bundles 列表追加 `dsh-upload-file`，然后 `pnpm install`。

## License

MIT — 见 [LICENSE](LICENSE)。
