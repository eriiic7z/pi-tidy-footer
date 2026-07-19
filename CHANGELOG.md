# Changelog

## [0.3.0] — 2026-07-19

### Added / 新增

- 账户余额：第 2 行模型名后显示当前 provider 的余额（`¤¥` 格式，支持 DeepSeek 和 Kimi），每个 turn 结束后自动刷新（30s 冷却）；余额低于警告线变黄、低于红线变红 / Account balance after the model name on line 2 (`¤¥` format, DeepSeek and Kimi), auto-refreshed after each turn (30s cooldown); yellow under warn threshold, red under alert threshold
- `/bt <warn> <alert>` 命令：自定义余额黄/红阈值，持久化存储，warn 必须大于 alert / `/bt <warn> <alert>` command to set custom yellow/red balance thresholds, persisted, warn > alert required

### Changed / 变更

- 工具活动指示精简为仅显示运行中的工具（`⚙`），移除 thinking 和 ✓ 状态；快工具至少保留 150ms 驻留 / Tool activity indicator simplified to show only the running tool (`⚙`), removed thinking and ✓ states; fast tools held at least 150ms

### Fixed / 修复

- 工具名称使用统一椭圆⚙️（适配 Emoji 变体） / Replace tool icon with unified ⚙️ symbol

## [0.2.0] — 2026-07-19

### Added / 新增

- Git 状态标记：第 1 行分支名旁显示 `⇡` 领先 / `⇣` 落后 / `+` 已暂存 / `~` 已修改 / `?` 未跟踪 / `!` 冲突，干净仓库不显示；异步获取（250ms 防抖 + 30s 轮询 + 工具结束后刷新） / Git status tokens next to the branch name on line 1: `⇡` ahead, `⇣` behind, `+` staged, `~` modified, `?` untracked, `!` conflicts; hidden when clean; fetched asynchronously (250ms debounce + 30s polling + refresh after tool execution)
- 工具活动指示：第 2 行模型名前显示运行中的工具（`⚙`，并发时 `×N` / `+N`）、流式生成（thinking）、刚完成的工具（`✓`），空闲时不显示 / Tool activity indicator before the model name on line 2: running tool (`⚙`, `×N` / `+N` for concurrency), streaming (thinking), last completed tool (`✓`); hidden when idle
- 工具指示着色：运行中 accent、刚完成 success、thinking dim / Colored indicator: accent while running, success when completed, dim while thinking

### Changed / 变更

- （无 / None）

### Fixed / 修复

- thinking level 始终显示 `off`：原实现读取了 Model 类型上不存在的 `thinkingLevel` 属性，改为从会话条目中获取最近一次的 `thinking_level_change`，正确跟随 Shift+Tab（数据源与内置页脚等价） / thinking level stuck at `off`: the old code read a `thinkingLevel` property that does not exist on the Model type; now reads the latest `thinking_level_change` session entry, correctly following Shift+Tab (same data source as the built-in footer)
- MCP 扩展状态颜色：保留原始强调色值，`MCP:` 前缀置灰，主题切换不再丢色 / MCP extension status color: preserves the original accent color with a dimmed `MCP:` label, no longer loses color on theme changes
- `/tf` 命令描述修正为 "Toggle pi-tidy-footer on / off"（原描述仅提去费用，不准确）；文案统一使用普通连字符 / `/tf` command description corrected to "Toggle pi-tidy-footer on / off" (the old text mentioned only cost removal, which was inaccurate); unified to standard hyphens in UI text

## [0.1.0] — 2026-07-18

### Added / 新增

- 首个正式版本 / First release
- `/tf` 命令切换页脚，去除费用 ($) 显示 / `/tf` command to toggle footer without cost ($)
- 切换状态跨会话持久化，存储在 `~/.pi/agent/extensions/pi-tidy-footer-state.json` / Persistent toggle state across sessions
- 保留内置页脚全部其他信息（Token 统计、上下文百分比、模型、Git 分支、扩展状态等） / Preserves all other built-in footer info

### Changed / 变更

- （无 / None）

### Fixed / 修复

- （无 / None）
