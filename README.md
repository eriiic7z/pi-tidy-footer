# pi-tidy-footer

[中文](#中文)

Tidy and better footer for Pi — native layout, layered with new features: live display of multi-currency token cost and account balance (color-coded warnings with configurable thresholds); extension sorting, wrapping, and label tweaks; git file status; and tool activity indicators.

![pi-tidy-footer](https://raw.githubusercontent.com/eriiic7z/pi-tidy-footer/main/assets/ScreenShot.png)

## Install

```bash
pi install npm:pi-tidy-footer
```

## Features

- **Multi-currency token cost display** — Per-session token cost shown live at end of stats line, with configurable yellow/red thresholds; 10 currencies supported with live daily exchange rates
- **Multi-currency API account balance** — Shows live account balance for DeepSeek, Kimi, OpenRouter, SiliconFlow, and Zhipu after the model name, with configurable yellow/red low-balance thresholds
- **Extension sort order** — Custom sort order for extension statuses, persisted across sessions
- **Extension overflow wrap** — Wraps extension statuses to the next line instead of truncating with "…"; on by default, ideal for multi-extension setups
- **Git status tokens** — Repo state next to the branch name: `⇡` ahead, `⇣` behind, `+` staged, `~` modified, `?` untracked, `!` conflicts; hidden when clean
- **Tool activity indicator** — Shows the running tool before the model name with brief hold for fast tools; hidden when idle
- **Toggle & persistence** — Toggle back to the original footer anytime; all settings survive restarts
- **Mostly native** — Everything else (model, token stats, context %, git branch) kept intact

## Display tweaks for other extensions

- **pi-mcp-adapter** — Dimmed the `MCP:` label while preserving its original accent color
- **ponytail** — Removed ⚡ emoji from status, level text lowercased, 🐴 emoji kept
- **caveman** — Label capitalised to `Caveman:`, level text lowercased

## Commands

| Command | Description |
| --- | --- |
| `/tf` | Toggle pi-tidy-footer (on/off) |
| `/sc` | Switch currency for balance and cost display (no args = list, /sc <code> = set) |
| `/bt <warn> <alert>` | Balance thresholds (no args = show, warn > alert) |
| `/ct <warn> <alert>` | Cost thresholds (no args = show, warn < alert) |
| `/es` | Extension sort (no args = show order, args = set order) |
| `/ew` | Toggle extension wrap (on/off) |

---

## 中文

更整洁、更好用的 Pi 页脚 — 沿用原生布局，叠加了新的功能：多币种 token 费用/账户余额实时显示（颜色警告、自定义警告阈值）、插件自定义排序/溢出换行/标签微调、Git 文件状态、工具活动指示。

![pi-tidy-footer](https://raw.githubusercontent.com/eriiic7z/pi-tidy-footer/main/assets/ScreenShot.png)

## 安装

```bash
pi install npm:pi-tidy-footer
```

## 功能

- **多币种 token 花费实时显示** — Stats 行末尾实时显示会话消耗token费用，支持 10 种币种，汇率每日自动更新：自定义token费用消耗阈值，超值时以黄/红色警示
- **多币种 API 账户余额实时显示** — 模型名后实时显示 DeepSeek / Kimi / OpenRouter / SiliconFlow / 智谱的API账户余额；自定义余额监控阈值，低值时以黄/红色警示
- **插件自定义排序** — 自定义扩展状态排列顺序，持久化存储
- **扩展溢出换行** — 适用于多扩展显示，默认开启换行，避免扩展信息被“…”截断
- **Git 状态标记** — 分支名旁显示仓库状态：`⇡` 领先、`⇣` 落后、`+` 已暂存、`~` 已修改、`?` 未跟踪、`!` 冲突；干净仓库不显示
- **工具活动指示** — 模型名前实时显示正在运行的工具，快工具至少有短暂停留；空闲时不显示
- **开关与持久化** — 随时切回原始页脚；所有设置重启后保持不变
- **基本保留原生样式** — 其余所有内置页脚信息（模型、Token 统计、上下文百分比、Git 分支）保持不变

## 其他扩展的显示微调

- **pi-mcp-adapter** — `MCP:` 标签置灰、保留原始强调色值
- **ponytail** — 状态中移除 ⚡ 符号，级别字母全小写，🐴 符号保留
- **caveman** — 标签首字母大写为 `Caveman:`，级别字母全小写

## 命令

| 命令 | 说明 |
| --- | --- |
| `/tf` | 切换 pi-tidy-footer 页脚（开/关） |
| `/sc` | 切换币种，同时作用于余额和费用显示（空参查看，/sc <code> 设置） |
| `/bt <warn> <alert>` | 余额阈值（空参查看，warn > alert） |
| `/ct <warn> <alert>` | 费用阈值（空参查看，warn < alert） |
| `/es` | 扩展排序（空参查看，传参设置） |
| `/ew` | 切换扩展换行模式（开/关） |
