# pi-tidy-footer

> 整洁有序的 Pi 页脚 — 保留内置页脚布局，仅去除费用 ($) 显示，开关状态跨会话持久化。
> Tidy Pi footer — preserves the built-in footer layout, removes only the cost ($) display, with persistent toggle state across sessions.

---

## 功能 / Features

- 🚫 **去除费用显示** — 页脚中不再显示 `$0.604`
- 💾 **跨会话记忆** — `/tf` 的状态保存在本地文件中，重启 Pi 后保持不变
- 🧩 **保持原样** — 其余所有内置页脚信息（模型、思考级别、Token 统计、上下文百分比、Git 分支、扩展状态）完全不动
- ⌨️ **一键切换** — `/tf` 随时开关，秒切回原始页脚

---

## 安装 / Install

```bash
# 链接到 Pi 扩展目录 / Link to Pi extensions folder
ln -s $(pwd)/extensions/pi-tidy-footer.ts ~/.pi/agent/extensions/pi-tidy-footer.ts
```

## 使用 / Usage

| 命令 / Command | 说明 / Description |
|---------------|-------------------|
| `/tf` | 切换页脚（去除费用 / 原始）/ Toggle footer (cost-free / original) |

---

## License

Proprietary — all rights reserved.
