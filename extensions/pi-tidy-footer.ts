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
		/* no‑op */
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
/*  footer factory                                                     */
/* ------------------------------------------------------------------ */

function makeFooter(ctx: any, tui: any, theme: any, fd: any) {
	const unsub = fd.onBranchChange(() => tui.requestRender());
	return {
		dispose: unsub,
		render(width: number): string[] {
			const session = ctx.sessionManager;
			const m = ctx.model;

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
			const cw2 = cu?.contextWindow ?? m?.contextWindow ?? 0;
			const pct = cu?.percent ?? 0;
			const pctStr = cu?.percent !== null ? pct.toFixed(1) : "?";

			/* pwd / git */
			let pwd = fmtCwd(
				session.getCwd(),
				process.env.HOME || process.env.USERPROFILE,
			);
			const branch = fd.getGitBranch();
			if (branch) pwd = `${pwd} (${branch})`;
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

			/* model / thinking */
			const mName = m?.id || "no-model";
			let right = mName;
			if (m?.reasoning) {
				const tl = m?.thinkingLevel || "off";
				right = tl === "off" ? `${mName} • thinking off` : `${mName} • ${tl}`;
			}
			const rw = visibleWidth(right);

			const pad = width - lw - rw;
			const statsLine =
				pad >= 0
					? left + " ".repeat(pad) + right
					: width - lw - 2 > 0
						? left + "  " + truncateToWidth(right, width - lw - 2, "")
						: left;

			/* extension statuses */
			const extItems: string[] = [];
			const raw = fd.getExtensionStatuses();
			if (raw.size > 0) {
				const sorted = Array.from(raw.entries())
					.sort(([a], [b]) => (a as string).localeCompare(b as string))
					.map(([, v]) => (v as string).trim())
					.filter(Boolean);
				extItems.push(...sorted);
			}

			const lines: string[] = [
				truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "...")),
				theme.fg("dim", statsLine.slice(0, lw)) +
					theme.fg("dim", statsLine.slice(lw)),
			];
			if (extItems.length > 0)
				lines.push(
					truncateToWidth(extItems.join(" "), width, theme.fg("dim", "...")),
				);

			return lines;
		},
	};
}

/* ------------------------------------------------------------------ */
/*  extension entry-point                                              */
/* ------------------------------------------------------------------ */

export default function (pi: ExtensionAPI) {
	function applyFooter(ctx: any) {
		ctx.ui.setFooter((tui: any, theme: any, fd: any) =>
			makeFooter(ctx, tui, theme, fd),
		);
	}

	let enabled = readPersistedEnabled();

	pi.on("session_start", async (_event, ctx) => {
		enabled = readPersistedEnabled();
		if (enabled) applyFooter(ctx);
	});

	pi.registerCommand("tf", {
		description: "Toggle cost‑free footer on / off",
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
