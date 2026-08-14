/**
 * pi-tidy-footer — removes cost ($) from the built-in Pi footer.
 * Toggle with /tf. State persists across restarts.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const BALANCE_SYMBOL_OPTIONS: Record<string, string> = {
	"⛽": "⛽︎",
	"◎◉": "◎◉",
	"◉": "◉",
};

const FX_TTL_MS = 86_400_000;
const GIT_TIMEOUT_MS = 3000;
const GIT_DEBOUNCE_MS = 250;
const GIT_POLL_MS = 30_000;
const BALANCE_COOLDOWN_MS = 30_000;
const STATUS_MIN_MS = 150;
const FETCH_TIMEOUT_MS = 5000;
const BALANCE_FETCH_TIMEOUT_MS = 15_000;

/* ------------------------------------------------------------------ */
/*  persistence                                                        */
/* ------------------------------------------------------------------ */

const STATE_DIR = join(homedir(), ".pi", "agent", "extensions");
const STATE_FILE = join(STATE_DIR, "pi-tidy-footer-state.json");

let stateCache: Record<string, any> | null = null;

function loadState(): Record<string, any> {
	if (stateCache) return stateCache;
	try {
		stateCache = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
	} catch {
		stateCache = {};
	}
	return stateCache!;
}

function readState<T>(key: string, fallback: T): T {
	const raw = loadState();
	return raw?.[key] != null ? raw[key] : fallback;
}

function mergeState(patch: Record<string, any>): void {
	const prev = loadState();
	const next = { ...prev, ...patch };
	try {
		mkdirSync(STATE_DIR, { recursive: true });
		writeFileSync(STATE_FILE, JSON.stringify(next), "utf-8");
		Object.assign(prev, patch);
	} catch (e) {
		console.error("pi-tidy-footer: mergeState failed", e);
	}
}

function readPersistedEnabled(): boolean {
	return readState("enabled", true);
}

function writePersistedEnabled(enabled: boolean): void {
	mergeState({ enabled });
}

function readThresholds(): { warn: number; alert: number } {
	let w = readState<number>("balanceThresholdWarn", 4.14);
	let a = readState<number>("balanceThresholdAlert", 1.38);
	if (!Number.isFinite(w) || !Number.isFinite(a) || w <= a) {
		w = 4.14;
		a = 1.38;
	}
	return { warn: w, alert: a };
}

function writeThresholds(warn: number, alert: number): void {
	mergeState({ balanceThresholdWarn: warn, balanceThresholdAlert: alert });
}

function readCostThresholds(): { warn: number; alert: number } {
	let w = readState<number>("costThresholdWarn", 1);
	let a = readState<number>("costThresholdAlert", 3);
	if (!Number.isFinite(w) || !Number.isFinite(a) || w >= a) {
		w = 1;
		a = 3;
	}
	return { warn: w, alert: a };
}

function writeCostThresholds(warn: number, alert: number): void {
	mergeState({ costThresholdWarn: warn, costThresholdAlert: alert });
}

function readWrapEnabled(): boolean {
	return readState("wrapEnabled", false);
}

function writeWrapEnabled(wrap: boolean): void {
	mergeState({ wrapEnabled: wrap });
}

function readExtensionOrder(): string[] {
	return readState("extensionOrder", [
		"caveman",
		"ponytail",
		"mcp",
		"pi-lens-lsp",
	]);
}

function writeExtensionOrder(order: string[]): void {
	mergeState({ extensionOrder: order });
}

function readCostCurrency(): string {
	const ccy = readState("costCurrency", "");
	return CURRENCIES[ccy] ? ccy : "USD";
}

function writeCostCurrency(ccy: string): void {
	mergeState({ costCurrency: ccy });
}

function readBalanceSymbol(): string {
	return readState("balanceSymbol", "⛽");
}

function readBalanceSymbolList(): string[] {
	return readState<string[]>("balanceSymbols", []);
}

function writeBalanceSymbolList(syms: string[]): void {
	mergeState({ balanceSymbols: syms });
}

function getEffectiveSymbols(): string[] {
	const result = [...Object.keys(BALANCE_SYMBOL_OPTIONS)];
	const custom = readBalanceSymbolList();
	const seen = new Set(result);
	for (const s of custom) {
		if (!seen.has(s)) result.push(s);
		seen.add(s);
	}
	return result;
}

function writeBalanceSymbol(sym: string): void {
	mergeState({ balanceSymbol: sym });
}

function readFxCache(): {
	rates: Record<string, number>;
	fetchedAt: number;
} | null {
	const cache = readState<any>("fxCache", null);
	if (cache?.rates && cache?.fetchedAt) return cache;
	return null;
}

function writeFxCache(cache: {
	rates: Record<string, number>;
	fetchedAt: number;
}): void {
	mergeState({ fxCache: cache });
}

function getApiKey(provider: string): string | undefined {
	try {
		return (JSON.parse(readFileSync(AUTH_PATH, "utf-8")) as any)[provider]?.key;
	} catch (e) {
		console.error("pi-tidy-footer: getApiKey failed", e);
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
		parse: (data) => safeBalance(data?.balance_infos?.[0]?.total_balance),
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
		parse: (data) => safeBalance(data?.data?.total_credits),
	},
	siliconflow: {
		url: "https://api.siliconflow.cn/v1/user/info",
		currency: "CNY",
		parse: (data) => safeBalance(data?.data?.balance),
	},
	zhipu: {
		url: "https://open.bigmodel.cn/api/paas/v4/account/billing",
		currency: "CNY",
		parse: (data) => safeBalance(data?.balance),
	},
};

const BALANCE_PROVIDER_KEYS = new Set(Object.keys(BALANCE_PROVIDERS));

function safeBalance(v: unknown): string | undefined {
	const n = Number(v);
	return Number.isFinite(n) ? n.toFixed(2) : undefined;
}

async function fetchBalance(
	provider: string,
	key: string,
): Promise<string | undefined> {
	const cfg = BALANCE_PROVIDERS[provider];
	if (!cfg) return undefined;
	const resp = await fetch(cfg.url, {
		headers: { Authorization: `Bearer ${key}` },
		signal: AbortSignal.timeout(BALANCE_FETCH_TIMEOUT_MS),
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
): number | undefined {
	if (ccy === "USD") return 1;
	return rates?.[ccy.toLowerCase()] ?? undefined;
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
	if (!rel.startsWith("..") && !isAbsolute(rel))
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
	const info = CURRENCIES[ccy] ?? CURRENCIES.USD;
	if (rate === undefined) {
		return { text: `${info.symbol}--`, color: "dim" };
	}
	const hasCost =
		model.cost?.input != null ||
		model.cost?.output != null ||
		model.cost?.cacheRead != null ||
		model.cost?.cacheWrite != null;
	const cost = hasCost
		? (inp / 1_000_000) * (model.cost?.input ?? 0) +
			(out / 1_000_000) * (model.cost?.output ?? 0) +
			(cr / 1_000_000) * (model.cost?.cacheRead ?? 0) +
			(cw / 1_000_000) * (model.cost?.cacheWrite ?? 0)
		: undefined;
	if (cost === undefined) {
		return {
			text: `${info.symbol}--`,
			color: "dim",
		};
	}
	const local = cost * rate;
	const tWarn = costThresholds.warn * rate;
	const tAlert = costThresholds.alert * rate;
	const color = thresholdColor(local, tWarn, tAlert, "higher");
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

function thresholdColor(
	value: number,
	warn: number,
	alert: number,
	direction: "higher" | "lower",
): string {
	if (direction === "higher") {
		return value > alert ? "error" : value > warn ? "warning" : "dim";
	}
	return value < alert ? "error" : value < warn ? "warning" : "dim";
}

interface ToolActivityState {
	active: Map<string, number>;
	minDisplayQueue: string[];
	minDisplayTimer: ReturnType<typeof setTimeout> | undefined;
}

interface LiveHooks {
	requestRender: (() => void) | undefined;
	refreshGit: (() => void) | undefined;
	refreshBalance: (() => void) | undefined;
	getThinkingLevel: (() => string) | undefined;
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
	balanceSymbol: string,
) {
	let disposed = false;
	let gitTokens = "";
	let gitInFlight = false;
	let gitQueued = false;
	let gitRetryCount = 0;
	let gitDebounce: ReturnType<typeof setTimeout> | undefined;
	let balanceText = "";
	let balanceProvider = "";
	let balanceStale = false;
	let balanceLastFetch = 0;
	let balanceInFlight = false;

	let cachedExtItems: [string, string][] | null = null;
	let lastRawStatuses = "";
	let cachedMcpRgb = "";

	const wrapEnabled = readWrapEnabled();

	const costCurrency = readCostCurrency();
	let fxCache = readFxCache();

	const refreshFx = () => {
		if (disposed) return;
		if (fxCache && Date.now() - fxCache.fetchedAt <= FX_TTL_MS) return;
		void (async () => {
			try {
				const resp = await fetch(
					"https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json",
					{ signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
				);
				const data = (await resp.json()) as any;
				const rates: Record<string, number> = data?.usd ?? {};
				delete rates.date;
				if (Object.keys(rates).length === 0) return;
				fxCache = { rates, fetchedAt: Date.now() };
				writeFxCache(fxCache);
				if (!disposed) tui.requestRender();
			} catch (e) {
				console.error("pi-tidy-footer: refreshFx failed", e);
				/* keep old cache */
			}
		})();
	};

	if (!fxCache) {
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
					{ cwd: ctx.sessionManager.getCwd(), timeout: GIT_TIMEOUT_MS },
				);
				gitTokens =
					result.code === 0 && !result.killed
						? parseGitStatusTokens(result.stdout)
						: "";
				gitRetryCount = 0;
			} catch {
				gitTokens = "";
			} finally {
				gitInFlight = false;
				if (!disposed) tui.requestRender();
				if (gitQueued) {
					gitQueued = false;
					if (gitRetryCount < 3) {
						gitRetryCount++;
						runGitStatus();
					}
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
		}, GIT_DEBOUNCE_MS);
	};

	const unsub = fd.onBranchChange(() => {
		gitTokens = "";
		refreshGit();
		tui.requestRender();
	});
	const gitInterval = setInterval(runGitStatus, GIT_POLL_MS);
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
			now - balanceLastFetch < BALANCE_COOLDOWN_MS &&
			balanceProvider === provider
		) {
			// still fresh
			return;
		}
		balanceProvider = provider;
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
					balanceLastFetch = now;
					balanceText = `${balanceSymbol}${value}`;
					balanceStale = false;
				} else {
					balanceText = "";
					balanceProvider = "";
				}
			} catch (e) {
				console.error("pi-tidy-footer: fetchBalance failed", e);
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
			live.getThinkingLevel = undefined;
		},
		render(width: number): string[] {
			try {
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
					pctStr === "?"
						? `?/${fmtTok(ctxWin)}`
						: `${pctStr}%/${fmtTok(ctxWin)}`;
				const ctxPctStr = theme.fg("dim", ctxPctDisp);
				parts.push(ctxPctStr);
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

				let left = parts.join(" ");
				let lw = visibleWidth(left);
				if (lw > width) left = truncateToWidth(left, width, "...");
				lw = visibleWidth(left);

				/* model / thinking */
				const mName = ctx.model?.id || "no-model";
				let right = mName;
				if (ctx.model?.reasoning) {
					const tl = live.getThinkingLevel?.() ?? "off";
					right = tl === "off" ? `${mName} • thinking off` : `${mName} • ${tl}`;
				}
				const toolText = formatToolActivity(toolState);
				const toolSeg = toolText ? `${theme.fg("accent", toolText)}  ` : "";
				const balanceTextVal = balanceText;
				const balanceProviderVal = ctx.model?.provider;
				let balanceSeg = "";
				if (
					balanceTextVal &&
					balanceProviderVal === balanceProvider &&
					fxCache
				) {
					const rawNum = Number.parseFloat(
						balanceTextVal.slice(balanceSymbol.length),
					);
					const srcCcy = BALANCE_PROVIDERS[balanceProvider]?.currency;
					let displayNum = rawNum;
					const rate = ccyRate(costCurrency, fxCache?.rates);
					if (rate === undefined) {
						balanceSeg = "";
					} else {
						if (srcCcy && costCurrency !== srcCcy) {
							const srcRate = ccyRate(srcCcy, fxCache?.rates);
							if (srcRate !== undefined) {
								displayNum = (rawNum / srcRate) * rate;
							}
						}
						const tWarn = thresholds.warn * rate;
						const tAlert = thresholds.alert * rate;
						const color = !Number.isFinite(displayNum)
							? "dim"
							: thresholdColor(displayNum, tWarn, tAlert, "lower");
						const info = CURRENCIES[costCurrency] ?? CURRENCIES.USD;
						const displayPrefix =
							(BALANCE_SYMBOL_OPTIONS[balanceSymbol] ?? balanceSymbol) + " ";
						const formatted = Number.isFinite(displayNum)
							? `${displayPrefix}${info.symbol}${displayNum.toFixed(info.decimals)}`
							: `${displayPrefix}${info.symbol}--`;
						balanceSeg = `  ${theme.fg(color, formatted + (balanceStale ? "?" : ""))}`;
					}
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

				/* extension statuses — cache with serialized comparison */
				const raw = fd.getExtensionStatuses();
				const currentRaw = JSON.stringify([...raw.entries()]);
				if (currentRaw !== lastRawStatuses) {
					cachedExtItems = [];
					cachedMcpRgb = "";
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
								let s = v.trim();
								if (k === "caveman") {
									s = s
										.replace("caveman level:", "Caveman:")
										.replace(/(FULL|ULTRA|LITE|OFF)/g, (w) => w.toLowerCase());
								} else if (k === "ponytail") {
									s = s
										.replace("⚡ ", "")
										.replace(/(FULL|ULTRA|LITE|OFF)/g, (w) => w.toLowerCase());
								}
								return [
									k,
									s.replace(/(\p{Extended_Pictographic})\s+/gu, "$1"),
								] as [string, string];
							});
						cachedExtItems.push(...sorted);
					}
					// Extract original MCP accent RGB from raw text before we strip colours
					const rawMcp = raw.get("mcp");
					if (rawMcp) {
						const m = (rawMcp as string).match(/\x1b\[38;2;(\d+);(\d+);(\d+)m/);
						if (m) cachedMcpRgb = `\x1b[38;2;${m[1]};${m[2]};${m[3]}m`;
					}
					lastRawStatuses = currentRaw;
				}
				const extItems = cachedExtItems!;
				const mcpRgb = cachedMcpRgb;

				const lines: string[] = [
					truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "...")),
					line2,
				];
				if (extItems.length > 0) {
					function formatMcpItem(t: string): string {
						return t
							.replace("servers ", "")
							.replace(
								/MCP:/,
								`\x1b[38;2;128;128;128mMCP:${mcpRgb || "\x1b[38;2;138;190;183m"}`,
							);
					}
					if (wrapEnabled) {
						let current = "";
						for (const [, text] of extItems) {
							const seg = formatMcpItem(text);
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
							lines.push(
								truncateToWidth(current, width, theme.fg("dim", "...")),
							);
						} else if (current) {
							lines.push(current);
						}
					} else {
						const statusLine = extItems
							.map(([, t]) => formatMcpItem(t))
							.join(" ");
						lines.push(
							truncateToWidth(statusLine, width, theme.fg("dim", "...")),
						);
					}
				}

				return lines;
			} catch (e) {
				console.error("pi-tidy-footer: render failed", e);
				return ["pi-tidy-footer: render failed"];
			}
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
		getThinkingLevel: undefined,
	};

	function applyFooter(ctx: any) {
		const thresholds = readThresholds();
		const costThresholds = readCostThresholds();
		const extensionOrder = readExtensionOrder();
		const balanceSymbol = readBalanceSymbol();
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
				balanceSymbol,
			),
		);
	}

	function getCurrentRate(): number | undefined {
		const ccy = readCostCurrency();
		return ccyRate(ccy, readFxCache()?.rates);
	}

	function guardEnabled(fn: (args: string, ctx: any) => Promise<void>) {
		return async (args: string, ctx: any) => {
			if (!enabled) {
				ctx.ui.notify(
					"Command unavailable: pi-tidy-footer disabled. Use /tf to enable.",
					"info",
				);
				return;
			}
			return fn(args, ctx);
		};
	}

	let enabled = readPersistedEnabled();

	pi.on("session_start", async (_event: any, ctx: any) => {
		enabled = readPersistedEnabled();
		toolState.active.clear();
		toolState.minDisplayQueue.length = 0;
		if (toolState.minDisplayTimer) clearTimeout(toolState.minDisplayTimer);
		toolState.minDisplayTimer = undefined;
		if (enabled) applyFooter(ctx);
		live.getThinkingLevel = () => pi.getThinkingLevel?.() ?? "off";
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
			if (!toolState.minDisplayQueue.includes(event.toolName)) {
				toolState.minDisplayQueue.push(event.toolName);
			}
			if (toolState.minDisplayTimer) clearTimeout(toolState.minDisplayTimer);
			toolState.minDisplayTimer = setTimeout(() => {
				toolState.minDisplayQueue = [];
				toolState.minDisplayTimer = undefined;
				live.requestRender?.();
			}, STATUS_MIN_MS);
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

	pi.on("thinking_level_select", () => {
		live.requestRender?.();
	});

	pi.on("turn_end", () => {
		live.refreshBalance?.();
	});

	pi.registerCommand("tf", {
		description: "Toggle pi-tidy-footer ENABLED/DISABLED",
		handler: async (_args: string, ctx: any) => {
			enabled = !enabled;
			writePersistedEnabled(enabled);

			if (enabled) {
				applyFooter(ctx);
				ctx.ui.notify("Tidy footer: ENABLED", "info");
			} else {
				ctx.ui.setFooter(undefined);
				ctx.ui.notify(
					"Tidy footer: DISABLED. Config saved, /tf to re-enable.",
					"info",
				);
			}
		},
	});

	pi.registerCommand("sc", {
		description:
			"Currency for balance and cost: /sc <code> = set; no args = show",
		handler: guardEnabled(async (args: string, ctx: any) => {
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
				ctx.ui.notify(
					`Invalid currency: "${ccy}". Available: ${list}`,
					"error",
				);
				return;
			}
			writeCostCurrency(ccy);
			if (enabled) applyFooter(ctx);
			ctx.ui.notify(
				`Currency: ${ccy} (${CURRENCIES[ccy].symbol}). You may want to adjust balance (/bt) and cost (/ct) thresholds.`,
				"info",
			);
		}),
	});

	function thresholdCommand(opts: {
		cmd: string;
		label: string;
		comparison: ">" | "<";
		direction: "greater" | "less";
		readFn: () => { warn: number; alert: number };
		writeFn: (w: number, a: number) => void;
		defaults: { warn: number; alert: number };
	}): (args: string, ctx: any) => Promise<void> {
		return guardEnabled(async (args: string, ctx: any) => {
			const parts = args.trim().split(/\s+/);
			if (!args.trim()) {
				const t = opts.readFn();
				const ccy = readCostCurrency();
				const rate = getCurrentRate();
				if (rate === undefined) {
					ctx.ui.notify("FX rate unavailable, try again later.", "info");
					return;
				}
				ctx.ui.notify(
					`${opts.label}: yellow ${opts.comparison} ${(t.warn * rate).toFixed(2)}, red ${opts.comparison} ${(t.alert * rate).toFixed(2)} (${ccy})`,
					"info",
				);
				return;
			}
			const warn = Number(parts[0]);
			const alert = Number(parts[1]);
			const invalid =
				parts.length !== 2 ||
				!Number.isFinite(warn) ||
				!Number.isFinite(alert) ||
				(opts.direction === "greater" ? warn <= alert : warn >= alert);
			if (invalid) {
				const ccy = readCostCurrency();
				const rate = getCurrentRate();
				if (rate === undefined) {
					ctx.ui.notify("FX rate unavailable, try again later.", "error");
					return;
				}
				ctx.ui.notify(
					`Usage: /${opts.cmd} <warn> <alert> — warn must be ${opts.direction} than alert. Default: ${(opts.defaults.warn * rate).toFixed(2)} ${(opts.defaults.alert * rate).toFixed(2)} (${ccy})`,
					"error",
				);
				return;
			}
			const ccy = readCostCurrency();
			const rate = getCurrentRate();
			if (rate === undefined) {
				ctx.ui.notify("FX rate unavailable, try again later.", "info");
				return;
			}
			opts.writeFn(warn / rate, alert / rate);
			if (enabled) applyFooter(ctx);
			ctx.ui.notify(
				`${opts.label}: yellow ${opts.comparison} ${warn}, red ${opts.comparison} ${alert} (${ccy})`,
				"info",
			);
		});
	}

	pi.registerCommand("bt", {
		description:
			"Balance thresholds: <warn> <alert> = set (warn > alert); no args = show",
		handler: thresholdCommand({
			cmd: "bt",
			label: "Balance thresholds",
			comparison: "<",
			direction: "greater",
			readFn: readThresholds,
			writeFn: writeThresholds,
			defaults: { warn: 4.14, alert: 1.38 },
		}),
	});

	pi.registerCommand("bs", {
		description:
			"Balance symbol: no args = cycle; <symbol> = set; -d <symbol> = delete",
		handler: guardEnabled(async (args: string, ctx: any) => {
			if (args.startsWith("-d ")) {
				let sym = args.replace(/^-d\s+/, "");
				if (sym.startsWith('"') && sym.endsWith('"')) {
					sym = sym.slice(1, -1);
				}
				if (!sym) {
					ctx.ui.notify("Usage: /bs -d <symbol>", "error");
					return;
				}
				const custom = readBalanceSymbolList();
				const idx = custom.indexOf(sym);
				if (idx === -1) {
					ctx.ui.notify(
						`Invalid symbol: "${sym}". Use /bs -l to list available symbols.`,
						"error",
					);
					return;
				}
				custom.splice(idx, 1);
				writeBalanceSymbolList(custom);
				if (readBalanceSymbol() === sym) {
					writeBalanceSymbol("⛽");
				}
				if (enabled) applyFooter(ctx);
				const display = sym.endsWith(" ")
					? sym.trimEnd() + " (with trailing space)"
					: sym;
				ctx.ui.notify(`Deleted symbol: ${display}`, "info");
				return;
			}
			if (args.trim() === "-l") {
				const keys = getEffectiveSymbols();
				ctx.ui.notify(
					`Balance Symbols: ${keys.map((k) => BALANCE_SYMBOL_OPTIONS[k] ?? k).join(" ")}`,
					"info",
				);
				return;
			}
			const trimmed = args.trim();
			if (!trimmed) {
				const keys = getEffectiveSymbols();
				const current = readBalanceSymbol();
				const idx = keys.indexOf(current);
				const next = keys[(idx + 1) % keys.length];
				writeBalanceSymbol(next);
				if (enabled) applyFooter(ctx);
				const display = BALANCE_SYMBOL_OPTIONS[next] ?? next;
				ctx.ui.notify(`Balance symbol: ${display}`, "info");
			} else {
				let sym = args;
				if (
					args.length >= 2 &&
					args[0] === '"' &&
					args[args.length - 1] === '"'
				) {
					sym = args.slice(1, -1);
				}
				const custom = readBalanceSymbolList();
				if (!custom.includes(sym)) {
					custom.push(sym);
					writeBalanceSymbolList(custom);
				}
				writeBalanceSymbol(sym);
				if (enabled) applyFooter(ctx);
				const display = BALANCE_SYMBOL_OPTIONS[sym] ?? sym;
				ctx.ui.notify(`Balance symbol: ${display}`, "info");
			}
		}),
	});

	pi.registerCommand("ct", {
		description:
			"Cost thresholds: <warn> <alert> = set (warn < alert); no args = show",
		handler: thresholdCommand({
			cmd: "ct",
			label: "Cost thresholds",
			comparison: ">",
			direction: "less",
			readFn: readCostThresholds,
			writeFn: writeCostThresholds,
			defaults: { warn: 1, alert: 3 },
		}),
	});

	pi.registerCommand("es", {
		description: "Extension sort: keys = set order; no args = show order",
		handler: guardEnabled(async (args: string, ctx: any) => {
			const trimmed = args.trim();
			if (!trimmed) {
				const current = readExtensionOrder();
				ctx.ui.notify(`Current order: ${current.join(" ")}`, "info");
				return;
			}
			const keys = trimmed.split(/\s+/);
			// ponytail: keys silently accepted, unknown keys sorted to end
			writeExtensionOrder(keys);
			if (enabled) applyFooter(ctx);
			ctx.ui.notify(`Order set to: ${keys.join(" ")}`, "info");
		}),
	});

	pi.registerCommand("ew", {
		description: "Toggle extension wrap ON/OFF",
		handler: guardEnabled(async (_args: string, ctx: any) => {
			const next = !readWrapEnabled();
			writeWrapEnabled(next);
			if (enabled) applyFooter(ctx);
			ctx.ui.notify(
				next ? "Extension wrap: ON" : "Extension wrap: OFF",
				"info",
			);
		}),
	});
}
