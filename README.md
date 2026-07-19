# pi-tidy-footer

[中文](#中文)

Tidy Pi footer - preserves the built-in footer layout, with micro-adjustments and new features. Removes per-session cost ($), adds git status tokens, a tool activity indicator, and account balance, with persistent toggle state across sessions.

## Install

```bash
# Link to Pi extensions folder
ln -s $(pwd)/extensions/pi-tidy-footer.ts ~/.pi/agent/extensions/pi-tidy-footer.ts
```

## Features

- **Hide per-session cost** — Removes `$0.604` from the left stats area, keeping it token-focused
- **Git status tokens** — Repo state next to the branch name: `⇡` ahead, `⇣` behind, `+` staged, `~` modified, `?` untracked, `!` conflicts; hidden when clean
- **Tool activity indicator** — Shows the running tool (highlighted) before the model name with brief hold for fast tools; hidden when idle
- **Account balance** — Shows DeepSeek or Kimi account balance after the model name (`¤¥` format), yellow under warn threshold, red under alert threshold
- **Thinking level** — Correctly follows Shift+Tab
- **Persistent state** — `/tf` toggle state persists across restarts
- **Faithful to native** — Everything else (model, token stats, context %, git branch, extension statuses) stays untouched
- **One-key toggle** — `/tf` toggles back to the original footer anytime

## Tweaks to other extensions

- **pi-mcp-adapter** — Dimmed the `MCP:` label while preserving its original accent color, keeping the status line visually coherent across theme changes

## Commands

| Command | Description |
| --- | --- |
| `/tf` | Toggle pi-tidy-footer (on/off) |
| `/bt <warn> <alert>` | Set balance yellow/red thresholds (warn > alert required) |

---

## 中文

整洁的 Pi 页脚 — 保留内置页脚布局，含微调与新功能。去除会话费用 ($) 显示，增加 Git 状态标记、工具活动指示与账户余额，开关状态跨会话持久化。

## 安装

```bash
# 链接到 Pi 扩展目录
ln -s $(pwd)/extensions/pi-tidy-footer.ts ~/.pi/agent/extensions/pi-tidy-footer.ts
```

## 功能

- **去除会话费用显示** — 从左侧统计模块移除 `$0.604`，让统计专注 token
- **Git 状态标记** — 分支名旁显示仓库状态：`⇡` 领先、`⇣` 落后、`+` 已暂存、`~` 已修改、`?` 未跟踪、`!` 冲突；干净仓库不显示
- **工具活动指示** — 模型名前实时显示正在运行的工具（高亮），快工具至少有短暂停留；空闲时不显示
- **账户余额** — 模型名后显示 DeepSeek / Kimi 账户余额（`¤¥` 格式），低于警告线变黄、低于红线变红
- **思考级别跟随** — thinking level 正确跟随 Shift+Tab 切换
- **跨会话记忆** — `/tf` 的状态保存在本地文件中，重启 Pi 后保持不变
- **保持原样** — 其余所有内置页脚信息（模型、Token 统计、上下文百分比、Git 分支、扩展状态）完全不动
- **一键切换** — `/tf` 随时开关，秒切回原始页脚

## 其他扩展微调

- **pi-mcp-adapter** — `MCP:` 标签置灰、保留原始强调色值，使状态行在不同主题下保持视觉协调

## 命令

| 命令 | 说明 |
| --- | --- |
| `/tf` | 切换 pi-tidy-footer 页脚（开/关） |
| `/bt <warn> <alert>` | 设置余额黄/红阈值（warn > alert） |
