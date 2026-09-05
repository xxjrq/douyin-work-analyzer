---
name: douyin-work-analyzer
description: 对用户明确指定的单个抖音公开作品页面执行只读可见页面分析，提取标题、作品文案、作者、话题标签和可见互动信息，并导出 Markdown 与 JSON 报告。Use when the user asks for 抖音作品分析、分析抖音视频、分析这个抖音链接、抖音内容拆解、抖音视频结构、抖音开头钩子、抖音作品文案分析、抖音作者和话题提取、导出抖音作品 Markdown 或 JSON 报告、Douyin work analysis, or to analyze a Douyin video page. Requires a legally authorized Easy WebBridge browser; never batch collect accounts, scrape comment lists, download videos, bypass verification, or access non-public data.
---

# 抖音作品分析

## 适用范围

仅分析用户明确指定的一个 `douyin.com` 作品 URL。通过用户已合法登录、授权并连接 Easy WebBridge 的 Chromium 浏览器读取一次可见页面快照，生成：

- `douyin-work-analysis.md`
- `douyin-work-analysis.json`

事实字段只来自采集时刻的可见页面证据。无法确认时使用 `null`、空数组或限制说明，不用搜索摘要或模型猜测补齐。

## 执行流程

1. 确认输入是单个抖音作品 URL；仅接受 `/video/<作品ID>` 或 `/note/<作品ID>`，拒绝首页、搜索页、推荐页和短链，并确认用户有权访问当前浏览器页面。
2. 优先复用用户提供的 `tabId`；未提供时创建任务独立 session 和新标签页。
3. 依次执行 Bridge 健康检查、在线浏览器选择、导航、等待和一次 `snapshot`。
4. 检测登录墙、验证码、安全验证、空快照和非抖音跳转；命中后立即失败，不降级猜测。
5. 用输入作品 ID、快照实际 URL、页面标题、同作品交互节点、可见话题组合或“发布时间”附近的作品详情簇建立身份锚点；无法建立边界时停止，不从快照前若干行猜测。只在锚点附近且评论区、搜索推荐或推荐流分隔符以内提取事实。作者只接受该区域中的明确“作者/创作者/发布者”标签或 `@作者` 文本，不从全局 `/user/` 链接猜测；“总结”“章节要点”等页面辅助摘要不属于作品文案，也不得用于生成开头钩子。评论区单独出现登录提示不等于整页门禁。
6. 将事实、证据、推断和限制分区写入两份报告。
7. 在 `finally` 中关闭本次创建的 session；`--keep-tab` 除外。不得关闭用户原有标签页。

## 命令

真实运行：

```bash
node scripts/douyin-work-analyzer.mjs analyze \
  --url "https://www.douyin.com/video/7677916780626595113" \
  --browserId "<online-browser-id>" \
  --output "./reports/7677916780626595113"
```

本地成功样例：

```bash
node scripts/douyin-work-analyzer.mjs analyze \
  --mock "./fixtures/sample-snapshot.json" \
  --output "./reports/mock-success"
```

失败样例：

```bash
node scripts/douyin-work-analyzer.mjs analyze --mock ./fixtures/failure-login-gate.json --output /tmp/douyin-login-failure
node scripts/douyin-work-analyzer.mjs analyze --mock ./fixtures/failure-empty-snapshot.json --output /tmp/douyin-empty-failure
```

固定自测：

```bash
npm test
```

## 输入和错误契约

- 命令：`analyze`、`self-test`、`help`。
- 参数：`--url`、`--browserId`/`--browser-id`、`--tabId`/`--tab-id`、`--output`、`--wait-ms`、`--keep-tab`、`--mock`、`--help`/`-h`。
- 未声明参数（包括 `--browser`）必须以退出码 `2` 拒绝，不能静默接受。
- `waitMs` 范围为 `300`～`10000`，默认 `1500`。
- 用法错误退出码 `2`；运行、解析或 Bridge 错误退出码 `1`；成功退出码 `0`。
- 成功 stdout 为机器可读 JSON；失败 stderr 必须可行动，且不得写入访问凭证、Cookie、浏览器标识、session 名称或桥接敏感正文。
- 多个在线浏览器且未精确选择时必须停止，不广播命令。

## 严格边界

不得读取 Cookie、Local Storage、网络请求正文、账号凭证或非公开接口；不得点击、填写、执行页面脚本、点赞、评论、关注、收藏、私信、发布、下载作品或修改账号状态。不得批量采集账号、抓取评论列表、轮询推荐流、建立作者数据库或生成历史趋势。

页面互动数字只代表采集时刻的显示值；“万/亿”换算不是官方精确历史数据。页面快照不能证明视频镜头、剪辑、配乐、语气或完整字幕。

## 验收与发布表述

`fixtures/sample-snapshot.json` 是虚构开发样例，不能证明指定真实作品分析成功。真实验收必须命令退出码为 `0` 且生成双报告，并按验收配置核对：`humanReview.enabled=true` 时，由人工对照同一采集时点页面；`humanReview.enabled=false` 时，每个非空事实字段必须能由报告保留的最小快照或截图证据独立核对，无法独立追溯的作者、作品文案或互动字段必须保持 `null`/空数组。两种模式都不能用 mock、搜索摘要或推断替代真实页面证据。

当前 SkillHub 状态为 `submitted`，准确表述是“已提交/待审核”，不能表述为已审核、已上架、公开可安装或发布完成。未经当前远端证据也不得声称 GitHub 已同步。
