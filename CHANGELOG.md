# Changelog

[中文](#中文)

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
