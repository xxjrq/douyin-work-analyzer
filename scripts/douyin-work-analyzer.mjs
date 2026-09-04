#!/usr/bin/env node

import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:17777";
const DEFAULT_OUTPUT = "douyin-work-analysis";
const MAX_SNAPSHOT_TEXT = 100_000;

const HELP = `抖音作品分析

用法:
  node scripts/douyin-work-analyzer.mjs analyze --url <抖音作品URL> [选项]
  node scripts/douyin-work-analyzer.mjs self-test

选项:
  --browserId <id>    Easy WebBridge 浏览器 ID；只有一个在线浏览器时可省略
  --output <目录>    输出目录，默认 ./douyin-work-analysis
  --tabId <id>       使用已经打开的标签页，不新开页面
  --wait-ms <毫秒>   导航后等待时间，默认 1500（300-10000）
  --keep-tab         不关闭本次创建的任务标签组
  --mock <文件>      使用本地快照，仅用于测试，不访问 Bridge
  --help             显示帮助

环境变量:
  EASY_WEBBRIDGE_URL        默认 http://127.0.0.1:17777
  EASY_WEBBRIDGE_TOKEN      直接提供本机 Token（不会写入报告）
  EASY_WEBBRIDGE_TOKEN_FILE Token 文件路径，默认 ~/.easy-webbridge/bridge-token
`;

class UsageError extends Error {}

function parseArgs(argv) {
  const first = argv[0] && !argv[0].startsWith("-") ? argv.shift() : "analyze";
  const options = { command: first };
  const aliases = { "browser-id": "browserId", browser: "browserId", "tab-id": "tabId", output: "output", url: "url", mock: "mock", "wait-ms": "waitMs" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { command: "help" };
    if (arg === "--keep-tab") {
      options.keepTab = true;
      continue;
    }
    if (!arg.startsWith("--")) throw new UsageError(`无法识别参数: ${arg}`);
    const key = aliases[arg.slice(2)] || arg.slice(2);
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new UsageError(`参数 --${arg.slice(2)} 需要一个值`);
    options[key] = value;
  }
  return options;
}

function assertDouyinUrl(value, label = "URL") {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new UsageError(`${label} 不是有效网址`);
  }
  const hostname = url.hostname.toLowerCase();
  if (!/^([a-z0-9-]+\.)*douyin\.com$/.test(hostname)) {
    throw new UsageError(`${label} 必须是 douyin.com 页面`);
  }
  if (!/^https?:$/.test(url.protocol)) throw new UsageError(`${label} 必须使用 http 或 https`);
  return url.toString();
}

function toWaitMs(value) {
  const waitMs = value == null ? 1500 : Number(value);
  if (!Number.isInteger(waitMs) || waitMs < 300 || waitMs > 10_000) {
    throw new UsageError("--wait-ms 必须是 300 到 10000 之间的整数");
  }
  return waitMs;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function readBridgeToken() {
  if (process.env.EASY_WEBBRIDGE_TOKEN?.trim()) return process.env.EASY_WEBBRIDGE_TOKEN.trim();
  const tokenPath = process.env.EASY_WEBBRIDGE_TOKEN_FILE?.trim() || join(homedir(), ".easy-webbridge", "bridge-token");
  try {
    const token = (await readFile(tokenPath, "utf8")).trim();
    if (!token) throw new Error("empty token");
    return token;
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw new Error(`无法读取 Easy WebBridge Token 文件: ${tokenPath}`);
  }
}

function safeErrorMessage(error) {
  return String(error?.message || error)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer <redacted>")
    .replace(/(token|authorization)[=:]\s*[^\s,;]+/gi, "$1=<redacted>");
}

async function bridgeRequest(baseUrl, path, { token = "", method = "GET", body, timeoutMs = 20_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      if (response.status === 401) throw new Error("Easy WebBridge Token 无效（401 Unauthorized）");
      if (response.status === 404) throw new Error(`Easy WebBridge API 路径不存在: ${path}`);
      throw new Error(payload?.error || `Easy WebBridge 请求失败（HTTP ${response.status}）`);
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`Easy WebBridge 请求超时: ${path}`);
    if (error instanceof TypeError) throw new Error(`无法连接 Easy WebBridge（${baseUrl}）。请先启动本机服务。`);
    throw new Error(safeErrorMessage(error));
  } finally {
    clearTimeout(timer);
  }
}

async function bridgeCommand(baseUrl, token, browserId, action, args) {
  const path = `/v1/browsers/${encodeURIComponent(browserId)}/commands`;
  const payload = await bridgeRequest(baseUrl, path, {
    token,
    method: "POST",
    body: { action, args, timeoutMs: 20_000 },
  });
  return payload?.result ?? payload;
}

function normalizeSnapshot(payload) {
  let snapshot = payload;
  if (snapshot?.result && typeof snapshot.result === "object") snapshot = snapshot.result;
  if (!snapshot || typeof snapshot !== "object") throw new Error("页面快照为空或格式不正确");
  const text = typeof snapshot.text === "string" ? snapshot.text : "";
  const title = typeof snapshot.title === "string" ? snapshot.title.trim() : "";
  const url = typeof snapshot.url === "string" ? snapshot.url.trim() : "";
  const interactive = Array.isArray(snapshot.interactive) ? snapshot.interactive : [];
  if (!text && !title) throw new Error("页面快照没有可见标题或正文");
  return { title, url, text: text.slice(0, MAX_SNAPSHOT_TEXT), interactive };
}

function meaningfulLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/[\u200b\ufeff]/g, "").replace(/\s+/g, " ").trim())
    .filter((line) => line && !/^(登录|注册|首页|推荐|朋友|消息|我|分享|返回|更多|充钻石|通知|投稿|综合|视频|用户|直播|多列|单列|筛选|客户端|壁纸)$/.test(line))
    .filter((line) => !/^20\d{2} © 抖音$/.test(line))
    .filter((line) => !/(?:ICP备|京公网安备|许可证|营业执照|备案|人服证|举报|服务协议|隐私政策|账号找回|联系我们|加入我们|友情链接|站点地图)/.test(line));
}

function detectAccessGate(text) {
  const value = String(text || "");
  const patterns = [
    /请先登录/,
    /登录后(?:观看|查看|继续)/,
    /安全验证/,
    /验证码/,
    /访问受限/,
    /风险提示.*验证/,
  ];
  return patterns.find((pattern) => pattern.test(value))?.source || null;
}

function visibleAuthor(snapshot, lines) {
  const authorLine = lines.find((line) => /^(作者|创作者|发布者)\s*[:：]/.test(line));
  if (authorLine) return authorLine.replace(/^(作者|创作者|发布者)\s*[:：]\s*/, "").trim() || null;
  const atLine = lines.find((line) => /^@[\p{L}\p{N}_-]{1,80}/u.test(line));
  if (atLine) return atLine.replace(/^@/, "").trim() || null;
  const link = snapshot.interactive.find((item) => item?.visible !== false && /\/user\/(?!self(?:[/?#]|$))/.test(String(item.href || "")) && String(item.text || "").trim());
  return link ? String(link.text).trim().slice(0, 120) : null;
}

function visibleDescription(lines, title, author, { skip = [] } = {}) {
  const ignored = new Set([title, author].filter(Boolean));
  for (const item of skip) if (item) ignored.add(item);
  const candidates = lines.filter((line) => {
    if (ignored.has(line)) return false;
    if (/^(作者|创作者|发布者)\s*[:：]/.test(line)) return false;
    if (/^(点赞|评论|收藏|分享)\s*[:：]?\s*[\d,.]+/.test(line)) return false;
    if (/(?:ICP备|京公网安备|许可证|营业执照|备案|人服证|举报|服务协议|隐私政策|账号找回|联系我们|加入我们|友情链接|站点地图)/.test(line)) return false;
    if (/^(?:#[\p{L}\p{N}_-]+\s*)+$/u.test(line)) return false;
    return line.length >= 8;
  });
  return candidates[0]?.slice(0, 600) || null;
}

function parseCount(value) {
  const normalized = String(value).replace(/,/g, "").replace(/\s/g, "");
  const match = normalized.match(/([\d.]+)(万|亿)?/);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  const multiplier = match[2] === "亿" ? 100_000_000 : match[2] === "万" ? 10_000 : 1;
  return Math.round(number * multiplier);
}

function visibleMetrics(text) {
  const metrics = {};
  for (const label of ["点赞", "评论", "收藏", "分享"]) {
    const pattern = new RegExp(`${label}\\s*[:：]?\\s*([\\d,.]+(?:万|亿)?)`);
    const match = String(text).match(pattern);
    metrics[label] = match ? parseCount(match[1]) : null;
  }
  return metrics;
}

function extractHashtags(text) {
  return [...new Set(String(text).match(/#[\p{L}\p{N}_-]{1,40}/gu) || [])].slice(0, 30);
}

function classifyHook(text) {
  if (!text) return "未能从可见文本确认";
  if (/[？?]/.test(text)) return "提问式";
  if (/(一招|只需|教你|方法|教程|效果|结果|直接)/.test(text)) return "结果或方法式";
  if (/(但是|却|没想到|原来|竟然|从不|别再)/.test(text)) return "反差或悬念式";
  return "直接陈述式";
}

function buildReport(snapshot, sourceUrl, capturedAt = new Date().toISOString()) {
  const lines = meaningfulLines(snapshot.text);
  const title = snapshot.title && !/^抖音/.test(snapshot.title) ? snapshot.title.slice(0, 240) : lines[0]?.slice(0, 240) || null;
  const author = visibleAuthor(snapshot, lines);
  const description = visibleDescription(lines, title, author);
  // Keep extraction near the page identity. A Douyin detail page can append a
  // recommendation feed and footer to the same DOM snapshot.
  const contentText = [snapshot.title, ...lines.slice(0, 40)].filter(Boolean).join("\n");
  const hashtags = extractHashtags(contentText);
  const metrics = visibleMetrics(lines.slice(0, 40).join("\n"));
  const hookText = description || title;
  const topic = hashtags.length ? hashtags.slice(0, 5).join("、") : (description ? description.slice(0, 48) : null);
  const metricEvidence = lines.filter((line) => /(点赞|评论|收藏|分享)/.test(line)).slice(0, 8);
  const evidenceLines = lines.slice(0, 12);
  const bodyEvidence = visibleDescription(lines, title, author, { skip: [description] });
  const strengths = [];
  if (hookText) strengths.push(`开头有可识别的${classifyHook(hookText)}表达`);
  if (hashtags.length) strengths.push(`页面展示了 ${hashtags.length} 个话题标签，可用于归纳内容方向`);
  if (Object.values(metrics).some((value) => value !== null)) strengths.push("页面显示了部分互动指标，可作为当前页面的观察记录");
  if (!strengths.length) strengths.push("当前快照没有足够可见信息，暂不评价内容优劣");
  const issues = [];
  if (!description) issues.push("没有从快照中识别到足够长的作品文案");
  if (!hashtags.length) issues.push("当前页面没有识别到 #话题标签");
  issues.push("未从页面快照确认视频镜头、剪辑节奏、配乐和完整字幕");
  const reusableIdeas = [];
  if (hookText) reusableIdeas.push(`保留“${hookText.slice(0, 36)}${hookText.length > 36 ? "…" : ""}”这种开头表达，再用自己的事实和案例重写`);
  if (hashtags.length) reusableIdeas.push(`围绕 ${hashtags.slice(0, 3).join("、")} 设计同主题选题，不直接复制原作内容`);
  reusableIdeas.push("先用 1 个明确问题或结果承诺抓住注意力，再在主体给出可验证的信息");

  return {
    schemaVersion: "1.0",
    kind: "douyin-work-analysis",
    source: {
      url: sourceUrl,
      pageUrl: snapshot.url || sourceUrl,
      pageTitle: snapshot.title || null,
      capturedAt,
      method: "Easy WebBridge visible page snapshot",
    },
    work: {
      title,
      author,
      description,
      hashtags,
      visibleMetrics: metrics,
    },
    analysis: {
      hook: { text: hookText, type: classifyHook(hookText) },
      topic,
      structure: [
        { section: "开头钩子", evidence: hookText, confidence: hookText ? "medium" : "low" },
        { section: "主体信息", evidence: bodyEvidence, confidence: bodyEvidence ? "low" : "none" },
        { section: "结尾行动", evidence: lines.find((line) => /(关注|收藏|评论区|下集|点赞)/.test(line)) || null, confidence: "low" },
      ],
      strengths,
      issues,
      reusableIdeas,
    },
    evidence: {
      visibleTextSample: evidenceLines,
      metricLines: metricEvidence,
      extractionNotes: [
        "字段只来自当前页面快照；空值表示未在可见内容中确认。",
        "互动数字按页面显示值换算为整数，仅代表采集时刻的可见记录。",
      ],
    },
    limitations: [
      "这是单个页面的点时快照，不是官方榜单、历史趋势或真实性证明。",
      "页面快照不能证明视频画面、镜头节奏、音乐、语气或完整字幕。",
      "不抓取推荐流、不批量爬取、不读取 Cookie、Local Storage、网络正文或非公开数据。",
    ],
  };
}

function md(value) {
  return String(value ?? "未识别").replace(/\r?\n/g, " ").trim() || "未识别";
}

function reportMarkdown(report) {
  const { source, work, analysis, evidence, limitations } = report;
  const metricRows = Object.entries(work.visibleMetrics).map(([label, value]) => `| ${label} | ${value == null ? "未显示" : value.toLocaleString("zh-CN")} |`).join("\n");
  const structure = analysis.structure.map((item) => `- **${item.section}**（${item.confidence}）：${md(item.evidence)}`).join("\n");
  const list = (items) => items.map((item) => `- ${md(item)}`).join("\n");
  const evidenceText = evidence.visibleTextSample.length ? evidence.visibleTextSample.map((line) => `> ${md(line)}`).join("\n") : "> 未读取到可见正文";
  return `# 抖音作品分析报告

## 来源

- 页面：${source.url}
- 页面标题：${md(source.pageTitle)}
- 采集时间：${source.capturedAt}
- 读取方式：${source.method}

## 作品信息

- 标题：${md(work.title)}
- 作者：${md(work.author)}
- 文案：${md(work.description)}
- 话题：${work.hashtags.length ? work.hashtags.join(" ") : "未识别"}

## 可见互动指标

| 指标 | 页面显示值（换算后） |
| --- | ---: |
${metricRows}

## 内容分析

- 开头钩子：${md(analysis.hook.text)}
- 钩子类型：${md(analysis.hook.type)}
- 主题线索：${md(analysis.topic)}

### 结构（基于可见文本推断）

${structure}

### 亮点

${list(analysis.strengths)}

### 需要注意

${list(analysis.issues)}

### 可借鉴方向

${list(analysis.reusableIdeas)}

## 页面证据摘录

${evidenceText}

## 限制

${list(limitations)}

> 本报告只分析一个作品当前页面公开可见的信息，不代表抖音官方评价，也不执行点赞、评论、关注、收藏、发布或其他账号操作。
`;
}

async function writeReports(report, outputDir) {
  const directory = resolve(outputDir || DEFAULT_OUTPUT);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "douyin-work-analysis.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(join(directory, "douyin-work-analysis.md"), reportMarkdown(report), "utf8");
  return directory;
}

function chooseBrowser(browsers, requestedId) {
  const online = browsers.filter((browser) => browser && browser.online);
  if (!online.length) throw new Error("Easy WebBridge 没有在线浏览器；请打开已授权浏览器并确认扩展已连接");
  if (requestedId) {
    const selected = online.find((browser) => String(browser.browserId) === String(requestedId));
    if (!selected) throw new Error(`找不到在线 browserId: ${requestedId}`);
    return selected;
  }
  if (online.length !== 1) {
    const choices = online.map((browser) => `${browser.displayName || "未命名"} (${browser.browserId})`).join("、");
    throw new Error(`在线浏览器不止一个，请传入 --browserId。可选: ${choices}`);
  }
  return online[0];
}

async function runLive(options) {
  if (!options.url) throw new UsageError("真实运行必须提供 --url");
  const sourceUrl = assertDouyinUrl(options.url);
  const baseUrl = process.env.EASY_WEBBRIDGE_URL?.trim() || DEFAULT_BRIDGE_URL;
  const token = await readBridgeToken();
  if (!token) throw new Error("未找到 Easy WebBridge Token；请设置 EASY_WEBBRIDGE_TOKEN 或 ~/.easy-webbridge/bridge-token");
  try {
    await bridgeRequest(baseUrl, "/health");
  } catch (error) {
    throw new Error(`Easy WebBridge 健康检查失败：${safeErrorMessage(error)}`);
  }
  const browserPayload = await bridgeRequest(baseUrl, "/v1/browsers", { token });
  const browser = chooseBrowser(Array.isArray(browserPayload?.browsers) ? browserPayload.browsers : [], options.browserId);
  const session = `douyin-work-analyzer-${Date.now()}-${randomUUID().slice(0, 8)}`;
  let createdSession = false;
  let snapshot;
  try {
    let tabId = options.tabId == null ? null : Number(options.tabId);
    if (options.tabId != null && (!Number.isInteger(tabId) || tabId < 1)) throw new UsageError("--tabId 必须是正整数");
    if (tabId == null) {
      const navigation = await bridgeCommand(baseUrl, token, browser.browserId, "navigate", {
        url: sourceUrl,
        newTab: true,
        active: true,
        session,
        groupTitle: "抖音作品分析",
      });
      tabId = Number(navigation?.tabId);
      if (!Number.isInteger(tabId)) throw new Error("导航成功但没有返回 tabId");
      createdSession = true;
      await sleep(toWaitMs(options.waitMs));
    }
    snapshot = normalizeSnapshot(await bridgeCommand(baseUrl, token, browser.browserId, "snapshot", { tabId, maxTextLength: MAX_SNAPSHOT_TEXT }));
    const gate = detectAccessGate(snapshot.text);
    if (gate) throw new Error("当前页面要求登录、验证码或安全验证，已停止分析；请在已授权浏览器中完成合法验证后重试");
    const pageUrl = snapshot.url || sourceUrl;
    assertDouyinUrl(pageUrl, "当前页面 URL");
    return { snapshot, sourceUrl };
  } finally {
    if (createdSession && !options.keepTab) {
      try {
        await bridgeCommand(baseUrl, token, browser.browserId, "close_session", { session });
      } catch (error) {
        process.stderr.write(`警告：无法关闭本次任务标签组：${safeErrorMessage(error)}\n`);
      }
    }
  }
}

async function runMock(options) {
  if (!options.mock) throw new UsageError("--mock 需要快照文件路径");
  const payload = JSON.parse(await readFile(resolve(options.mock), "utf8"));
  const snapshot = normalizeSnapshot(payload);
  const sourceUrl = assertDouyinUrl(options.url || snapshot.url, "快照 URL");
  const gate = detectAccessGate(snapshot.text);
  if (gate) throw new Error("Mock 快照包含登录或安全验证提示，按真实流程停止分析");
  return { snapshot, sourceUrl };
}

async function runAnalyze(options) {
  const { snapshot, sourceUrl } = options.mock ? await runMock(options) : await runLive(options);
  const report = buildReport(snapshot, sourceUrl);
  const outputDir = await writeReports(report, options.output);
  return { outputDir, report };
}

async function selfTest() {
  const outputDir = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(join(tmpdir(), "douyin-work-analyzer-")));
  const fixture = {
    title: "抖音作品：三步看懂 AI 工具",
    url: "https://www.douyin.com/video/1234567890",
    text: "三步看懂 AI 工具，今天把复杂流程讲清楚\n作者：示例创作者\n先问一个问题：为什么你的内容总是没人看？\n#AI工具 #内容创作\n点赞 1.2万\n评论 38\n收藏 560",
    interactive: [],
  };
  const fixturePath = join(outputDir, "fixture.json");
  await writeFile(fixturePath, JSON.stringify(fixture), "utf8");
  try {
    const result = await runAnalyze({ command: "analyze", mock: fixturePath, output: outputDir });
    const jsonPath = join(result.outputDir, "douyin-work-analysis.json");
    const mdPath = join(result.outputDir, "douyin-work-analysis.md");
    const report = JSON.parse(await readFile(jsonPath, "utf8"));
    const markdown = await readFile(mdPath, "utf8");
    if (report.kind !== "douyin-work-analysis" || report.work.author !== "示例创作者") throw new Error("作者解析断言失败");
    if (report.work.visibleMetrics["点赞"] !== 12_000 || !report.work.hashtags.includes("#AI工具")) throw new Error("指标或话题解析断言失败");
    if (!markdown.includes("# 抖音作品分析报告") || !markdown.includes("页面证据摘录")) throw new Error("Markdown 输出断言失败");
    if (JSON.stringify(report).includes("browserId") || JSON.stringify(report).includes("Token")) throw new Error("敏感字段泄漏断言失败");
    process.stdout.write(JSON.stringify({ ok: true, test: "mock-analysis", files: ["douyin-work-analysis.json", "douyin-work-analysis.md"] }, null, 2) + "\n");
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (options.command === "self-test") {
    await selfTest();
    return;
  }
  if (options.command !== "analyze") throw new UsageError(`无法识别命令: ${options.command}`);
  const result = await runAnalyze(options);
  process.stdout.write(JSON.stringify({ ok: true, outputDir: result.outputDir, files: ["douyin-work-analysis.json", "douyin-work-analysis.md"] }, null, 2) + "\n");
}

main().catch((error) => {
  const status = error instanceof UsageError ? 2 : 1;
  process.stderr.write(`错误：${safeErrorMessage(error)}\n`);
  if (status === 2) process.stderr.write(`\n${HELP}`);
  process.exitCode = status;
});
