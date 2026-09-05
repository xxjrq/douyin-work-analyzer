# Douyin Work Analyzer

This skill takes one read-only snapshot of a user-specified public Douyin work page in a legally authorized Chromium browser connected through Easy WebBridge. It extracts visible page facts and produces Markdown and JSON reports.

## Prerequisites

- Node.js `>=20`; there are no third-party runtime dependencies.
- Easy WebBridge is installed and running at `http://127.0.0.1:17777` by default.
- The browser is legally signed in to Douyin and connected to the Bridge. This tool does not bypass login, CAPTCHA, risk controls, regional restrictions, or access controls.
- Credential lookup order: `EASY_WEBBRIDGE_TOKEN`, `EASY_WEBBRIDGE_TOKEN_FILE`, then `~/.easy-webbridge/bridge-token`.

## Quick Start

```bash
npm test

node scripts/douyin-work-analyzer.mjs analyze \
  --url "https://www.douyin.com/video/7677916780626595113" \
  --browserId "<online-browser-id>" \
  --output "./reports/7677916780626595113"
```

`--browserId` may be omitted when exactly one browser is online. When `--tabId` is provided, the existing user tab is reused and no new tab is created. Navigation wait time defaults to `1500ms` and accepts `300` through `10000` via `--wait-ms`.

The URL must be a single work page in `/video/<work-id>` or `/note/<work-id>` form. The Douyin home page, search/feed pages, short links, and other paths are rejected as usage errors with exit code `2`. The CLI rejects undeclared options such as `--foo` and the unsupported `--browser` alias.

## Offline Fixtures

```bash
node scripts/douyin-work-analyzer.mjs analyze \
  --mock "./fixtures/sample-snapshot.json" \
  --output "./reports/mock-success"
```

The success fixture is fictional. It verifies local parsing and report generation only; it is not evidence for the specified real Douyin work.

Failure fixtures:

```bash
node scripts/douyin-work-analyzer.mjs analyze --mock ./fixtures/failure-login-gate.json --output /tmp/douyin-login-failure
node scripts/douyin-work-analyzer.mjs analyze --mock ./fixtures/failure-empty-snapshot.json --output /tmp/douyin-empty-failure
```

Login/CAPTCHA gates, empty snapshots, invalid URLs, non-Douyin redirects, an unavailable Bridge, and ambiguous browser selection fail explicitly and do not create success reports. Usage errors exit with `2`, runtime or parsing errors with `1`, and success with `0`.

Extraction is not based on the first 40 snapshot lines. The script verifies that the input and snapshot work IDs match, then anchors the target region using the work ID, page title, a same-work interactive node, a visible hashtag cluster, or the work-detail cluster near the publication-time line. It stops at comment, search-suggestion, and recommendation boundaries. An isolated “sign in to comment” prompt is not treated as a full-page login gate.

Authors are accepted only from an explicit author/creator/publisher label or an `@author` line inside the anchored target region. The analyzer does not take the first global `/user/` link, because recommendation and sidebar links can belong to other creators. UI-generated “Summary” or chapter-summary text is not treated as the work description and cannot produce a hook.

## Outputs

Each successful analysis creates exactly two core files:

- `douyin-work-analysis.md`: a Chinese reviewable report with source, capture time, visible facts, metrics, analysis, evidence, and limitations.
- `douyin-work-analysis.json`: structured output with facts in `source`/`work`, inferences in `analysis`, and minimal review evidence in `evidence`.

Unavailable fields remain `null` or empty arrays. Abbreviated visible counts such as `1.2万` are converted to integers and explicitly documented as conversions of the displayed value, not official precise history.

## Boundaries

- Processes one work URL only; no account batching, comment-list scraping, feed polling, or historical trend database.
- Uses health check, browser enumeration, navigation, one snapshot, and task-session cleanup only.
- Does not read cookies, Local Storage, network bodies, account credentials, or non-public APIs.
- Does not click, type, inject page scripts, like, comment, follow, favorite, message, publish, or download media.
- A page snapshot does not prove shots, editing rhythm, music, tone, or complete subtitles. Missing information stays unconfirmed.

## Real Acceptance and Release Status

The designated acceptance URL is `https://www.douyin.com/video/7677916780626595113`. A real run must succeed in the user's authorized browser and create both reports. With `humanReview.enabled=true`, a human compares factual fields against the page at the same capture time. With `humanReview.enabled=false`, every non-null factual field must be independently traceable to the minimal snapshot or screenshot evidence retained with the report; fields without that evidence stay `null` or empty. Neither mode may substitute a fixture, search snippet, or inference for real page evidence.

`acceptance/real-run-2026-09-05.md` records the redacted real acceptance. The designated URL completed with exit code `0` in one precisely selected authorized browser, and both reports are stored under `acceptance/real-run-2026-09-05/`. With `humanReview.enabled=false`, the retained evidence independently supports the page URL, title, and hashtags. Author and work description remain `null` because the retained evidence does not independently establish them, and the UI chapter summary is not used as a description or hook. A different browser that showed a login/verification gate remained a failure.

As of `2026-09-05`, the SkillHub status is `submitted`. This means submitted/pending review only, not approved, listed, publicly installable, or fully released. The repository also does not claim that GitHub is synchronized without current remote evidence.

## Icon and License

`assets/icon-512.png` is a programmatically generated 512×512 PNG representing one video page and an analysis report. It does not imitate the official Douyin trademark or use third-party artwork. Licensed under the MIT License; see `LICENSE`.
