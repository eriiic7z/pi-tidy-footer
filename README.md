# pi-tidy-footer

[中文](#中文)

Tidy footer for Pi coding agent — native layout, layered with new features: extension sorting, token balance display (color-coded warnings with configurable thresholds), git file status, and tool activity indicators; minor display tweaks for extension labels, keeping it clean.

## Install

```bash
pi install npm:pi-tidy-footer
```

## Features

- **Extension sort order** — Custom sort order for extension statuses, persisted across sessions; run empty command to view the current order prompt
- **Account balance** — Shows DeepSeek or Kimi account balance after the model name (`¤¥` format), yellow below warn threshold, red below alert threshold, both configurable
- **Git status tokens** — Repo state next to the branch name: `⇡` ahead, `⇣` behind, `+` staged, `~` modified, `?` untracked, `!` conflicts; hidden when clean
- **Tool activity indicator** — Shows the running tool (highlighted) before the model name with brief hold for fast tools; hidden when idle
- **Hide per-session cost** — Removes `$0.604` from the left stats area, keeping it token-focused
- **Toggle & persistence** — `/tf` toggles back to the original footer anytime; all settings survive restarts
- **Mostly native** — Everything else (model, token stats, context %, git branch) kept intact

## Display tweaks for other extensions

- **pi-mcp-adapter** — Dimmed the `MCP:` label while preserving its original accent color, keeping the status line visually coherent across theme changes
- **ponytail** — Removed ⚡ emoji from status, level text lowercased, 🐴 emoji kept
- **caveman** — Label capitalised to `Caveman:`, level text lowercased

## Commands

| Command | Description |
| --- | --- |
| `/tf` | Toggle pi-tidy-footer (on/off) |
| `/bt <warn> <alert>` | Set balance yellow/red thresholds (warn > alert required) |
| `/es` | Extension sort (no args = show order, args = set order) |
| `/ew` | Toggle extension wrap (on/off) |

---

## 中文

为 Pi coding agent 打造的整洁页脚 — 沿用原生布局，叠加了新的功能：插件自定义排序、token 余额显示（颜色警告、自定义警告阈值）、Git 文件状态、工具活动指示；对插件标签进行显示微调，保持简洁。

## 安装

```bash
pi install npm:pi-tidy-footer
```

## 功能

- **插件自定义排序** — 扩展状态按自定义顺序排列，持久化存储；可使用空命令查看排序字段提示
- **账户余额** — 模型名后显示 DeepSeek / Kimi 账户余额（`¤¥` 格式），低于预警值（warn）变黄，低于警报值（alert）变红，阈值可自定义
- **Git 状态标记** — 分支名旁显示仓库状态：`⇡` 领先、`⇣` 落后、`+` 已暂存、`~` 已修改、`?` 未跟踪、`!` 冲突；干净仓库不显示
- **工具活动指示** — 模型名前实时显示正在运行的工具（高亮），快工具至少有短暂停留；空闲时不显示
- **去除会话费用显示** — 从左侧统计模块移除 `$0.604`，让统计专注 token
- **开关与持久化** — `/tf` 随时切回原始页脚；所有设置重启后保持不变
- **基本保留原生样式** — 其余所有内置页脚信息（模型、Token 统计、上下文百分比、Git 分支）保持不变

## 其他扩展的显示微调

- **pi-mcp-adapter** — `MCP:` 标签置灰、保留原始强调色值，使状态行在不同主题下保持视觉协调
- **ponytail** — 状态中移除 ⚡ 符号，级别字母全小写，🐴 符号保留
- **caveman** — 标签首字母大写为 `Caveman:`，级别字母全小写

## 命令

| 命令 | 说明 |
| --- | --- |
| `/tf` | 切换 pi-tidy-footer 页脚（开/关） |
| `/bt <warn> <alert>` | 设置余额黄/红阈值（warn > alert） |
| `/es` | 扩展排序（空参查看，传参设置） |
| `/ew` | 切换扩展换行模式（开/关） |
