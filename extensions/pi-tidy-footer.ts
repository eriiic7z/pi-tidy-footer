/**
 * pi-tidy-footer — removes cost ($) from the built-in Pi footer.
 * Toggle with /tf. State persists across restarts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/* ------------------------------------------------------------------ */
/*  persistence                                                        */
/* ------------------------------------------------------------------ */

const STATE_DIR = join(homedir(), ".pi", "agent", "extensions");
const STATE_FILE = join(STATE_DIR, "pi-tidy-footer-state.json");

function readPersistedEnabled(): boolean {
	try {
		if (!existsSync(STATE_FILE)) return false;
		return JSON.parse(readFileSync(STATE_FILE, "utf-8")).enabled === true;
	} catch {
		return false;
	}
}

function writePersistedEnabled(enabled: boolean): void {
	try {
		mkdirSync(STATE_DIR, { recursive: true });
		writeFileSync(STATE_FILE, JSON.stringify({ enabled }), "utf-8");
	} catch {
		/* no-op */
	}
}

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtTok(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

function fmtCwd(cwd: string, home: string | undefined): string {
	if (!home) return cwd;
	const rc = resolve(cwd);
	const rh = resolve(home);
	const rel = relative(rh, rc);
	if (
		rel === "" ||
		(rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
	)
		return rel === "" ? "~" : `~${sep}${rel}`;
	return cwd;
}

/* ------------------------------------------------------------------ */
/*  git status tokens (feature ported from pi-statusline, plain style) */
/* ------------------------------------------------------------------ */

function parseGitStatusTokens(stdout: string): string {
	let ahead = 0,
		behind = 0,
		staged = 0,
		modified = 0,
		untracked = 0,
		conflicts = 0;
	for (const line of stdout.split("\n")) {
		if (!line) continue;
		if (line.startsWith("## ")) {
			const a = line.match(/\bahead (\d+)/);
			const b = line.match(/\bbehind (\d+)/);
			ahead = a ? Number(a[1]) : 0;
			behind = b ? Number(b[1]) : 0;
			continue;
		}
		const x = line[0] ?? " ";
		const y = line[1] ?? " ";
		if (x === "?" && y === "?") {
			untracked++;
			continue;
		}
		if (
			(x === "D" && y === "D") ||
			(x === "A" && y === "A") ||
			x === "U" ||
			y === "U"
		) {
			conflicts++;
			continue;
		}
		if (x !== " " && x !== "?" && x !== "!") staged++;
		if (y !== " " && y !== "?" && y !== "!") modified++;
	}
	const parts: string[] = [];
	if (ahead) parts.push(`⇡${ahead}`);
	if (behind) parts.push(`⇣${behind}`);
	if (staged) parts.push(`+${staged}`);
	if (modified) parts.push(`~${modified}`);
	if (untracked) parts.push(`?${untracked}`);
	if (conflicts) parts.push(`!${conflicts}`);
	return parts.join(" ");
}

/* ------------------------------------------------------------------ */
/*  tool activity                                                      */
/* ------------------------------------------------------------------ */

interface ToolActivityState {
	active: Map<string, number>;
	lastCompleted: string | undefined;
	streaming: boolean;
}

interface LiveHooks {
	requestRender: (() => void) | undefined;
	refreshGit: (() => void) | undefined;
}

function formatToolActivity(state: ToolActivityState): string {
	const active = [...state.active.entries()];
	if (active.length > 0) {
		const [name, count] = active[0] ?? ["tool", 1];
		const suffix =
			count > 1
				? `×${count}`
				: active.length > 1
					? `+${active.length - 1}`
					: "";
		return `⚙ ${name}${suffix}`;
	}
	if (state.streaming) return "thinking";
	if (state.lastCompleted) return `✓ ${state.lastCompleted}`;
	return "";
}

/* ------------------------------------------------------------------ */
/*  footer factory                                                     */
/* ------------------------------------------------------------------ */

function makeFooter(
	ctx: any,
	tui: any,
	theme: any,
	fd: any,
	toolState: ToolActivityState,
	live: LiveHooks,
) {
	let disposed = false;
	let gitTokens = "";
	let gitInFlight = false;
	let gitQueued = false;
	let gitDebounce: ReturnType<typeof setTimeout> | undefined;

	const runGitStatus = () => {
		if (disposed) return;
		if (gitInFlight) {
			gitQueued = true;
			return;
		}
		gitInFlight = true;
		void (async () => {
			try {
				const result = await ctx.exec(
					"git",
					[
						"--no-optional-locks",
						"status",
						"--porcelain=v1",
						"--branch",
						"--untracked-files=normal",
					],
					{ cwd: ctx.sessionManager.getCwd(), timeout: 3000 },
				);
				gitTokens =
					result.code === 0 && !result.killed
						? parseGitStatusTokens(result.stdout)
						: "";
			} catch {
				gitTokens = "";
			} finally {
				gitInFlight = false;
				if (!disposed) tui.requestRender();
				if (gitQueued) {
					gitQueued = false;
					runGitStatus();
				}
			}
		})();
	};

	const refreshGit = () => {
		if (disposed) return;
		if (gitDebounce) clearTimeout(gitDebounce);
		gitDebounce = setTimeout(() => {
			gitDebounce = undefined;
			runGitStatus();
		}, 250);
	};

	const unsub = fd.onBranchChange(() => {
		gitTokens = "";
		refreshGit();
		tui.requestRender();
	});
	const gitInterval = setInterval(runGitStatus, 30000);
	live.requestRender = () => tui.requestRender();
	live.refreshGit = refreshGit;
	runGitStatus();

	return {
		dispose() {
			disposed = true;
			unsub();
			clearInterval(gitInterval);
			if (gitDebounce) clearTimeout(gitDebounce);
			live.requestRender = undefined;
			live.refreshGit = undefined;
		},
		render(width: number): string[] {
			const session = ctx.sessionManager;
			/* token stats — cost intentionally omitted */
			let inp = 0,
				out = 0,
				cr = 0,
				cw = 0;
			let hitRate: number | undefined;
			for (const e of session.getBranch()) {
				if (e.type === "message" && e.message.role === "assistant") {
					const msg = e.message as AssistantMessage;
					inp += msg.usage.input;
					out += msg.usage.output;
					cr += msg.usage.cacheRead;
					cw += msg.usage.cacheWrite;
					const prompt =
						msg.usage.input + msg.usage.cacheRead + msg.usage.cacheWrite;
					hitRate =
						prompt > 0 ? (msg.usage.cacheRead / prompt) * 100 : undefined;
				}
			}

			/* context usage */
			const cu = ctx.getContextUsage();
			const cw2 = cu?.contextWindow ?? ctx.model?.contextWindow ?? 0;
			const pct = cu?.percent ?? 0;
			const pctStr = cu?.percent !== null ? pct.toFixed(1) : "?";

			/* pwd / git */
			let pwd = fmtCwd(
				session.getCwd(),
				process.env.HOME || process.env.USERPROFILE,
			);
			const gitBranch = fd.getGitBranch();
			if (gitBranch)
				pwd = gitTokens
					? `${pwd} (${gitBranch} ${gitTokens})`
					: `${pwd} (${gitBranch})`;
			const sname = session.getSessionName();
			if (sname) pwd = `${pwd} • ${sname}`;

			/* stats line */
			const parts: string[] = [];
			if (inp) parts.push(`↑${fmtTok(inp)}`);
			if (out) parts.push(`↓${fmtTok(out)}`);
			if (cr) parts.push(`R${fmtTok(cr)}`);
			if (cw) parts.push(`W${fmtTok(cw)}`);
			if ((cr || cw) && hitRate !== undefined)
				parts.push(`CH${hitRate.toFixed(1)}%`);
			const ctxPctDisp =
				pctStr === "?" ? `?/${fmtTok(cw2)}` : `${pctStr}%/${fmtTok(cw2)}`;
			let ctxPctStr: string;
			if (pct > 90) ctxPctStr = theme.fg("error", ctxPctDisp);
			else if (pct > 70) ctxPctStr = theme.fg("warning", ctxPctDisp);
			else ctxPctStr = ctxPctDisp;
			parts.push(ctxPctStr);

			let left = parts.join(" ");
			let lw = visibleWidth(left);
			if (lw > width) left = truncateToWidth(left, width, "...");
			lw = visibleWidth(left);

			/* model / thinking — get thinking level from session entries (mirrors native footer) */
			const mName = ctx.model?.id || "no-model";
			let right = mName;
			if (ctx.model?.reasoning) {
				let tl = "off";
				// Walk session branch backwards for most recent thinking_level_change
				const branch = session.getBranch();
				for (let i = branch.length - 1; i >= 0; i--) {
					const e = branch[i];
					if (e.type === "thinking_level_change") {
						tl = (e as any).thinkingLevel || "off";
						break;
					}
				}
				right = tl === "off" ? `${mName} • thinking off` : `${mName} • ${tl}`;
			}
			const toolText = formatToolActivity(toolState);
			const toolColor =
				toolState.active.size > 0
					? "accent"
					: toolState.streaming
						? "dim"
						: "success";
			const toolSeg = toolText ? `${theme.fg(toolColor, toolText)}  ` : "";
			const rw =
				visibleWidth(right) + (toolText ? visibleWidth(toolText) + 2 : 0);

			const pad = width - lw - rw;
			let line2: string;
			if (pad >= 0) {
				line2 =
					theme.fg("dim", left) +
					" ".repeat(pad) +
					toolSeg +
					theme.fg("dim", right);
			} else if (width - lw - 2 > 0) {
				line2 =
					theme.fg("dim", left) +
					theme.fg(
						"dim",
						"  " +
							truncateToWidth(
								(toolText ? `${toolText}  ` : "") + right,
								width - lw - 2,
								"",
							),
					);
			} else {
				line2 = theme.fg("dim", left);
			}

			/* extension statuses */
			const extItems: string[] = [];
			const raw = fd.getExtensionStatuses();
			let mcpRgb = ""; // capture original MCP accent colour so theme changes work
			if (raw.size > 0) {
				const sorted = Array.from(raw.entries())
					.sort(([a], [b]) => (a as string).localeCompare(b as string))
					.map(([k, v]) => (v as string).trim())
					.filter(Boolean);
				extItems.push(...sorted);
			}

			// Extract original MCP accent RGB from the raw text before we strip colours
			const rawMcp = raw.get("mcp");
			if (rawMcp) {
				const m = (rawMcp as string).match(/\x1b\[38;2;(\d+);(\d+);(\d+)m/);
				if (m) mcpRgb = `\x1b[38;2;${m[1]};${m[2]};${m[3]}m`;
			}

			const lines: string[] = [
				truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "...")),
				line2,
			];
			if (extItems.length > 0) {
				let statusLine = extItems.join(" ");
				// Rewrite MCP: prefix with dim colour, reset after the colon
				statusLine = statusLine.replace(
					/MCP:/,
					`\x1b[38;2;128;128;128mMCP:${mcpRgb || "\x1b[38;2;138;190;183m"}`,
				);
				lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
			}

			return lines;
		},
	};
}

/* ------------------------------------------------------------------ */
/*  extension entry-point                                              */
/* ------------------------------------------------------------------ */

export default function (pi: ExtensionAPI) {
	const toolState: ToolActivityState = {
		active: new Map(),
		lastCompleted: undefined,
		streaming: false,
	};
	const live: LiveHooks = { requestRender: undefined, refreshGit: undefined };

	function applyFooter(ctx: any) {
		ctx.ui.setFooter((tui: any, theme: any, fd: any) =>
			makeFooter(ctx, tui, theme, fd, toolState, live),
		);
	}

	let enabled = readPersistedEnabled();

	pi.on("session_start", async (_event, ctx) => {
		enabled = readPersistedEnabled();
		toolState.active.clear();
		toolState.lastCompleted = undefined;
		toolState.streaming = false;
		if (enabled) applyFooter(ctx);
	});

	pi.on("tool_execution_start", (event: any) => {
		toolState.active.set(
			event.toolName,
			(toolState.active.get(event.toolName) ?? 0) + 1,
		);
		live.requestRender?.();
	});

	pi.on("tool_execution_end", (event: any) => {
		const n = toolState.active.get(event.toolName) ?? 0;
		if (n <= 1) toolState.active.delete(event.toolName);
		else toolState.active.set(event.toolName, n - 1);
		toolState.lastCompleted = event.toolName;
		live.requestRender?.();
		live.refreshGit?.();
	});

	pi.on("agent_start", () => {
		toolState.streaming = true;
		live.requestRender?.();
	});

	pi.on("agent_end", () => {
		toolState.streaming = false;
		live.requestRender?.();
		live.refreshGit?.();
	});

	pi.registerCommand("tf", {
		description: "Toggle pi-tidy-footer on / off",
		handler: async (_args: string, ctx: any) => {
			enabled = !enabled;
			writePersistedEnabled(enabled);

			if (enabled) {
				applyFooter(ctx);
				ctx.ui.notify("Cost-free footer ON", "info");
			} else {
				ctx.ui.setFooter(undefined);
				ctx.ui.notify("Default footer restored", "info");
			}
		},
	});
}
