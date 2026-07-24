/**
 * pi-tidy-footer — removes cost ($) from the built-in Pi footer.
 * Toggle with /tf. State persists across restarts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const AUTH_PATH = join(homedir(), ".pi", "agent", "auth.json");

const CURRENCIES: Record<string, { symbol: string; decimals: number }> = {
	AUD: { symbol: "A$", decimals: 2 },
	CAD: { symbol: "C$", decimals: 2 },
	EUR: { symbol: "€", decimals: 2 },
	GBP: { symbol: "£", decimals: 2 },
	JPY: { symbol: "¥", decimals: 0 },
	KRW: { symbol: "₩", decimals: 0 },
	USD: { symbol: "$", decimals: 3 },
	CNY: { symbol: "¥", decimals: 2 },
	HKD: { symbol: "HK$", decimals: 2 },
	TWD: { symbol: "NT$", decimals: 2 },
};

const CCY_LIST = Object.keys(CURRENCIES).join(" ");

/* ------------------------------------------------------------------ */
/*  persistence                                                        */
/* ------------------------------------------------------------------ */

const STATE_DIR = join(homedir(), ".pi", "agent", "extensions");
const STATE_FILE = join(STATE_DIR, "pi-tidy-footer-state.json");

function readPersistedEnabled(): boolean {
	try {
		return JSON.parse(readFileSync(STATE_FILE, "utf-8")).enabled !== false;
	} catch {
		return true;
	}
}

function readThresholds(): { warn: number; alert: number } {
	try {
		const raw = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
		let w = Number(raw?.balanceThresholdWarn);
		let a = Number(raw?.balanceThresholdAlert);
		if (!Number.isFinite(w) || !Number.isFinite(a) || w <= a) {
			w = 4.14;
			a = 1.38;
		}
		return { warn: w, alert: a };
	} catch {
		return { warn: 4.14, alert: 1.38 };
	}
}

function writeThresholds(warn: number, alert: number): void {
	try {
		const prev: any = existsSync(STATE_FILE)
			? JSON.parse(readFileSync(STATE_FILE, "utf-8"))
			: {};
		mkdirSync(STATE_DIR, { recursive: true });
		writeFileSync(
			STATE_FILE,
			JSON.stringify({
				...prev,
				balanceThresholdWarn: warn,
				balanceThresholdAlert: alert,
			}),
			"utf-8",
		);
	} catch {
		/* no-op */
	}
}

function readCostThresholds(): { warn: number; alert: number } {
	try {
		const raw = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
		let w = Number(raw?.costThresholdWarn);
		let a = Number(raw?.costThresholdAlert);
		if (!Number.isFinite(w) || !Number.isFinite(a) || w >= a) {
			w = 1;
			a = 3;
		}
		return { warn: w, alert: a };
	} catch {
		return { warn: 1, alert: 3 };
	}
}

function writeCostThresholds(warn: number, alert: number): void {
	try {
		const prev: any = existsSync(STATE_FILE)
			? JSON.parse(readFileSync(STATE_FILE, "utf-8"))
			: {};
		mkdirSync(STATE_DIR, { recursive: true });
		writeFileSync(
			STATE_FILE,
			JSON.stringify({
				...prev,
				costThresholdWarn: warn,
				costThresholdAlert: alert,
			}),
			"utf-8",
		);
	} catch {
		/* no-op */
	}
}

function writePersistedEnabled(enabled: boolean): void {
	try {
		const prev: any = existsSync(STATE_FILE)
			? JSON.parse(readFileSync(STATE_FILE, "utf-8"))
			: {};
		mkdirSync(STATE_DIR, { recursive: true });
		writeFileSync(STATE_FILE, JSON.stringify({ ...prev, enabled }), "utf-8");
	} catch {
		/* no-op */
	}
}

function readWrapEnabled(): boolean {
	try {
		return JSON.parse(readFileSync(STATE_FILE, "utf-8")).wrapEnabled === true;
	} catch {
		return false;
	}
}

function writeWrapEnabled(wrap: boolean): void {
	try {
		const prev: any = existsSync(STATE_FILE)
			? JSON.parse(readFileSync(STATE_FILE, "utf-8"))
			: {};
		mkdirSync(STATE_DIR, { recursive: true });
		writeFileSync(
			STATE_FILE,
			JSON.stringify({ ...prev, wrapEnabled: wrap }),
			"utf-8",
		);
	} catch {
		/* no-op */
	}
}

function readExtensionOrder(): string[] {
	const fallback = ["caveman", "ponytail", "mcp", "pi-lens-lsp"];
	try {
		const raw = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
		return Array.isArray(raw?.extensionOrder) ? raw.extensionOrder : fallback;
	} catch {
		return fallback;
	}
}

function writeExtensionOrder(order: string[]): void {
	try {
		const prev: any = existsSync(STATE_FILE)
			? JSON.parse(readFileSync(STATE_FILE, "utf-8"))
			: {};
		mkdirSync(STATE_DIR, { recursive: true });
		writeFileSync(
			STATE_FILE,
			JSON.stringify({ ...prev, extensionOrder: order }),
			"utf-8",
		);
	} catch {
		/* no-op */
	}
}

function readShowCost(): boolean {
	try {
		return JSON.parse(readFileSync(STATE_FILE, "utf-8")).showCost !== false;
	} catch {
		return true;
	}
}

function writeShowCost(show: boolean): void {
	try {
		const prev: any = existsSync(STATE_FILE)
			? JSON.parse(readFileSync(STATE_FILE, "utf-8"))
			: {};
		mkdirSync(STATE_DIR, { recursive: true });
		writeFileSync(
			STATE_FILE,
			JSON.stringify({ ...prev, showCost: show }),
			"utf-8",
		);
	} catch {
		/* no-op */
	}
}

function readCostCurrency(): string {
	try {
		const raw = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
		return CURRENCIES[raw?.costCurrency] ? raw.costCurrency : "USD";
	} catch {
		return "USD";
	}
}

function writeCostCurrency(ccy: string): void {
	try {
		const prev: any = existsSync(STATE_FILE)
			? JSON.parse(readFileSync(STATE_FILE, "utf-8"))
			: {};
		mkdirSync(STATE_DIR, { recursive: true });
		writeFileSync(
			STATE_FILE,
			JSON.stringify({ ...prev, costCurrency: ccy }),
			"utf-8",
		);
	} catch {
		/* no-op */
	}
}

function readFxCache(): {
	rates: Record<string, number>;
	fetchedAt: number;
} | null {
	try {
		const cache = JSON.parse(readFileSync(STATE_FILE, "utf-8")).fxCache;
		if (cache?.rates && cache?.fetchedAt) return cache;
		return null;
	} catch {
		return null;
	}
}

function writeFxCache(cache: {
	rates: Record<string, number>;
	fetchedAt: number;
}): void {
	try {
		const prev: any = existsSync(STATE_FILE)
			? JSON.parse(readFileSync(STATE_FILE, "utf-8"))
			: {};
		mkdirSync(STATE_DIR, { recursive: true });
		writeFileSync(
			STATE_FILE,
			JSON.stringify({ ...prev, fxCache: cache }),
			"utf-8",
		);
	} catch {
		/* no-op */
	}
}

function getApiKey(provider: string): string | undefined {
	try {
		return (JSON.parse(readFileSync(AUTH_PATH, "utf-8")) as any)[provider]?.key;
	} catch {
		return undefined;
	}
}

const BALANCE_PROVIDERS: Record<
	string,
	{ url: string; currency: string; parse: (data: any) => string | undefined }
> = {
	deepseek: {
		url: "https://api.deepseek.com/user/balance",
		currency: "CNY",
		parse: (data) => {
			const v = data?.balance_infos?.[0]?.total_balance;
			return v != null ? parseFloat(v).toFixed(2) : undefined;
		},
	},
	"moonshotai-cn": {
		url: "https://api.moonshot.cn/v1/users/me/balance",
		currency: "CNY",
		parse: (data) => {
			const bal = data?.data;
			const cash = Number.parseFloat(bal?.cash_balance ?? "");
			const voucher = Number.parseFloat(bal?.voucher_balance ?? "");
			const available = Number.parseFloat(bal?.available_balance ?? "");
			const raw =
				Number.isNaN(cash) || Number.isNaN(voucher)
					? Number.isNaN(available)
						? undefined
						: available
					: cash + voucher;
			return raw === undefined ? undefined : raw.toFixed(2);
		},
	},
	openrouter: {
		url: "https://openrouter.ai/api/v1/credits",
		currency: "USD",
		parse: (data) => {
			const v = data?.data?.total_credits;
			return v != null ? parseFloat(v).toFixed(2) : undefined;
		},
	},
	siliconflow: {
		url: "https://api.siliconflow.cn/v1/user/info",
		currency: "CNY",
		parse: (data) => {
			const v = data?.data?.balance;
			return v != null ? parseFloat(v).toFixed(2) : undefined;
		},
	},
	zhipu: {
		url: "https://open.bigmodel.cn/api/paas/v4/account/billing",
		currency: "CNY",
		parse: (data) => {
			const v = data?.balance;
			return v != null ? parseFloat(v).toFixed(2) : undefined;
		},
	},
};

const BALANCE_PROVIDER_KEYS = new Set(Object.keys(BALANCE_PROVIDERS));

async function fetchBalance(
	provider: string,
	key: string,
): Promise<string | undefined> {
	const cfg = BALANCE_PROVIDERS[provider];
	if (!cfg) return undefined;
	const resp = await fetch(cfg.url, {
		headers: { Authorization: `Bearer ${key}` },
	});
	if (!resp.ok) return undefined;
	const data = (await resp.json()) as any;
	return cfg.parse(data);
}

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */

function ccyRate(
	ccy: string,
	rates: Record<string, number> | null | undefined,
): number {
	if (ccy === "USD") return 1;
	return rates?.[ccy.toLowerCase()] ?? 1;
}

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

function fmtCost(
	inp: number,
	out: number,
	cr: number,
	cw: number,
	model: any,
	ccy: string,
	fx: Record<string, number> | null,
	costThresholds: { warn: number; alert: number },
): { text: string; color: string } {
	const rate = ccyRate(ccy, fx);
	const cost =
		(inp / 1_000_000) * (model.cost?.input ?? 0) +
		(out / 1_000_000) * (model.cost?.output ?? 0) +
		(cr / 1_000_000) * (model.cost?.cacheRead ?? 0) +
		(cw / 1_000_000) * (model.cost?.cacheWrite ?? 0);
	const local = cost * rate;
	const info = CURRENCIES[ccy] ?? CURRENCIES.USD;
	const tWarn = costThresholds.warn * rate;
	const tAlert = costThresholds.alert * rate;
	const color = local > tAlert ? "error" : local > tWarn ? "warning" : "dim";
	return {
		text: `${info.symbol}${local.toFixed(info.decimals)}`,
		color,
	};
}

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
	minDisplayQueue: string[];
	minDisplayTimer: ReturnType<typeof setTimeout> | undefined;
}

interface LiveHooks {
	requestRender: (() => void) | undefined;
	refreshGit: (() => void) | undefined;
	refreshBalance: (() => void) | undefined;
}

function formatToolActivity(state: ToolActivityState): string {
	const active = [...state.active.entries()];
	if (active.length > 0) {
		const [name, count] = active[0];
		const suffix =
			count > 1
				? `×${count}`
				: active.length > 1
					? `+${active.length - 1}`
					: "";
		return `⚙ ${name}${suffix}`;
	}
	// hold the last finished tool briefly to prevent flicker
	if (state.minDisplayQueue.length > 0) {
		const name = state.minDisplayQueue.at(-1) ?? "tool";
		return `⚙ ${name}`;
	}
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
	thresholds: { warn: number; alert: number },
	costThresholds: { warn: number; alert: number },
	extensionOrder: string[],
) {
	let disposed = false;
	let gitTokens = "";
	let gitInFlight = false;
	let gitQueued = false;
	let gitDebounce: ReturnType<typeof setTimeout> | undefined;
	let balanceText = "";
	let balanceProvider = "";
	let balanceStale = false;
	let balanceLastFetch = 0;
	let balanceInFlight = false;

	const wrapEnabled = readWrapEnabled();

	const showCost = readShowCost();
	const costCurrency = readCostCurrency();
	let fxCache = readFxCache();

	const refreshFx = () => {
		if (disposed) return;
		void (async () => {
			try {
				const resp = await fetch(
					"https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json",
				);
				const data = (await resp.json()) as any;
				const rates: Record<string, number> = data?.usd ?? {};
				delete rates.date;
				if (Object.keys(rates).length === 0) return;
				fxCache = { rates, fetchedAt: Date.now() };
				writeFxCache(fxCache);
				if (!disposed) tui.requestRender();
			} catch {
				/* keep old cache */
			}
		})();
	};

	if (!fxCache || Date.now() - fxCache.fetchedAt > 86_400_000) {
		refreshFx();
	}

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

	const runBalance = () => {
		if (disposed) return;
		const provider = ctx.model?.provider;
		if (!BALANCE_PROVIDER_KEYS.has(provider)) {
			balanceText = "";
			balanceProvider = "";
			balanceStale = false;
			tui.requestRender();
			return;
		}
		const now = Date.now();
		if (
			balanceLastFetch > 0 &&
			now - balanceLastFetch < 30_000 &&
			balanceProvider === provider
		) {
			// still fresh
			return;
		}
		balanceProvider = provider;
		balanceLastFetch = now;
		if (balanceInFlight) return;
		const key = getApiKey(provider);
		if (!key) return;
		balanceInFlight = true;
		void (async () => {
			try {
				const value = await fetchBalance(provider, key);
				if (disposed || ctx.model?.provider !== provider) {
					balanceText = "";
					balanceProvider = "";
				} else if (value !== undefined) {
					balanceText = `¤¥${value}`;
					balanceStale = false;
				} else {
					balanceText = "";
					balanceProvider = "";
				}
			} catch {
				if (!disposed && ctx.model?.provider === provider) {
					if (balanceText) balanceStale = true;
					else {
						balanceText = "";
						balanceProvider = "";
					}
				}
			} finally {
				balanceInFlight = false;
				if (!disposed) tui.requestRender();
			}
		})();
	};
	live.refreshBalance = runBalance;
	if (!balanceText) runBalance();

	return {
		dispose() {
			disposed = true;
			unsub();
			clearInterval(gitInterval);
			if (gitDebounce) clearTimeout(gitDebounce);
			live.requestRender = undefined;
			live.refreshGit = undefined;
			live.refreshBalance = undefined;
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
			const ctxWin = cu?.contextWindow ?? ctx.model?.contextWindow ?? 0;
			const pct = cu?.percent ?? 0;
			const pctStr = cu?.percent != null ? pct.toFixed(1) : "?";

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
				pctStr === "?" ? `?/${fmtTok(ctxWin)}` : `${pctStr}%/${fmtTok(ctxWin)}`;
			const ctxPctStr = theme.fg("dim", ctxPctDisp);
			parts.push(ctxPctStr);
			if (showCost) {
				const result = fmtCost(
					inp,
					out,
					cr,
					cw,
					ctx.model,
					costCurrency,
					fxCache?.rates ?? null,
					costThresholds,
				);
				parts.push(theme.fg(result.color, result.text));
			}

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
			const toolSeg = toolText ? `${theme.fg("accent", toolText)}  ` : "";
			const balanceTextVal = balanceText;
			const balanceProviderVal = ctx.model?.provider;
			let balanceSeg = "";
			if (balanceTextVal && balanceProviderVal === balanceProvider) {
				const rawNum = Number.parseFloat(balanceTextVal.slice(2));
				const srcCcy = BALANCE_PROVIDERS[balanceProvider]?.currency;
				let displayNum = rawNum;
				const rate = ccyRate(costCurrency, fxCache?.rates);
				if (srcCcy && costCurrency !== srcCcy && fxCache) {
					const srcRate = ccyRate(srcCcy, fxCache?.rates);
					displayNum = (rawNum / srcRate) * rate;
				}
				const tWarn = thresholds.warn * rate;
				const tAlert = thresholds.alert * rate;
				const color = !Number.isFinite(displayNum)
					? "dim"
					: displayNum < tAlert
						? "error"
						: displayNum < tWarn
							? "warning"
							: "dim";
				const info = CURRENCIES[costCurrency] ?? CURRENCIES.USD;
				const formatted = Number.isFinite(displayNum)
					? `${info.symbol}${displayNum.toFixed(info.decimals)}`
					: `${info.symbol}--`;
				balanceSeg = `  ${theme.fg(color, formatted + (balanceStale ? "?" : ""))}`;
			}
			const rw =
				visibleWidth(right) +
				(toolText ? visibleWidth(toolText) + 2 : 0) +
				visibleWidth(balanceSeg);

			const pad = width - lw - rw;
			let line2: string;
			if (pad >= 0) {
				line2 =
					theme.fg("dim", left) +
					" ".repeat(pad) +
					toolSeg +
					theme.fg("dim", right) +
					balanceSeg;
			} else if (width - lw - 2 > 0) {
				line2 =
					theme.fg("dim", left) +
					theme.fg(
						"dim",
						"  " +
							truncateToWidth(
								(toolText ? `${toolText}  ` : "") + right + balanceSeg,
								width - lw - 2,
								"",
							),
					);
			} else {
				line2 = theme.fg("dim", left);
			}

			/* extension statuses — keep key for grouped wrapping */
			const extItems: [string, string][] = [];
			const raw = fd.getExtensionStatuses();
			let mcpRgb = ""; // capture original MCP accent colour so theme changes work
			if (raw.size > 0) {
				const order = new Map<string, number>();
				extensionOrder.forEach((key, i) => order.set(key, i));
				const sorted = (Array.from(raw.entries()) as [string, string][])
					.filter(([, v]) => v.trim())
					.sort(([a], [b]) => {
						const oa = order.get(a) ?? 99;
						const ob = order.get(b) ?? 99;
						return oa !== ob ? oa - ob : a.localeCompare(b);
					})
					.map(([k, v]) => {
						if (k === "caveman") {
							const s = v
								.replace("caveman level:", "Caveman:")
								.replace(/(FULL|ULTRA|LITE|OFF)/g, (w) => w.toLowerCase());
							return [k, s] as [string, string];
						}
						if (k === "ponytail") {
							const s = v
								.replace("⚡ ", "")
								.replace(/(FULL|ULTRA|LITE|OFF)/g, (w) => w.toLowerCase())
								.replace(
									" 🐴 \x1b[38;2;128;128;128mponytail:",
									" 🐴\x1b[38;2;128;128;128mponytail:",
								);
							return [k, s] as [string, string];
						}
						return [k, v.trim()] as [string, string];
					});
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
				if (wrapEnabled) {
					let current = "";
					for (const [, text] of extItems) {
						// MCP colour rewrite
						const seg = text.replace(
							/MCP:/,
							`\x1b[38;2;128;128;128mMCP:${mcpRgb || "\x1b[38;2;138;190;183m"}`,
						);
						const test = current ? `${current} ${seg}` : seg;
						if (visibleWidth(test) > width) {
							if (current) lines.push(current);
							current = seg;
						} else {
							current = test;
						}
					}
					// ponytail: last-resort truncation only if a single entry exceeds terminal width
					if (current && visibleWidth(current) > width) {
						lines.push(truncateToWidth(current, width, theme.fg("dim", "...")));
					} else if (current) {
						lines.push(current);
					}
				} else {
					const statusLine = extItems
						.map(([, t]) =>
							t.replace(
								/MCP:/,
								`\x1b[38;2;128;128;128mMCP:${mcpRgb || "\x1b[38;2;138;190;183m"}`,
							),
						)
						.join(" ");
					lines.push(
						truncateToWidth(statusLine, width, theme.fg("dim", "...")),
					);
				}
			}

			return lines;
		},
	};
}

/* ------------------------------------------------------------------ */
/*  extension entry-point                                              */
/* ------------------------------------------------------------------ */

export default function (pi: any) {
	const toolState: ToolActivityState = {
		active: new Map(),
		minDisplayQueue: [],
		minDisplayTimer: undefined,
	};
	const live: LiveHooks = {
		requestRender: undefined,
		refreshGit: undefined,
		refreshBalance: undefined,
	};

	function applyFooter(ctx: any) {
		const thresholds = readThresholds();
		const costThresholds = readCostThresholds();
		const extensionOrder = readExtensionOrder();
		ctx.ui.setFooter((tui: any, theme: any, fd: any) =>
			makeFooter(
				ctx,
				tui,
				theme,
				fd,
				toolState,
				live,
				thresholds,
				costThresholds,
				extensionOrder,
			),
		);
	}

	let enabled = readPersistedEnabled();

	pi.on("session_start", async (_event: any, ctx: any) => {
		enabled = readPersistedEnabled();
		toolState.active.clear();
		toolState.minDisplayQueue.length = 0;
		if (toolState.minDisplayTimer) clearTimeout(toolState.minDisplayTimer);
		toolState.minDisplayTimer = undefined;
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
		// minimum 150ms display so fast tools don't flicker
		if (!toolState.active.has(event.toolName)) {
			toolState.minDisplayQueue.push(event.toolName);
			if (!toolState.minDisplayTimer) {
				toolState.minDisplayTimer = setTimeout(() => {
					toolState.minDisplayQueue = [];
					toolState.minDisplayTimer = undefined;
					live.requestRender?.();
				}, 150);
			}
		} else {
			toolState.minDisplayQueue = toolState.minDisplayQueue.filter(
				(q) => q !== event.toolName,
			);
		}
		live.requestRender?.();
		live.refreshGit?.();
	});

	pi.on("agent_start", () => {
		live.requestRender?.();
	});

	pi.on("agent_end", () => {
		live.requestRender?.();
		live.refreshGit?.();
	});

	pi.on("model_select", () => {
		live.refreshBalance?.();
	});

	pi.on("turn_end", () => {
		live.refreshBalance?.();
	});

	pi.registerCommand("bt", {
		description:
			"Set balance thresholds: warn (yellow) / alert (red), warn > alert",
		handler: async (args: string, ctx: any) => {
			const parts = args.trim().split(/\s+/);
			if (!args.trim()) {
				const t = readThresholds();
				const ccy = readCostCurrency();
				const fxCache = readFxCache();
				const rate = ccyRate(ccy, fxCache?.rates);
				ctx.ui.notify(
					`Balance thresholds: yellow < ${(t.warn * rate).toFixed(2)}, red < ${(t.alert * rate).toFixed(2)} (${ccy})`,
					"info",
				);
				return;
			}
			const warn = Number(parts[0]);
			const alert = Number(parts[1]);
			if (
				parts.length !== 2 ||
				!Number.isFinite(warn) ||
				!Number.isFinite(alert) ||
				warn <= alert
			) {
				const ccy = readCostCurrency();
				const fxCache = readFxCache();
				const rate = ccyRate(ccy, fxCache?.rates);
				ctx.ui.notify(
					`Usage: /bt <warn> <alert> (warn > alert). Default: ${(4.14 * rate).toFixed(2)} ${(1.38 * rate).toFixed(2)} (${ccy})`,
					"error",
				);
				return;
			}
			const ccy = readCostCurrency();
			const fxCache = readFxCache();
			const rate = ccyRate(ccy, fxCache?.rates);
			writeThresholds(warn / rate, alert / rate);
			if (enabled) applyFooter(ctx);
			ctx.ui.notify(
				`Balance thresholds: yellow < ${warn}, red < ${alert} (${ccy})`,
				"info",
			);
		},
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

	pi.registerCommand("ew", {
		description: "Toggle extension wrap (on/off)",
		handler: async (_args: string, ctx: any) => {
			const next = !readWrapEnabled();
			writeWrapEnabled(next);
			if (enabled) applyFooter(ctx);
			ctx.ui.notify(
				next ? "Extension wrap ON" : "Extension wrap OFF (truncate)",
				"info",
			);
		},
	});

	pi.registerCommand("es", {
		description: "Extension sort (no args = show order, keys = set order)",
		handler: async (args: string, ctx: any) => {
			const trimmed = args.trim();
			if (!trimmed) {
				const current = readExtensionOrder();
				ctx.ui.notify(`Extension order: ${current.join(" ")}`, "info");
				return;
			}
			const keys = trimmed.split(/\s+/);
			writeExtensionOrder(keys);
			if (enabled) applyFooter(ctx);
			ctx.ui.notify(`Extension order: ${keys.join(" ")}`, "info");
		},
	});

	pi.registerCommand("cd", {
		description: "Cost display toggle (on/off)",
		handler: async (_args: string, ctx: any) => {
			const next = !readShowCost();
			writeShowCost(next);
			if (enabled) applyFooter(ctx);
			ctx.ui.notify(next ? "Cost ON" : "Cost OFF", "info");
		},
	});

	pi.registerCommand("cc", {
		description: "Cost currency (no args = list, code = set)",
		handler: async (args: string, ctx: any) => {
			const ccy = args.trim().toUpperCase();
			if (!ccy) {
				const current = readCostCurrency();
				const list = CCY_LIST;
				ctx.ui.notify(
					`Currency: ${current} (${CURRENCIES[current]?.symbol ?? "$"}). Available: ${list}`,
					"info",
				);
				return;
			}
			if (!CURRENCIES[ccy]) {
				const list = CCY_LIST;
				ctx.ui.notify(`Unknown currency: ${ccy}. Available: ${list}`, "error");
				return;
			}
			writeCostCurrency(ccy);
			if (enabled) applyFooter(ctx);
			ctx.ui.notify(
				`Currency: ${ccy} (${CURRENCIES[ccy].symbol}). You may want to adjust balance (/bt) and cost (/ct) thresholds.`,
				"info",
			);
		},
	});

	pi.registerCommand("ct", {
		description:
			"Cost threshold (no args = show, <warn> <alert> = set, warn < alert)",
		handler: async (args: string, ctx: any) => {
			const parts = args.trim().split(/\s+/);
			if (!args.trim()) {
				const t = readCostThresholds();
				const ccy = readCostCurrency();
				const fxCache = readFxCache();
				const rate = ccyRate(ccy, fxCache?.rates);
				ctx.ui.notify(
					`Cost thresholds: yellow > ${(t.warn * rate).toFixed(2)}, red > ${(t.alert * rate).toFixed(2)} (${ccy})`,
					"info",
				);
				return;
			}
			const warn = Number(parts[0]);
			const alert = Number(parts[1]);
			if (
				parts.length !== 2 ||
				!Number.isFinite(warn) ||
				!Number.isFinite(alert) ||
				warn >= alert
			) {
				const ccy = readCostCurrency();
				const fxCache = readFxCache();
				const rate = ccyRate(ccy, fxCache?.rates);
				ctx.ui.notify(
					`Usage: /ct <warn> <alert> (warn < alert). Default: ${(1 * rate).toFixed(2)} ${(3 * rate).toFixed(2)} (${ccy})`,
					"error",
				);
				return;
			}
			const ccy = readCostCurrency();
			const fxCache = readFxCache();
			const rate = ccyRate(ccy, fxCache?.rates);
			writeCostThresholds(warn / rate, alert / rate);
			if (enabled) applyFooter(ctx);
			ctx.ui.notify(
				`Cost thresholds: yellow > ${warn}, red > ${alert} (${ccy})`,
				"info",
			);
		},
	});
}
