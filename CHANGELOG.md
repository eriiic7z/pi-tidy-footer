# Changelog

[中文](#中文)

## [1.1.0] - 2026-08-21

### Added

- **`/ed` command family** — list, hide, show, rewrite and clear per-extension status display rules (`/ed` `/edh` `/eds` `/edr` `/edc`), plus one-key emoji hiding (`/ede`)
- **Transformer system** — display tweaks split into a built-in layer (shipped, read-only) and a user layer (your own file, never overwritten by updates); user transformers override built-ins by key; managed via `/edt` (on/off, disable/enable, directory, hot reload)
- **`/fcl` config reset** — clears all pi-tidy-footer config and restores the MCP footer setting for a clean uninstall

### Changed

- **`/ed` rule commands freeze in transformer mode** — when user transformers take over, the `/ed` rule commands are locked and a notice explains how to return

### Improved

- **Atomic config writes** — state is written to a temporary file and renamed into place, so a failed write can never leave a half-written config; the in-memory value is kept on failure
- **Write failures are visible** — every command that saves config now reports "Save failed — config not persisted" instead of silently claiming success
- **Corrupted state is preserved before reset** — a broken state file is backed up before config resets; first run (no file) stays silent
- **Typed pi runtime usage** — the extension's use of the pi API is fully typed via local interfaces, replacing nearly all explicit `any`
- **Self-check test suite** — assertions cover the pure display logic (git token parsing, rewrite rules, argument parsing, formatting, ANSI stripping) with zero dependencies
- **CI preflight** — type check, tests and a packaging dry-run run before every publish

### Fixed

- **`/fcl` no longer deletes a user-configured transformers directory** — the recursive removal is restricted to the default directory (or a subdirectory of it), so a custom directory is never wiped
- **Footer no longer degrades when a message lacks usage stats** — token sums now tolerate missing fields instead of throwing and collapsing the whole footer into the fallback line
- **`/edt reload` keeps the previous transformers when reading fails** — a failed reload no longer silently clears every display tweak; the old ones stay active and an error is shown
- **FX rates retry after a failed first fetch** — a one-off CDN failure no longer disables cost, balance and threshold display for the whole session; a recovery retry runs 60s later (empty payloads retry too)
- **MCP compact injection is retried after failure** — the injection flag is only persisted on success, so a missing or corrupt mcp.json no longer leaves the verbose MCP status forever
- **Transparent rewrites no longer swallow the trailing colour reset** — a rewrite rule matching across ANSI codes keeps the reset code after the match, so the following text keeps its intended colour
- **`/edr` hints now match what the user actually sees** — the baseline check simulates built-in transformations with the real theme instead of checking against un-transformed text

## [1.0.0] - 2026-07-31
### Changed

- **Balance cross-currency symbol mismatch fixed** — when FX data was unavailable, the balance display showed a wrong currency symbol (e.g. $12.34 for a CNY balance). Now hides the balance segment when FX rates are missing
- **ccyRate returns undefined for missing rates** — non-USD currencies now return `undefined` instead of silently falling back to `0` when exchange rates are missing. Consumers show `--` or skip the display
- **`/bs -d` argument parsing** — pure `-d` (no symbol) wrongly set the literal string "-d" as the active balance symbol. Now requires `-d <symbol>` with a space separator
- **tool queue sliding window** — `minDisplayTimer` resets on every new tool completion, using a sliding 150ms window instead of a fixed one-shot timer
- **Git status retry limit** — `runGitStatus` now bails after 3 consecutive failures, preventing tight-loop retries on a broken repository
- **render() try-catch** — the entire render body is wrapped in try-catch; failures log to console and display a fallback line instead of breaking the footer
- **FX TTL check moved to refreshFx entry** — previously only checked once on footer construction, now checks every `refreshFx()` call
- **Unsued import** — removed dangling `AssistantMessage` import leftover from an earlier refactor


### Improved

- **Persistence layer unified** — `readState<T>(key, fallback)` and `mergeState(patch)` replace 18 individual read/write functions. All 9 previous write patterns collapsed into shared helpers; `existsSync` I/O removed
- **State persistence — memory cache** — state JSON is parsed once on first access and cached in memory. All `readState` calls avoid disk I/O; `mergeState` writes disk first, then updates memory
- **Threshold commands merged** — `/bt` and `/ct` now share a `thresholdCommand()` factory, eliminating ~60 lines of duplicated parsing/validation/notification logic
- **Command guard extracted** — `guardEnabled(fn)` wrapper replaces 6 identical `if (!enabled)` blocks in command handlers
- **Currency rate helper** — `getCurrentRate()` replaces `const ccy = readCostCurrency(); const rate = ccyRate(ccy, fxCache?.rates)` repeated across 8 call sites
- **Provider parse functions unified** — `safeBalance(v)` helper replaces 4 identical `Number(v) → Number.isFinite → toFixed(2)` patterns across DeepSeek, OpenRouter, SiliconFlow and Zhipu provider definitions
- **MCP colour logic deduplicated** — `formatMcpItem()` helper replaces two identical `.replace("servers ", "").replace(/MCP:/, …)` blocks and dead `invalidateExtCache` hook removed
- **Extension status cache** — extension item list and MCP accent colour are now cached in a factory-scoped closure and rebuilt only when `getExtensionStatuses()` changes (detected via serialized comparison)
- **Magic numbers extracted** — `FX_TTL_MS`, `GIT_TIMEOUT_MS`, `GIT_POLL_MS`, `BALANCE_COOLDOWN_MS`, `FETCH_TIMEOUT_MS`, `STATUS_MIN_MS`, `GIT_DEBOUNCE_MS` moved to named top-level constants



### Fixed

- **Silent errors now logged** — all 4 previously no-op catch blocks (mergeState, refreshFx, fetchBalance, getApiKey) now emit `console.error("pi-tidy-footer:", …)`
- **Threshold persistence regression** — readThresholds/readCostThresholds incorrectly read a non-existent nested key after the persistence refactor, silently falling back to defaults on restart
- **Balance fetch optimistic timestamp** — balanceLastFetch was set before fetchBalance completed; a failed fetch now retries immediately instead of being blocked for 30s
- **Network fetch timeout** — `refreshFx()` and `fetchBalance()` use `AbortSignal.timeout(5000)`, preventing permanently hung promises on network failure
- **parseFloat crash path** — all 5 balance provider parse functions now use `Number(v) + Number.isFinite` instead of `parseFloat(v).toFixed(2)`, preventing TypeError on non-numeric API responses


## [0.8.0] - 2026-07-31

### Added

- **Balance symbol prefix** — configurable prefix before balance display (e.g. `⛽︎$0.12`). `/bs` toggles among ⛽ / ◎◉ / ◉; `/bs <symbol>` sets a custom symbol (persisted); `/bs -d <symbol>` deletes; `/bs -l` lists all active symbols. Wrap in `" "` to keep trailing spaces (e.g. `/bs "* "` → `* $0.12`).
- **Disabled command guard** — when footer is toggled off via `/tf`, all sub-commands (`/sc` `/bt` `/bs` `/ct` `/es` `/ew`) show `Command unavailable: pi-tidy-footer disabled. Use /tf to enable.` and return immediately. Only `/tf` itself is exempt.

### Changed

- **Notification system overhaul** — all command descriptions, status messages, and error messages now follow a consistent 7-category scheme:
  - **F (descriptions)** — 7 commands rewritten to `<object>: <usage1>; <usage2>` format (colon-delimited object, semicolon-separated behaviours).
  - **B (toggle)** — `/tf` → `Tidy footer: ENABLED` / `Tidy footer: DISABLED. Config saved, /tf to re-enable.` `/ew` → `Extension wrap: ON` / `Extension wrap: OFF`.
  - **D/E (errors)** — invalid currency → `Invalid currency: "XXX". Available: …`. Threshold format errors → `Usage: /<cmd> <warn> <alert> — warn must be greater/less than alert. Default: …`. Missing symbol for delete → `Invalid symbol: "XXX". Use /bs -l to list available symbols.`
  - **G (precondition)** — disabled state guards use `Command unavailable: pi-tidy-footer disabled. Use /tf to enable.`
- **Universal emoji gap removal** — extension statuses (MCP, ponytail, etc.) now strip whitespace between any emoji and its following text via `/(\p{Extended_Pictographic})\s+/gu`. Removed the narrow ponytail-only cleanup; new extensions need no per-extension handling.
- **MCP status compacted** — `servers` prefix removed from MCP display (`7 servers enabled` → `7 enabled`).

## [0.7.0] - 2026-07-25
### Changed

- **`/cc` renamed to `/sc`** (switch currency), moved before `/bt` in command list; description updated to reflect it controls currency for both balance and cost display
- Command order reorganized to `tf → sc → bt → ct → es → ew` for logical flow: toggle → currency → balance thresholds → cost thresholds → extension sort → extension wrap
- `/bt` description reformatted to match `/ct` style: `"Balance thresholds (no args = show, <warn> <alert> = set, warn > alert)"`
- `/ct` description pluralized from `"Cost threshold"` to `"Cost thresholds"` for consistency


### Removed

- **`/cd` cost toggle removed** — `readShowCost`/`writeShowCost` functions and `/cd` command deleted. Cost display now hard-wired on at end of stats line. Toggle introduced in 0.6.0 when only USD was available; multi-currency and auto fx rates eliminated the need.


## [0.6.1] - 2026-07-26

### Added

- Thumbnail and screenshot assets for pi.dev gallery and README
- SEO keywords: `cost`, `currency`, `multi-currency`, `token`, `git`, `sort`, `wrap`, `live`, `theme`

### Changed

- `files` streamlined to `["extensions", "README.md", "LICENSE"]` — CHANGELOG no longer shipped to users
- Description updated to `live display of multi-currency token cost and account balance` wording
- `package.json` arrays compacted to single-line format

## [0.6.0] - 2026-07-26

### Added

- Multi-currency token cost display: per-session cost shown at end of stats line (on by default), with configurable yellow/red thresholds that follow the selected currency
- `/cd` command: toggle cost display on/off
- `/cc` command: set or check cost currency (10 currencies supported: AUD CAD EUR GBP JPY KRW USD CNY HKD TWD)
- `/ct <warn> <alert>` command: set or check cost thresholds (warn < alert, values follow active currency)
- Account balance expanded to 5 providers: added OpenRouter, SiliconFlow, and Zhipu (balance now auto-converts to the selected currency)
- Live exchange rates fetched daily from fawazahmed0/currency-api, cached in state file
- `/bt` now supports empty args to show current thresholds in the active currency

### Changed

- Balance thresholds (`/bt`) now stored in USD internally and auto-converted to the selected currency for display; default values adjusted to 4.14/1.38 (USD)
- README description updated to reflect multi-currency cost and balance features
- Extension status `filter` moved before `sort` to reduce sorted elements
- Rate computation extracted to `ccyRate` helper, eliminating duplicate currency conversion logic
- Package description shortened to fit pi.dev display limits

### Fixed

- Tool activity indicator: 150ms minimum hold now correctly reads the display queue, preventing fast tools from flickering off immediately
- Balance display: NaN guard prevents `$NaN` when balance parse fails (shows `$--` instead)
- `writePersistedEnabled` no longer overwrites other state keys
- Removed unused `v as string` casts in extension rendering
- MCP label dimming: restored missing colour rewrite in non-wrapped extension display path
- Footer now enabled by default on first install (`/tf` still toggles off)

## [0.5.2] - 2026-07-25

### Changed

- Keywords expanded for npm/pi.dev discoverability: added `pi`, `footer`, `tidy-footer`, `statusline`, `tui`, `balance`; removed generic `extension` (redundant with `pi-extension`)

## [0.5.1] - 2026-07-23

### Changed

- Description shortened so pi.dev displays it in full

## [0.5.0] - 2026-07-23

### Added

- `/es` command: extension sort (renamed from `/se`), show or set sort order
- `/ew` command: toggle extension wrap mode (on/off), persisted across sessions; when on, extension statuses wrap at entry boundaries instead of truncating with `...`
- `peerDependencies` declared for `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui`
- `homepage` field added to package.json

### Changed

- Extension status wrapping: entries now wrap atomically at extension boundary (single-entry overflow still truncates); replaces the native footer's single-line truncation behaviour
- `pi.extensions` value changed from a single-file path (`./extensions/pi-tidy-footer.ts`) to a directory path (`./extensions`) for compatibility with pi.dev indexing
- `package.json` fields reordered to standard convention
- `/se` renamed to `/es` for consistency with other `/e-` prefixed extension commands
- Description and README updated

## [0.4.0] - 2026-07-22

### Added

- `/se` command: show or set extension status sort order, persisted across sessions
- Extension statuses now sorted by user-defined order instead of alphabetically; unlisted extensions appear at the end

### Changed

- Ponytail and Caveman status formatting switched from regex reconstruction to replace-based approach, preserving native colours
- Ponytail status: removed ⚡ emoji, level text lowercased, 🐴 emoji kept
- Caveman status: label capitalised to `Caveman:`, level text lowercased

### Fixed

- `writePersistedEnabled` no longer overwrites other state keys (balance thresholds, extension order)
- Duplicate `clearTimeout` call in `dispose()` removed
- Unreachable fallback in `formatToolActivity` removed
- `!== null` → `!= null` in context usage check (handles undefined correctly)
- `fetchBalance` for DeepSeek: added null guard before `parseFloat` to avoid implicit exception handling
- Removed redundant `existsSync` calls in `readPersistedEnabled` and `readExtensionOrder`

## [0.3.0] — 2026-07-19

### Added

- Account balance after the model name on line 2 (`¤¥` format, DeepSeek and Kimi), auto-refreshed after each turn (30s cooldown); yellow under warn threshold, red under alert threshold
- `/bt <warn> <alert>` command to set custom yellow/red balance thresholds, persisted, warn > alert required

### Changed

- Tool activity indicator simplified to show only the running tool with a brief hold for fast tools; removed thinking and completed states
- README: repositioned cost removal as "from the left stats area, keeping it token-focused"; added "Tweaks to other extensions" section

## [0.2.0] — 2026-07-19

### Added

- Git status tokens next to the branch name on line 1: `⇡` ahead, `⇣` behind, `+` staged, `~` modified, `?` untracked, `!` conflicts; hidden when clean; fetched asynchronously (250ms debounce + 30s polling + refresh after tool execution)
- Tool activity indicator before the model name on line 2: running tool, streaming (thinking), last completed tool; hidden when idle
- Colored indicator: accent while running, success when completed, dim while thinking

### Fixed

- Thinking level stuck at `off`: now reads the latest `thinking_level_change` session entry, correctly following Shift+Tab (same data source as the built-in footer)
- MCP extension status color: preserves the original accent color with a dimmed `MCP:` label, no longer loses color on theme changes
- `/tf` command description corrected to "Toggle pi-tidy-footer on / off"; unified to standard hyphens in UI text

## [0.1.0] — 2026-07-18

### Added

- First release
- `/tf` command to toggle footer without cost ($)
- Persistent toggle state across sessions
- Preserves all other built-in footer info

---

## 中文

## [1.1.0] - 2026-08-21

### 新增

- **`/ed` 命令族** — 列出、隐藏、恢复、重写、清除单个扩展状态显示规则（`/ed` `/edh` `/eds` `/edr` `/edc`），外加一键 emoji 隐藏（`/ede`）
- **Transformer 系统** — 显示微调拆分为内置层（随包发布、只读）与用户层（你自己的文件、更新永不覆盖）；用户 transformer 按 key 覆盖内置；通过 `/edt` 管理（on/off、禁用/启用、目录、热重载）
- **`/fcl` 配置重置** — 清除全部 pi-tidy-footer 配置并还原 MCP footer 设置，干净卸载

### 变更

- **transformer 模式下 `/ed` 规则命令冻结** — 用户 transformer 接管后，`/ed` 规则命令被锁定，提示告知如何返回

### 改进

- **原子配置写入** — 状态先写临时文件再重命名，失败的写入不会留下半截配置；失败时内存保留旧值
- **写入失败可见** — 所有保存配置的命令现在都报告 "Save failed — config not persisted"，不再静默宣称成功
- **损坏状态先备份再重置** — 损坏的状态文件在重置前先备份；首次运行（无文件）保持静默
- **pi 运行时类型化** — 扩展对 pi API 的使用通过本地接口完全类型化，消除了几乎所有显式 `any`
- **自检测试套件** — 断言覆盖纯显示逻辑（git token 解析、重写规则、参数解析、格式化、ANSI 剥离），零依赖
- **CI 预检** — 每次发布前执行类型检查、测试和打包预演

### 修复

- **`/fcl` 不再删除用户自定义的 transformer 目录** — 递归删除仅限默认目录（或其子目录），自定义目录不会被误删
- **缺少 usage 统计时 footer 不再降级** — token 求和现在容忍缺失字段，不再抛错并把整个 footer 折叠成 fallback 行
- **`/edt reload` 读取失败时保留旧 transformers** — 失败的重载不再静默清除所有显示微调；旧配置保持生效并显示错误提示
- **FX 汇率首次拉取失败后会重试** — 一次性的 CDN 故障不再让成本、余额、阈值显示整场会话失效；60 秒后进行恢复重试（空响应同样重试）
- **MCP compact 注入失败后会重试** — 注入标志仅在成功时持久化，mcp.json 缺失或损坏不再让冗长的 MCP 状态永久保留
- **透明重写不再吞掉尾部颜色重置码** — 跨 ANSI 码匹配的重写规则保留匹配后的重置码，后续文本颜色保持正确
- **`/edr` 提示与实际所见一致** — 基线检查用真实 theme 模拟内置转换，不再基于未转换文本给出误导提示

## [1.0.0] - 2026-07-31
### 变更

- **余额跨货币符号串修复** — FX 数据缺失时余额显示错误的货币符号（如 CNY 余额显示 $12.34）。现在 FX 缺失时直接隐藏余额段
- **ccyRate 缺失时返回 undefined** — 非 USD 货币缺汇率时不再静默兜底为 0，返回 undefined。消费端显示 `--` 或跳过
- **`/bs -d` 参数解析** — 纯 `-d`（无符号名）将字面量 "-d" 设为当前余额符号。现要求 `-d <符号>`，以空格分隔
- **工具队列滑动窗口** — `minDisplayTimer` 每次新工具完成时重置，用 150ms 滑动窗口替代一次性固定计时器
- **Git status 重试上限** — `runGitStatus` 连续失败 3 次后放弃重试，防止损坏仓库上密集空转
- **render() 异常保护** — render 主体包裹 try-catch；异常时控制台输出并返回 `["pi-tidy-footer: render failed"]`，防止 footer 消失
- **FX TTL 检查移至 refreshFx 入口** — 原仅在 footer 构造时检查一次，改为每次 `refreshFx()` 调用时检查
- **未使用的 import** — 移除重构遗留的 `AssistantMessage` import


### 改进

- **持久化层统一** — `readState<T>(key, fallback)` 和 `mergeState(patch)` 替代 18 个独立读写函数。9 种写模式收拢为 2 个共享工具，删除 `existsSync`
- **持久化状态内存缓存** — JSON 首次访问时解析并缓存到内存。`readState` 不再走磁盘 I/O；`mergeState` 先写磁盘成功后更新内存
- **阈值命令合并** — `/bt` 与 `/ct` 共享 `thresholdCommand()` 工厂函数，消除约 60 行重复
- **命令守卫提取** — `guardEnabled(fn)` 包装函数替代 6 个命令 handler 中重复的 disabled 检查
- **汇率助手提取** — `getCurrentRate()` 替代 8 处 `const ccy = readCostCurrency(); const rate = ccyRate(ccy, fxCache?.rates)`
- **Provider parse 统一** — `safeBalance(v)` 替代 DeepSeek、OpenRouter、SiliconFlow、智谱 4 个 provider 中相同的 `Number(v) → Number.isFinite → toFixed(2)` 模式
- **MCP 颜色逻辑去重** — `formatMcpItem()` 替代两处相同的 `replace("servers ", "").replace(/MCP:/, …)` 代码块。删除不再使用的 `invalidateExtCache` 钩子
- **扩展状态缓存** — extItems 和 MCP 强调色在闭包中缓存，仅在 `getExtensionStatuses()` 变化时重建（通过序列化字符串对比检测）
- **魔法数字提取为常量** — `FX_TTL_MS`、`GIT_TIMEOUT_MS`、`GIT_POLL_MS`、`BALANCE_COOLDOWN_MS`、`FETCH_TIMEOUT_MS`、`STATUS_MIN_MS`、`GIT_DEBOUNCE_MS` 提取为文件顶部具名常量



### 修复

- **静默错误日志化** — 4 处原 `/* no-op */` catch（mergeState、refreshFx、fetchBalance、getApiKey）全部改为 `console.error("pi-tidy-footer:", …)`
- **阈值持久化回归** — 持久化层重构后 readThresholds/readCostThresholds 读写了不存在的嵌套 key，重启后静默退回默认值
- **余额 fetch 乐观时间戳** — balanceLastFetch 在 fetchBalance 完成前更新；失败的请求现在即刻重试，不再被 30s 阻塞
- **网络 fetch 超时** — `refreshFx()` 和 `fetchBalance()` 使用 `AbortSignal.timeout(5000)`，防止网络故障时 Promise 永久挂起
- **parseFloat 崩溃路径** — 5 个余额 provider 的 parse 函数改用 `Number(v) + Number.isFinite` 替代 `parseFloat(v).toFixed(2)`，防止 API 返回非数字字符串时抛出 TypeError


## [0.8.0] - 2026-07-31

### 新增

- **余额符号前缀** — 余额显示前加可配置前缀（如 `⛽︎$0.12`）。`/bs` 在 ⛽ / ◎◉ / ◉ 之间循环切换；`/bs <符号>` 设置自定义符号（持久化）；`/bs -d <符号>` 删除；`/bs -l` 列出所有符号。用 `" "` 包裹以保留尾部空格（如 `/bs "* "` → `* $0.12`）。
- **禁用状态命令守卫** — 通过 `/tf` 关闭页脚后，所有子命令（`/sc` `/bt` `/bs` `/ct` `/es` `/ew`）均显示 `Command unavailable: pi-tidy-footer disabled. Use /tf to enable.` 并直接返回。仅 `/tf` 自身豁免。

### 变更

- **通知体系全面重整** — 命令描述、状态提示、错误信息统一遵循 7 类规范方案：
  - **F 类（描述）** — 7 条命令重写为「对象：用法1；用法2」格式（冒号分隔对象、分号分隔行为）。
  - **B 类（开关）** — `/tf` → `Tidy footer: ENABLED` / `Tidy footer: DISABLED. Config saved, /tf to re-enable.`。`/ew` → `Extension wrap: ON` / `Extension wrap: OFF`。
  - **D/E 类（错误）** — 未知币种 → `Invalid currency: "XXX". Available: …`。阈值格式错误 → `Usage: /<cmd> <warn> <alert> — warn must be greater/less than alert. Default: …`。删除不存在的符号 → `Invalid symbol: "XXX". Use /bs -l to list available symbols.`
  - **G 类（前置条件）** — 禁用状态守卫统一使用 `Command unavailable: pi-tidy-footer disabled. Use /tf to enable.`
- **通用 emoji 间距规则** — 扩展状态（MCP、ponytail 等）统一经过 `/(\p{Extended_Pictographic})\s+/gu` 删除 emoji 与后续文字之间的空白。移除原先 ponytail 专用的空格清理代码；新增扩展无需逐扩展特殊处理。
- **MCP 状态精简** — 去除 MCP 显示中的 `servers` 字样（`7 servers enabled` → `7 enabled`）。

## [0.7.0] - 2026-07-25
### 变更

- **`/cc` 重命名为 `/sc`**（switch currency），移至 `/bt` 之前；描述更新为明确同时作用于余额和费用显示
- 命令顺序调整为 `tf → sc → bt → ct → es → ew`，逻辑流：开关 → 币种 → 余额阈值 → 费用阈值 → 扩展排序 → 扩展换行
- `/bt` 描述统一为 `/ct` 风格
- `/ct` 描述从 `"Cost threshold"` 改为 `"Cost thresholds"`，统一复数形式


### 移除

- **`/cd` 费用开关已移除** — 删除 `readShowCost`/`writeShowCost` 函数和 `/cd` 命令。费用现在始终在 stats 行末尾显示。该开关在 0.6.0 时期仅支持单币种 USD 时引入；多币种和自动汇率已消除此需求。


## [0.6.1] - 2026-07-26

### 新增

- pi.dev 画廊缩略图和 README 截图资源
- SEO 关键词：`cost`、`currency`、`multi-currency`、`token`、`git`、`sort`、`wrap`、`live`、`theme`

### 变更

- `files` 精简为 `["extensions", "README.md", "LICENSE"]`，CHANGELOG 不再分发给用户
- 描述更新为 `live display of multi-currency token cost and account balance` 措辞
- `package.json` 数组压缩为单行格式

## [0.6.0] - 2026-07-26

- 多币种 token 费用显示：stats 行末尾显示会话费用（默认开启），可自定义黄/红阈值并随币种切换自动换算
- `/cd` 命令：切换费用显示开/关
- `/cc` 命令：设置或查看费用币种（支持 10 种：AUD CAD EUR GBP JPY KRW USD CNY HKD TWD）
- `/ct <warn> <alert>` 命令：设置或查看费用阈值（warn < alert，数值随当前币种换算）
- 账户余额扩展至 5 家提供商：新增 OpenRouter、SiliconFlow、智谱（余额自动换算为当前币种）
- 实时汇率每日从 fawazahmed0/currency-api 拉取，缓存至状态文件
- `/bt` 空参查看当前阈值（显示为当前币种）

### 变更

- 余额阈值（`/bt`）内部改为 USD 存储，显示时随当前币种自动换算；默认值调整为 4.14/1.38（USD）
- README 描述更新以反映多币种费用和余额功能
- 扩展状态 `filter` 移至 `sort` 之前，减少排序元素数量
- 汇率计算提取为 `ccyRate` 公共函数，消除多处重复换算逻辑
- 包描述精简以适配 pi.dev 显示限制

### 修复

- 工具活动指示：150ms 最短停留现在正确读取显示队列，快工具不再立即闪烁消失
- 余额显示：添加 NaN 守卫，余额解析失败时显示 `$--` 而非 `$NaN`
- `writePersistedEnabled` 不再覆盖其他状态键
- 移除扩展渲染中多余的 `v as string` 类型断言
- MCP 标签置灰：修复非换行扩展显示路径中缺失的颜色替换
- 页脚首次安装默认开启（`/tf` 仍可手动关闭）

## [0.5.2] - 2026-07-25

### 变更

- 扩展关键词以提升 npm/pi.dev 可发现性：新增 `pi`、`footer`、`tidy-footer`、`statusline`、`tui`、`balance`；移除泛词 `extension`（与 `pi-extension` 冗余）

## [0.5.1] - 2026-07-23

### 变更

- 精简描述，确保 pi.dev 完整显示

## [0.5.0] - 2026-07-23

### 新增

- `/es` 命令：扩展排序（原 `/se` 重命名），查看或设置排列顺序
- `/ew` 命令：切换扩展换行模式（开/关），持久化存储；开启后扩展状态按条目边界换行，不再截断加 `...`
- 声明 `peerDependencies`：`@earendil-works/pi-ai`、`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`
- 新增 `homepage` 字段

### 变更

- 扩展状态换行：以扩展条目为原子换行（单条超宽仍截断），替代原生 footer 的单行截断行为
- `pi.extensions` 从单文件路径改为目录路径（`./extensions`），兼容 pi.dev 索引
- `package.json` 字段顺序按行业规范重新排列
- 描述与 README 更新：「插件自定义排序与换行、token 余额显示、Git 文件状态、工具活动指示」
- `/se` 重命名为 `/es`，与后续 `e-` 前缀扩展命令统一

## [0.4.0] - 2026-07-22

### 新增

- `/se` 命令：查看或设置扩展状态排序，持久化存储
- 扩展状态按用户自定义顺序排列，未列出的扩展自动排至末尾

### 变更

- Ponytail 和 Caveman 状态格式化从正则重组改为 replace 方式，保留原生颜色
- Ponytail 状态：移除 ⚡ 符号，级别字母全小写，🐴 符号保留
- Caveman 状态：标签首字母大写为 `Caveman:`，级别字母全小写

### 修复

- `writePersistedEnabled` 不再覆盖其他状态键（余额阈值、扩展顺序）
- 删除 `dispose()` 中的重复 `clearTimeout` 调用
- 删除 `formatToolActivity` 中不可达的兜底逻辑
- 上下文用量检查 `!== null` → `!= null`（正确处置 undefined）
- DeepSeek 余额查询：`parseFloat` 前添加空值保护，避免隐式依赖异常流
- 删除 `readPersistedEnabled` 和 `readExtensionOrder` 中的冗余 `existsSync` 调用

## [0.3.0] — 2026-07-19

### 新增

- 第 2 行模型名后显示当前 provider 的账户余额（`¤¥` 格式，支持 DeepSeek 和 Kimi），每个 turn 结束后自动刷新（30s 冷却）；余额低于警告线变黄、低于红线变红
- `/bt <warn> <alert>` 命令：自定义余额黄/红阈值，持久化存储，warn 必须大于 alert

### 变更

- 工具活动指示精简为仅显示运行中的工具，快工具至少保留 150ms 驻留；移除 thinking 和已完成状态
- README：去除费用表述改为"从左侧统计模块移除 $0.604，让统计专注 token"；新增"其他扩展微调"小节

## [0.2.0] — 2026-07-19

### 新增

- 第 1 行分支名旁显示 Git 状态标记：`⇡` 领先、`⇣` 落后、`+` 已暂存、`~` 已修改、`?` 未跟踪、`!` 冲突；干净仓库不显示；异步获取（250ms 防抖 + 30s 轮询 + 工具结束后刷新）
- 第 2 行模型名前显示工具活动指示：运行中工具、流式生成、刚完成的工具；空闲时不显示
- 工具指示着色：运行中 accent、刚完成 success、thinking dim

### 修复

- thinking level 始终显示 off：改为从会话条目中获取最近一次的 `thinking_level_change`，正确跟随 Shift+Tab（数据源与内置页脚等价）
- MCP 扩展状态颜色：保留原始强调色值，`MCP:` 前缀置灰，主题切换不再丢色
- `/tf` 命令描述修正为 "Toggle pi-tidy-footer on / off"；文案统一使用普通连字符

## [0.1.0] — 2026-07-18

### 新增

- 首个正式版本
- `/tf` 命令切换页脚，去除费用 ($) 显示
- 切换状态跨会话持久化
- 保留内置页脚全部其他信息
