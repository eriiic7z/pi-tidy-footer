# pi-tidy-footer

> 整洁有序的 Pi 页脚 — 保留内置页脚布局的微调：去除费用 ($) 显示，增加 Git 状态标记、工具活动指示与账户余额，开关状态跨会话持久化。
> Tidy Pi footer — preserves the built-in footer layout with micro-adjustments: removes cost ($), adds git status tokens, a tool activity indicator, and account balance, with persistent toggle state across sessions.

---

## 功能 / Features

- 🚫 **去除费用显示 / Cost-free** — 页脚中不再显示 `$0.604` / No `$0.604` in the footer
- 🌿 **Git 状态标记 / Git status tokens** — 分支名旁显示仓库状态：`⇡` 领先、`⇣` 落后、`+` 已暂存、`~` 已修改、`?` 未跟踪、`!` 冲突；干净仓库不显示 / Shows repo state next to the branch name: `⇡` ahead, `⇣` behind, `+` staged, `~` modified, `?` untracked, `!` conflicts; hidden when clean
- ⚙ **工具活动指示 / Tool activity** — 模型名前实时显示正在运行的工具（高亮），快工具至少有短暂停留；空闲时不显示 / Shows the running tool (highlighted) before the model name with a brief hold for fast tools; hidden when idle
- 📊 **账户余额 / Account balance** — 模型名后显示 DeepSeek / Kimi 账户余额（`¤¥` 格式），低于警告线变黄、低于红线变红 / Shows DeepSeek or Kimi account balance after the model name (`¤¥` format), yellow under warn threshold, red under alert threshold
- 🎚️ **余额阈值命令 / Balance threshold** — `/bt <warn> <alert>` 自定义黄/红警告线，持久化存储，warn 必须大于 alert / `/bt <warn> <alert>` to set custom yellow/red thresholds, persisted, warn > alert required
- 🧠 **思考级别跟随 / Thinking level** — thinking level 正确跟随 Shift+Tab 切换 / Thinking level correctly follows Shift+Tab
- 💾 **跨会话记忆 / Persistent state** — `/tf` 的状态保存在本地文件中，重启 Pi 后保持不变 / Toggle state persists across restarts
- 🧩 **保持原样 / Faithful to native** — 其余所有内置页脚信息（模型、Token 统计、上下文百分比、Git 分支、扩展状态）完全不动 / Everything else (model, token stats, context %, git branch, extension statuses) stays untouched
- ⌨️ **一键切换 / Toggle** — `/tf` 随时开关，秒切回原始页脚 / `/tf` toggles back to the original footer anytime

---

## 安装 / Install

```bash
# 链接到 Pi 扩展目录 / Link to Pi extensions folder
ln -s $(pwd)/extensions/pi-tidy-footer.ts ~/.pi/agent/extensions/pi-tidy-footer.ts
```

## 使用 / Usage

| 命令 / Command | 说明 / Description |
| --------------- | ------------------- |
| `/tf` | 切换 pi-tidy-footer 页脚（开/关）/ Toggle pi-tidy-footer (on/off) |
| `/bt <warn> <alert>` | 设置余额黄/红阈值 / Set balance yellow/red thresholds |

---

## License

Proprietary — all rights reserved.
