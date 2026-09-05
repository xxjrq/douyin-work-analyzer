# 抖音作品分析

在用户已经合法登录、授权并连接 Easy WebBridge 的 Chromium 浏览器中，对一个明确指定的抖音公开作品页面执行一次只读快照，提取页面可见事实并生成 Markdown 与 JSON 报告。

## 前置条件

- Node.js `>=20`，无第三方运行时依赖。
- 已安装并启动 Easy WebBridge，默认地址为 `http://127.0.0.1:17777`。
- 浏览器已合法登录抖音并连接 Bridge；本工具不会绕过登录、验证码、风控、地区或访问控制。
- 访问凭证读取顺序：`EASY_WEBBRIDGE_TOKEN`、`EASY_WEBBRIDGE_TOKEN_FILE`、`~/.easy-webbridge/bridge-token`。

## 快速开始

```bash
npm test

node scripts/douyin-work-analyzer.mjs analyze \
  --url "https://www.douyin.com/video/7677916780626595113" \
  --browserId "<online-browser-id>" \
  --output "./reports/7677916780626595113"
```

只有一个在线浏览器时可省略 `--browserId`。提供 `--tabId` 后只读取用户已有标签页，不新建页面。默认等待 `1500ms`，可用 `--wait-ms` 设置 `300`～`10000`。

URL 必须是 `/video/<作品ID>` 或 `/note/<作品ID>` 形式的单作品页面。抖音首页、搜索页、推荐页、短链和其他路径会以用法错误退出码 `2` 被拒绝。CLI 只接受文档列出的参数；例如 `--foo`、`--browser` 不会被忽略或兼容。

## 离线样例

```bash
node scripts/douyin-work-analyzer.mjs analyze \
  --mock "./fixtures/sample-snapshot.json" \
  --output "./reports/mock-success"
```

`sample-snapshot.json` 是虚构样例，只证明本地解析和报告生成，不是指定作品的真实证据。

失败样例：

```bash
node scripts/douyin-work-analyzer.mjs analyze --mock ./fixtures/failure-login-gate.json --output /tmp/douyin-login-failure
node scripts/douyin-work-analyzer.mjs analyze --mock ./fixtures/failure-empty-snapshot.json --output /tmp/douyin-empty-failure
```

登录/验证码门禁、空快照、非法 URL、非抖音跳转、Bridge 不可达或多浏览器歧义都会明确失败，不生成成功报告。用法错误退出码为 `2`，运行或解析错误为 `1`，成功为 `0`。

解析不会固定读取快照前 40 行。脚本先核对输入与快照的作品 ID，再使用作品 ID、页面标题、同作品交互节点、可见话题组合或“发布时间”附近的作品详情簇建立身份锚点，并在评论区、搜索推荐或推荐流分隔符处截断；无法建立目标作品边界时直接失败，避免把页面外壳或推荐内容写入事实字段。评论区单独出现“请先登录后发表评论”不会被误判为整页登录墙。

作者只接受目标作品区域内明确的“作者/创作者/发布者”标签或 `@作者` 文本，不读取全局第一个 `/user/` 链接。页面“总结”“章节要点”等辅助摘要不属于原作品文案，也不会用于生成开头钩子。

## 输出

每次成功只生成两份核心报告：

- `douyin-work-analysis.md`：中文可复核报告，包含来源、采集时间、可见信息、互动、分析、证据和限制。
- `douyin-work-analysis.json`：结构化报告，事实位于 `source`/`work`，推断位于 `analysis`，复核文本位于 `evidence`。

页面未显示的字段保持 `null` 或空数组。“万/亿”会换算为整数，并在提取说明中标记为页面显示值换算，不代表官方精确历史数据。

## 能力边界

- 只处理一个作品 URL，不批量采集账号、评论列表、推荐流或历史趋势。
- 只调用健康检查、浏览器枚举、导航、一次快照和任务 session 清理。
- 不读取 Cookie、Local Storage、网络请求正文、账号凭证或非公开接口。
- 不点击、填写、执行页面脚本、点赞、评论、关注、收藏、私信、发布或下载作品。
- 页面快照不能证明视频镜头、剪辑节奏、配乐、语气或完整字幕；未出现的信息必须标记为未确认。

## 真实验收与发布状态

指定验收 URL 为 `https://www.douyin.com/video/7677916780626595113`。真实运行必须在用户授权浏览器中成功并生成双报告。`humanReview.enabled=true` 时，人工在同一采集时点核对事实字段；`humanReview.enabled=false` 时，每个非空事实字段必须能由报告保留的最小快照或截图证据独立核对，无法追溯的字段保持 `null`/空数组。若作品删除、转私密、地区不可见或触发门禁，应记录真实失败，不能用 mock、搜索摘要或推断替代。

`acceptance/real-run-2026-09-05.md` 保存了本轮脱敏真实验收记录。指定 URL 在精确选择的授权浏览器中退出码为 `0`，两份报告位于 `acceptance/real-run-2026-09-05/`；记录按 `humanReview.enabled=false` 使用报告内最小页面证据核对页面 URL、标题和话题。由于保留证据不能独立证明作者和作品文案，这两个字段保持 `null`，章节“总结”也未被当作作品文案或钩子。另一个受登录/验证门禁影响的浏览器仍按失败处理。

截至 `2026-09-05`，SkillHub 状态为 `submitted`，只表示已提交/待审核，不表示已审核、已上架、公开可安装或发布完成。未经刷新远端证据也不声称 GitHub 已同步。

## 图标与许可证

图标位于 `assets/icon-512.png`，为程序化生成的 512×512 PNG，不使用抖音官方商标或第三方素材。项目采用 MIT License，详见 `LICENSE`。

English documentation: `README.en.md`.
