# 来源与改动记录

本试点没有复制第三方仓库代码。页面读取和报告生成逻辑按 Easy WebBridge 的公开业务 Skill 接口重新实现，浏览器传输协议来源于公开的 [Easy WebBridge](https://github.com/xxjrq/easy-webbridge) 仓库（MIT）。

实际新增内容：

- 只选择一个在线 `browserId`，并为本次运行创建独立标签组。
- 只调用 `snapshot` 读取当前页面公开可见文本，不读取 Cookie、Local Storage 或网络正文。
- 增加抖音 URL 校验、登录/验证码停止条件、可见指标换算和 Markdown/JSON 双格式报告。
- 增加 `--mock` 与 `self-test`，让没有浏览器时也能验收解析和敏感字段清理。

这不是抖音官方 API，也不代表官方评价或历史趋势。报告里的互动数字只记录采集时刻页面显示值。
