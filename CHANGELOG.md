# Changelog

[中文](#中文)

## [0.7.0] - 2026-07-26

### Removed

- **`/cd` cost toggle removed** — `readShowCost`/`writeShowCost` functions and `/cd` command deleted. Cost display now hard-wired on at end of stats line. Toggle introduced in 0.6.0 when only USD was available; multi-currency and auto fx rates eliminated the need.

### Changed

- **`/cc` renamed to `/sc`** (switch currency), moved before `/bt` in command list; description updated to reflect it controls currency for both balance and cost display
- Command order reorganized to `tf → sc → bt → ct → es → ew` for logical flow: toggle → currency → balance thresholds → cost thresholds → extension sort → extension wrap
- `/bt` description reformatted to match `/ct` style: `"Balance thresholds (no args = show, <warn> <alert> = set, warn > alert)"`
- `/ct` description pluralized from `"Cost threshold"` to `"Cost thresholds"` for consistency

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

## [0.7.0] - 2026-07-26

### 移除

- **`/cd` 费用开关已移除** — 删除 `readShowCost`/`writeShowCost` 函数和 `/cd` 命令。费用现在始终在 stats 行末尾显示。该开关在 0.6.0 时期仅支持单币种 USD 时引入；多币种和自动汇率已消除此需求。

### 变更

- **`/cc` 重命名为 `/sc`**（switch currency），移至 `/bt` 之前；描述更新为明确同时作用于余额和费用显示
- 命令顺序调整为 `tf → sc → bt → ct → es → ew`，逻辑流：开关 → 币种 → 余额阈值 → 费用阈值 → 扩展排序 → 扩展换行
- `/bt` 描述统一为 `/ct` 风格
- `/ct` 描述从 `"Cost threshold"` 改为 `"Cost thresholds"`，统一复数形式

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
