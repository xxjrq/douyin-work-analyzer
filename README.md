# 抖音作品分析

给一个抖音作品链接，读取你已登录浏览器里当前页面能看到的标题、作者、文案、话题和互动数字，生成一份 Markdown 报告和一份 JSON 数据。适合做选题研究、内容拆解和创作复盘。

## 运行前准备

1. 安装并启动 [Easy WebBridge](https://github.com/xxjrq/easy-webbridge)。
2. 在 Chrome、Edge 或其他 Chromium 浏览器加载它的 `extension/` 文件夹。
3. 在目标浏览器登录抖音，并确认扩展显示已连接。

## 使用

```bash
npm test
node scripts/douyin-work-analyzer.mjs analyze \
  --url "https://www.douyin.com/video/作品ID" \
  --browserId "在线浏览器ID" \
  --output "./reports/作品ID"
```

运行完成后，输出目录里有：

- `douyin-work-analysis.md`：人可以直接阅读的分析报告。
- `douyin-work-analysis.json`：方便后续程序继续处理的数据。

只有一个在线浏览器时可以省略 `--browserId`。没有浏览器时可运行 `npm test` 或使用脚本的 `--mock` 做本地验收；mock 内容不代表真实抖音数据。

## 边界

只分析一个作品的公开可见页面，不批量爬取，不绕过登录、验证码或访问控制，不读取 Cookie/Local Storage，不点赞、评论、关注、私信、收藏、发布或下载作品。互动数字只是采集时刻的页面显示值，不是官方榜单或历史趋势。

## 兼容环境

本 Skill 遵循 Agent Skills 约定，可被 Claude、Codex、OpenCode、WorkBuddy 等兼容 Agent 使用。Easy WebBridge 是独立运行前提，不需要把作者电脑上的路径复制到你的环境。
