---
name: douyin-work-analyzer
description: 分析一个公开可见的抖音作品页面，读取已登录 Easy WebBridge 浏览器中的页面文本和可见元数据，输出 Markdown 与 JSON 作品分析报告。Use when a user gives a Douyin work URL and wants to understand its hook, topic, structure, visible metrics, strengths, weaknesses, or reusable ideas. Requires an authorized Easy WebBridge browser; never batch-crawls, bypasses login, comments, publishes, or accesses non-public data.
---

# 抖音作品分析

使用这个 Skill 分析**一个**抖音作品页面。它把当前页面能看到的标题、作者、文案、话题和互动数字整理成一份可复查的报告，并明确哪些结论只是根据可见文本推断。

## 运行方式

脚本只依赖 Node.js 20+，不需要安装依赖。先确认 Easy WebBridge 已运行且目标浏览器扩展显示已连接：

```bash
node scripts/douyin-work-analyzer.mjs \
  analyze \
  --url "https://www.douyin.com/video/作品ID" \
  --browserId "浏览器ID" \
  --output "./reports/作品ID"
```

参数：

- `--url`：一个抖音作品 URL。只接受 `douyin.com` 及其子域名。
- `--browserId`：要使用的 Easy WebBridge 浏览器 ID。省略时仅在只有一个在线浏览器时自动选择。
- `--output`：报告目录，默认 `./douyin-work-analysis`。
- `--tabId`：可选；使用已打开的目标标签页，不再新开页面。未提供时脚本会创建一个任务专属标签组。
- `--keep-tab`：可选；分析结束后保留本次创建的标签组。默认会关闭本次创建的组，不影响用户原有标签页。
- `--wait-ms`：导航后等待页面渲染的毫秒数，默认 1500，范围 300～10000。

成功后目录内只有两份交付文件：

```text
douyin-work-analysis.json   # 结构化数据、证据、推断和限制
douyin-work-analysis.md     # 人可直接阅读的报告
```

真实运行前，脚本会检查 `GET /health`、读取在线浏览器并使用 `Authorization: Bearer ...` 调用本机 API。Token 读取顺序为 `EASY_WEBBRIDGE_TOKEN`、`EASY_WEBBRIDGE_TOKEN_FILE`，最后是 `~/.easy-webbridge/bridge-token`；Token 永远不会写入报告或日志。默认 API 地址为 `http://127.0.0.1:17777`，可用 `EASY_WEBBRIDGE_URL` 覆盖。

## 固定流程

1. 校验 URL、输出目录和等待时间。
2. 检查 Easy WebBridge 健康状态和 Token；列出在线浏览器，精确选择 `browserId`。
3. 未指定 `tabId` 时，以 `douyin-work-analyzer-<run-id>` 创建一个任务标签组并打开 URL；连续步骤复用同一标签页。
4. 只读取一次页面快照（标题、URL、可见正文和交互元素），不点击、不填写、不上传、不执行页面脚本。
5. 从快照中抽取字段并标注证据来源；无法确认的字段写 `null` 或空数组，不猜测。
6. 写出 JSON 和 Markdown；在 `finally` 中关闭本次创建的标签组，除非用户明确传入 `--keep-tab`。

报告中的分析包括：开头钩子、主题、可见内容结构、可见互动指标、亮点、问题、可借鉴方向和限制。视频画面节奏、镜头、音乐、语气、完整字幕等不在页面快照中时，报告会明确写“未从当前页面确认”。

## 无浏览器自测

用固定快照检查解析和文件输出，不需要 Token 或登录态：

```bash
node scripts/douyin-work-analyzer.mjs self-test
```

也可以直接提供自己的快照：

```bash
node scripts/douyin-work-analyzer.mjs analyze \
  --mock ./fixtures/sample-snapshot.json \
  --output ./reports/mock
```

`--mock` 只用于开发和验收，不能当作真实抖音数据来源。快照格式为 `{title, url, text, interactive}`，也接受 Easy WebBridge 返回的 `{result: {...}}` 包装格式。

## 约束

- 只分析用户指定的一个作品和当前页面公开可见内容；不批量爬取、轮询、抓取推荐流或建立作者数据库。
- 不绕过登录、验证码、风控、访问控制或付费限制；遇到登录页、验证码或权限提示立即停止并说明原因。
- 不读取 Cookie、Local Storage、网络请求正文或非公开接口；不把 Token、Cookie、账号信息、`browserId`、session 名称写进报告。
- 不点赞、不评论、不关注、不私信、不收藏、不发布、不修改账号资料、不下载作品，也不执行其他副作用操作。
- 页面上的互动数是当前快照中的可见值，不等于官方榜单、历史趋势或真实性背书；报告必须带采集时间和原始页面 URL。
- Easy WebBridge 是运行前置条件；本 Skill 不复制扩展、不启动新浏览器、不要求用户重复登录。登录和浏览器授权由用户负责。

## 故障处理

- `Bridge 不可达`：启动 Easy WebBridge 后重试，不要改用未经授权的远程服务。
- `401 Unauthorized`：检查本机 Token 或扩展配对，不要把 Token 粘贴到报告或聊天记录。
- `没有在线浏览器`：打开已授权的 Chromium 浏览器并确认扩展状态。
- `browserId 不明确`：传入准确的 `--browserId`，不要向多个浏览器广播命令。
- `页面要求登录/验证码`：停止，要求用户在目标浏览器中完成合法登录或验证。
- `快照字段为空`：保留空值和限制说明；不要用搜索引擎摘要或猜测补齐。

## 资源

- `manifest.yaml`：跨 Agent/SkillHub 元数据。
- `agents/openai.yaml`：界面名称和默认提示。
- `scripts/douyin-work-analyzer.mjs`：API 调用、解析、报告生成和自测实现。
