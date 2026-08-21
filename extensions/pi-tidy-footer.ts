/**
 * pi-tidy-footer — tidy, extended footer for Pi: token cost/balance with
 * currency conversion, extension display control (sort/wrap/rules), git
 * status, tool activity. Toggle with /tf. State persists across restarts.
 */

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
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
const FX_RETRY_MS = 60_000;
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
const MCP_CONFIG_PATH = join(homedir(), ".config", "mcp", "mcp.json");
// default user transformers dir (user-editable, never overwritten by updates)
const DEFAULT_TRANSFORMERS_DIR = join(
	homedir(),
	".pi",
	"agent",
	"extensions",
	"pi-tidy-footer",
	"ed",
);

/** Configured user transformers dir (override via /edt dir). */
function readTransformersDir(): string {
	const d = readState<string>("transformersDir", "");
	return d && d.trim() ? resolve(d) : DEFAULT_TRANSFORMERS_DIR;
}

function writeTransformersDir(dir: string): boolean {
	return mergeState({ transformersDir: dir });
}

// package dir: resolve the real path of this extension file (symlink → real
// project path) and use its directory. import.meta.url points at the symlink
// location when pi loads it, so we must resolve the symlink.
const PACKAGE_DIR = dirname(realpathSync(fileURLToPath(import.meta.url)));

/* ------------------------------------------------------------------ */
/*  transformers — builtin (ships with package) + user (user dir)      */
/* ------------------------------------------------------------------ */

interface TransformContext {
	raw: string;
	plain: string;
	theme: PiTheme;
}

interface StatusTransformer {
	transform(
		key: string,
		value: string,
		ctx: TransformContext,
	): string | null | undefined;
}

/* ------------------------------------------------------------------ */
/*  pi runtime shapes — typed from actual call sites; optionality      */
/*  follows runtime facts (model may be missing at session_start)     */
/* ------------------------------------------------------------------ */

interface PiTheme {
	fg(color: string, text: string): string;
}

interface PiTui {
	requestRender(): void;
}

interface PiFd {
	getExtensionStatuses(): Map<string, string>;
	getGitBranch(): string | undefined;
	onBranchChange(cb: () => void): () => void;
}

interface PiModel {
	id?: string;
	provider?: string;
	reasoning?: boolean;
	contextWindow?: number;
	cost?: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
}

interface BranchEntry {
	type: string;
	message?: { role: string } & Partial<AssistantMessage>;
}

interface PiCtx {
	ui: {
		setFooter(
			fn:
				| ((
						tui: PiTui,
						theme: PiTheme,
						fd: PiFd,
				  ) => {
						render(width: number): string[];
						dispose(): void;
				  })
				| undefined,
		): void;
		notify(message: string, kind?: string): void;
	};
	sessionManager: {
		getCwd(): string;
		getSessionName(): string;
		getBranch(): BranchEntry[];
	};
	model?: PiModel;
	exec(
		cmd: string,
		args: string[],
		opts: { cwd: string; timeout: number },
	): Promise<{ code: number; killed: boolean; stdout: string }>;
	getContextUsage(): { percent?: number; contextWindow?: number } | undefined;
}

interface PiApi {
	on(event: string, cb: (event: { toolName: string }, ctx: PiCtx) => void): void;
	registerCommand(
		name: string,
		def: {
			description: string;
			handler: (args: string, ctx: PiCtx) => Promise<void>;
		},
	): void;
	getThinkingLevel?(): string;
}

/**
 * Ensure the user transformers dir and eduser.ts exist. eduser.ts is copied
 * from the shipped template on first run; it is never overwritten afterwards
 * so user edits survive extension updates.
 */
async function ensureUserTfFile(): Promise<void> {
	try {
		const userFile = join(readTransformersDir(), "eduser.ts");
		if (existsSync(userFile)) return;
		mkdirSync(readTransformersDir(), { recursive: true });
		const templatePath = join(PACKAGE_DIR, "ed", "eduser.ts");
		if (existsSync(templatePath)) {
			copyFileSync(templatePath, userFile);
		} else {
			// fallback: inline minimal template
			writeFileSync(userFile, "export const user = {};\n", "utf-8");
		}
	} catch (e) {
		console.error("pi-tidy-footer: ensureUserTfFile failed", e);
	}
}

/**
 * Normalize a transformer export into a StatusTransformer record.
 * Accepts the object form keyed by extension name.
 */
function coerceTransformerMap(
	exportObj: unknown,
): Record<string, StatusTransformer> {
	if (exportObj && typeof exportObj === "object" && !Array.isArray(exportObj)) {
		return exportObj as Record<string, StatusTransformer>;
	}
	return {};
}

/**
 * Read the builtin transformers from the shipped package file
 * (extensions/ed/ed.ts). Always active; updates with releases.
 */
async function readTidyBuiltin(): Promise<Record<
	string,
	StatusTransformer
> | null> {
	try {
		const url =
			"file://" +
			join(PACKAGE_DIR, "ed", "ed.ts")
				.split(sep)
				.map(encodeURIComponent)
				.join("/") +
			`?t=${Date.now()}`;
		const mod = await import(url);
		return coerceTransformerMap((mod as any)?.builtin);
	} catch (e) {
		console.error("pi-tidy-footer: readTidyBuiltin failed", e);
		return null;
	}
}

/**
 * Read the user transformers from the user dir (eduser.ts). Active only when
 * transformer mode is on. User transformers override builtins by key.
 */
async function readTidyUser(): Promise<Record<
	string,
	StatusTransformer
> | null> {
	try {
		const userFile = join(readTransformersDir(), "eduser.ts");
		const url =
			"file://" +
			userFile.split(sep).map(encodeURIComponent).join("/") +
			`?t=${Date.now()}`;
		const mod = await import(url);
		return coerceTransformerMap((mod as any)?.user);
	} catch (e) {
		console.error("pi-tidy-footer: readTidyUser failed", e);
		return null;
	}
}

let stateCache: Record<string, any> | null = null;

function loadState(): Record<string, any> {
	if (stateCache) return stateCache;
	try {
		stateCache = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
	} catch (e: any) {
		if (e?.code === "ENOENT") {
			// first run — no state file yet; silent
			stateCache = {};
		} else {
			// corrupted state — keep evidence, then start fresh
			try {
				const ts = new Date().toISOString().replace(/[:.]/g, "-");
				copyFileSync(STATE_FILE, `${STATE_FILE}.bak.${ts}`);
				console.error(
					`pi-tidy-footer: bad state backed up to ${STATE_FILE}.bak.${ts}`,
				);
			} catch {
				/* backup failed — nothing more to do */
			}
			stateCache = {};
		}
	}
	return stateCache!;
}

function readState<T>(key: string, fallback: T): T {
	const raw = loadState();
	return raw?.[key] == null ? fallback : raw[key];
}

/**
 * Persist a patch atomically (tmp + rename — the target file never sees a
 * half-written JSON). Returns false when the write failed; on failure the
 * in-memory cache keeps the last known-good value and nothing is applied.
 */
function mergeState(patch: Record<string, any>): boolean {
	const prev = loadState();
	const next = { ...prev, ...patch };
	try {
		mkdirSync(STATE_DIR, { recursive: true });
		const tmp = STATE_FILE + ".tmp";
		writeFileSync(tmp, JSON.stringify(next), "utf-8");
		existsSync(tmp) && renameSync(tmp, STATE_FILE);
		Object.assign(prev, patch);
		return true;
	} catch (e) {
		console.error("pi-tidy-footer: mergeState failed", e);
		return false;
	}
}

/* ------------------------------------------------------------------ */
/*  transformers — builtin (package) + user (user dir)                */
/* ------------------------------------------------------------------ */

/** Transformer mode: off (default) = /ed commands control display; on = user transformers take over. */
function readTransformerMode(): boolean {
	return readState("transformerMode", false);
}

function writeTransformerMode(on: boolean): boolean {
	return mergeState({ transformerMode: on });
}

/** Disabled transformer keys (via /edt d), persisted. */
function readDisabledTransformerKeys(): string[] {
	return readState<string[]>("disabledTransformerKeys", []);
}

function writeDisabledTransformerKeys(keys: string[]): boolean {
	return mergeState({ disabledTransformerKeys: keys });
}

// Builtin transformers read from the package (extensions/ed/ed.ts),
// always active. Populated at session_start; updated with releases.
let tidyBuiltin: Record<string, StatusTransformer> = {};

// User transformers read from the user dir (eduser.ts), active only when
// transformerMode is on. User transformers override builtins by key.
let tidyUser: Record<string, StatusTransformer> = {};

// Disabled transformer keys (via /edt d). Populated at session_start.
let disabledTransformerKeys: Set<string> = new Set();

/* ------------------------------------------------------------------ */

function readPersistedEnabled(): boolean {
	return readState("enabled", true);
}

function writePersistedEnabled(enabled: boolean): boolean {
	return mergeState({ enabled });
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

function writeThresholds(warn: number, alert: number): boolean {
	return mergeState({
		balanceThresholdWarn: warn,
		balanceThresholdAlert: alert,
	});
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

function writeCostThresholds(warn: number, alert: number): boolean {
	return mergeState({ costThresholdWarn: warn, costThresholdAlert: alert });
}

function readWrapEnabled(): boolean {
	return readState("wrapEnabled", false);
}

function writeWrapEnabled(wrap: boolean): boolean {
	return mergeState({ wrapEnabled: wrap });
}

function readEmojiHidden(): boolean {
	return readState("emojiHidden", false);
}

function writeEmojiHidden(hidden: boolean): boolean {
	return mergeState({ emojiHidden: hidden });
}

function readExtensionOrder(): string[] {
	return readState("extensionOrder", [
		"caveman",
		"ponytail",
		"mcp",
		"pi-lens-lsp",
	]);
}

function writeExtensionOrder(order: string[]): boolean {
	return mergeState({ extensionOrder: order });
}

function readTransformRules(): Record<
	string,
	{ hide?: boolean; rewrite?: [string, string] }
> {
	return readState("transformRules", {});
}

function writeTransformRules(
	rules: Record<string, { hide?: boolean; rewrite?: [string, string] }>,
): boolean {
	return mergeState({ transformRules: rules });
}

/**
 * Clear all pi-tidy-footer config for clean uninstall.
 * Backs up a corrupted state file before wiping it (evidence preservation).
 */
function resetAllConfig(): { ok: boolean; msg: string } {
	if (!existsSync(STATE_FILE)) {
		return { ok: true, msg: "No config to clear." };
	}
	try {
		const content = readFileSync(STATE_FILE, "utf-8");
		try {
			JSON.parse(content);
		} catch {
			// corrupted — back up the raw bytes before wiping
			const ts = new Date().toISOString().replace(/[:.]/g, "-");
			const bak = `${STATE_FILE}.bak.${ts}`;
			copyFileSync(STATE_FILE, bak);
			console.error(`pi-tidy-footer: bad state backed up to ${bak}`);
			writeFileSync(STATE_FILE, "{}", "utf-8");
			stateCache = {};
			return {
				ok: true,
				msg: `Invalid config backed up to ${bak} and cleared.`,
			};
		}
		writeFileSync(STATE_FILE, "{}", "utf-8");
		stateCache = {};
		return { ok: true, msg: "All config cleared." };
	} catch (e) {
		console.error("pi-tidy-footer: resetAllConfig failed", e);
		return { ok: false, msg: "Failed to clear config. See logs." };
	}
}

/**
 * Inject `settings.mcpFooterStatus = "compact"` into mcp-adapter's config
 * (mcp.json). Only touches the settings object; preserves everything else.
 * Returns true when the config now has compact set (either just written or
 * already present).
 */
function ensureMcpCompact(): { ok: boolean; msg: string } {
	return mutateMcpConfig((cfg) => {
		const settings = (cfg.settings ??= {});
		if (settings.mcpFooterStatus === "compact") {
			return { ok: true, msg: "mcpFooterStatus already compact." };
		}
		settings.mcpFooterStatus = "compact";
		return { ok: true, msg: "mcpFooterStatus set to compact." };
	});
}

/**
 * Remove the injected `mcpFooterStatus` from mcp.json (restore default full).
 * Called by /fcl for clean uninstall.
 */
function removeMcpCompact(): { ok: boolean; msg: string } {
	return mutateMcpConfig((cfg) => {
		const settings = cfg.settings;
		if (!settings || settings.mcpFooterStatus === undefined) {
			return { ok: true, msg: "No mcpFooterStatus to restore." };
		}
		delete settings.mcpFooterStatus;
		return {
			ok: true,
			msg: "mcpFooterStatus removed (default full restored).",
		};
	});
}

/**
 * Read mcp.json, run a mutation on it, persist when the mutation changes it.
 */
function mutateMcpConfig(
	mutate: (cfg: Record<string, any>) => {
		ok: boolean;
		msg: string;
		changed?: boolean;
	},
): { ok: boolean; msg: string } {
	if (!existsSync(MCP_CONFIG_PATH)) {
		return { ok: false, msg: `mcp.json not found: ${MCP_CONFIG_PATH}` };
	}
	try {
		const content = readFileSync(MCP_CONFIG_PATH, "utf-8");
		let cfg: Record<string, any>;
		try {
			cfg = JSON.parse(content);
		} catch {
			return { ok: false, msg: "mcp.json is corrupted; not touching it." };
		}
		if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
			return { ok: false, msg: "mcp.json has invalid shape; not touching it." };
		}
		const result = mutate(cfg);
		if (result.ok && result.changed !== false) {
			writeFileSync(MCP_CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
		}
		return result;
	} catch (e) {
		console.error("pi-tidy-footer: mutateMcpConfig failed", e);
		return { ok: false, msg: "Failed to write mcp.json. See logs." };
	}
}

function readCostCurrency(): string {
	const ccy = readState("costCurrency", "");
	return CURRENCIES[ccy] ? ccy : "USD";
}

function writeCostCurrency(ccy: string): boolean {
	return mergeState({ costCurrency: ccy });
}

function readBalanceSymbol(): string {
	return readState("balanceSymbol", "⛽");
}

function readBalanceSymbolList(): string[] {
	return readState<string[]>("balanceSymbols", []);
}

function writeBalanceSymbolList(syms: string[]): boolean {
	return mergeState({ balanceSymbols: syms });
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

function writeBalanceSymbol(sym: string): boolean {
	return mergeState({ balanceSymbol: sym });
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

/**
 * Strip ANSI escape codes (used to build the `plain` field for transformers).
 */
export function stripAnsi(s: string): string {
	return s.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Expand a user pattern so ANSI colour codes between literal characters are
 * transparent (matched but not part of the replacement). Regex metacharacters
 * and escape sequences are left untouched. The transparent group is
 * non-greedy so a trailing reset code after the match survives the rewrite.
 */
export function colorblindPattern(pattern: string): string {
	const META = new Set("()[]{}^$.*+?|");
	let out = "";
	let inClass = false;
	for (let i = 0; i < pattern.length; i++) {
		const ch = pattern[i];
		if (inClass) {
			out += ch;
			if (ch === "]") inClass = false;
			continue;
		}
		if (ch === "[") {
			out += ch;
			inClass = true;
			continue;
		}
		if (ch === "\\") {
			out += ch + (pattern[i + 1] ?? "");
			i++;
			continue;
		}
		if (META.has(ch)) {
			out += ch;
			continue;
		}
		out += ch + "(?:\\x1b\\[[0-9;]*m)*?";
	}
	return out;
}

/**
 * Apply one rewrite rule to text: regex match → replacement template
 * ({1} {2}... = captured groups). Returns original text on no match or
 * invalid regex. When `transparent` is true, user patterns match across
 * ANSI colour codes (colourblind). Default rules pass transparent=false.
 */
export function applyRewrite(
	s: string,
	rule: { hide?: boolean; rewrite?: [string, string] },
	transparent = false,
): string {
	if (!rule?.rewrite) return s;
	const [pattern, replacement] = rule.rewrite;
	try {
		const re = new RegExp(transparent ? colorblindPattern(pattern) : pattern);
		const m = s.match(re);
		if (m) {
			let out = replacement;
			for (let i = 1; i < m.length; i++) {
				out = out.split(`{${i}}`).join(m[i] ?? "");
			}
			return s.replace(re, out);
		}
	} catch {
		/* invalid regex — keep original */
	}
	return s;
}

/**
 * Split command args into tokens, stripping surrounding double quotes
 * ("a b" stays one token). Empty tokens are dropped.
 */
export function parseArgs(args: string): string[] {
	return (args.match(/("[^"]*"|\S+)/g) ?? [])
		.map((s) =>
			s.length >= 2 && s[0] === '"' && s.at(-1) === '"' ? s.slice(1, -1) : s,
		)
		.filter(Boolean);
}

export function fmtTok(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

export function fmtCwd(cwd: string, home: string | undefined): string {
	if (!home) return cwd;
	const rc = resolve(cwd);
	const rh = resolve(home);
	const rel = relative(rh, rc);
	if (!rel.startsWith("..") && !isAbsolute(rel))
		return rel === "" ? "~" : `~${sep}${rel}`;
	return cwd;
}

export function parseGitStatusTokens(stdout: string): string {
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

function ccyRate(
	ccy: string,
	rates: Record<string, number> | null | undefined,
): number | undefined {
	if (ccy === "USD") return 1;
	return rates?.[ccy.toLowerCase()] ?? undefined;
}

function fmtCost(
	inp: number,
	out: number,
	cr: number,
	cw: number,
	model: PiModel | undefined,
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
		model?.cost?.input != null ||
		model?.cost?.output != null ||
		model?.cost?.cacheRead != null ||
		model?.cost?.cacheWrite != null;
	const cost = hasCost
		? (inp / 1_000_000) * (model?.cost?.input ?? 0) +
			(out / 1_000_000) * (model?.cost?.output ?? 0) +
			(cr / 1_000_000) * (model?.cost?.cacheRead ?? 0) +
			(cw / 1_000_000) * (model?.cost?.cacheWrite ?? 0)
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
			count > 1 ? `×${count}` : active.length > 1 ? `+${active.length - 1}` : "";
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
	ctx: PiCtx,
	tui: PiTui,
	theme: PiTheme,
	fd: PiFd,
	toolState: ToolActivityState,
	live: LiveHooks,
	thresholds: { warn: number; alert: number },
	costThresholds: { warn: number; alert: number },
	extensionOrder: string[],
	balanceSymbol: string,
	userRules: Record<string, { hide?: boolean; rewrite?: [string, string] }>,
) {
	let disposed = false;
	let gitTokens = "";
	let gitInFlight = false;
	let gitQueued = false;
	let gitRetryCount = 0;
	let gitDebounce: ReturnType<typeof setTimeout> | undefined;
	let fxRetryTimer: ReturnType<typeof setTimeout> | undefined;
	let balanceText = "";
	let balanceProvider = "";
	let balanceStale = false;
	let balanceLastFetch = 0;
	let balanceInFlight = false;

	let cachedExtItems: [string, string][] | null = null;
	let lastRawStatuses = "";
	let cachedMcpRgb = "";

	const wrapEnabled = readWrapEnabled();
	const emojiHidden = readEmojiHidden();

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
				// empty payload is a failure too — route through catch for retry
				if (Object.keys(rates).length === 0) throw new Error("empty fx rates");
				fxCache = { rates, fetchedAt: Date.now() };
				writeFxCache(fxCache);
				if (!disposed) tui.requestRender();
			} catch (e) {
				console.error("pi-tidy-footer: refreshFx failed", e);
				// recovery retry (not a polling loop): schedule one retry after
				// FX_RETRY_MS; stops as soon as the fetch succeeds
				if (!disposed && !fxRetryTimer) {
					fxRetryTimer = setTimeout(() => {
						fxRetryTimer = undefined;
						refreshFx();
					}, FX_RETRY_MS);
				}
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
				if (result.code === 0 && !result.killed) gitRetryCount = 0;
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
		if (!provider || !BALANCE_PROVIDER_KEYS.has(provider)) {
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
				} else if (value === undefined) {
					balanceText = "";
					balanceProvider = "";
				} else {
					balanceLastFetch = now;
					balanceText = `${balanceSymbol}${value}`;
					balanceStale = false;
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
			if (fxRetryTimer) clearTimeout(fxRetryTimer);
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
					if (e.type === "message" && e.message?.role === "assistant") {
						const msg = e.message as AssistantMessage;
						const u = msg.usage;
						inp += u?.input ?? 0;
						out += u?.output ?? 0;
						cr += u?.cacheRead ?? 0;
						cw += u?.cacheWrite ?? 0;
						const prompt =
							(u?.input ?? 0) + (u?.cacheRead ?? 0) + (u?.cacheWrite ?? 0);
						hitRate = prompt > 0 ? ((u?.cacheRead ?? 0) / prompt) * 100 : undefined;
					}
				}

				/* context usage */
				const cu = ctx.getContextUsage();
				const ctxWin = cu?.contextWindow ?? ctx.model?.contextWindow ?? 0;
				const pct = cu?.percent ?? 0;
				const pctStr = cu?.percent == null ? "?" : pct.toFixed(1);

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
				if (balanceTextVal && balanceProviderVal === balanceProvider && fxCache) {
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
						const color = Number.isFinite(displayNum)
							? thresholdColor(displayNum, tWarn, tAlert, "lower")
							: "dim";
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
				lastSeenExtStatuses = new Map([...raw.entries()]);
				lastSeenExtKeys = [...lastSeenExtStatuses.keys()];
				const currentRaw = JSON.stringify([...raw.entries()]);
				if (currentRaw !== lastRawStatuses) {
					cachedExtItems = [];
					cachedMcpRgb = "";
					if (raw.size > 0) {
						const order = new Map<string, number>();
						extensionOrder.forEach((key, i) => order.set(key, i));
						const tm = readTransformerMode();
						const sorted = (Array.from(raw.entries()) as [string, string][])
							.filter(([k, v]) => {
								if (!v.trim()) return false;
								// hide only applies in /ed mode; transformer mode freezes /ed rules
								return tm || !userRules[k]?.hide;
							})
							.sort(([a], [b]) => {
								const oa = order.get(a) ?? 99;
								const ob = order.get(b) ?? 99;
								return oa === ob ? a.localeCompare(b) : oa - ob;
							})
							.flatMap(([k, v]) => {
								// transformers: builtin (always) then user (mode on).
								// In /ed mode (off), user transformers are skipped and the
								// /ed state rules apply instead. Disabled keys (via /edt d)
								// skip all transformers and show the raw text.
								const applyTf = (tf: StatusTransformer | undefined) => {
									if (!tf || disabledTransformerKeys.has(k)) return v.trim();
									try {
										const r = tf.transform(k, v, {
											raw: v,
											plain: stripAnsi(v),
											theme,
										});
										if (r === null || r === undefined) return "";
										return r;
									} catch (e) {
										console.error(`pi-tidy-footer: transformer for key "${k}" threw:`, e);
										return v.trim();
									}
								};
								let s: string;
								if (tm) {
									// transformer mode: user transformer for this key wins
									// (last-write-wins), otherwise the builtin applies
									s = applyTf(tidyUser[k] ?? tidyBuiltin[k]);
								} else {
									// /ed mode: builtin, then /ed state rules on top
									s = applyTf(tidyBuiltin[k]);
									s = applyRewrite(s, userRules[k], true);
								}
								if (!s) return [];
								return [
									[k, s.replace(/(\p{Extended_Pictographic})\s+/gu, "$1")] as [
										string,
										string,
									],
								];
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

				// mcp-adapter full status text is verbose — inject compact once
				// (adapter reads config at startup; restart applies it)
				if (!readState("mcpCompactInjected", false)) {
					const rawMcp = raw.get("mcp");
					if (rawMcp !== undefined && /servers? enabled/.test(rawMcp as string)) {
						const result = ensureMcpCompact();
						if (result.ok) {
							mergeState({ mcpCompactInjected: true });
							console.log(
								"pi-tidy-footer: " +
									result.msg +
									" Restart pi to apply compact MCP status.",
							);
						} else {
							console.error("pi-tidy-footer: " + result.msg);
						}
					}
				}

				const lines: string[] = [
					truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "...")),
					line2,
				];
				if (extItems.length > 0) {
					function formatMcpItem(t: string): string {
						return (
							t
								// compact mode emits "MCP 2/1" without icon or colon — normalize before colouring
								.replace(/MCP(?=\s)/, "🔌MCP:")
								.replace(
									/MCP:/,
									`\x1b[38;2;128;128;128mMCP:${mcpRgb || "\x1b[38;2;138;190;183m"}`,
								)
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
							lines.push(truncateToWidth(current, width, theme.fg("dim", "...")));
						} else if (current) {
							lines.push(current);
						}
					} else {
						const statusLine = extItems.map(([, t]) => formatMcpItem(t)).join(" ");
						lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
					}
				}

				// one-key emoji hiding: strip pictographs after all decoration is applied
				return emojiHidden
					? lines.map((l) =>
							l.replace(/\p{Extended_Pictographic}/gu, "").replace(/ +/g, " "),
						)
					: lines;
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

// Runtime extension statuses seen by the last render, for /ed listing
// (event-driven update; not a poll)
let lastSeenExtKeys: string[] = [];
let lastSeenExtStatuses: Map<string, string> = new Map();

export default function (pi: PiApi) {
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

	// last render theme, cached for /edr baseline simulation
	let lastTheme: PiTheme | undefined;

	function applyFooter(ctx: PiCtx) {
		const thresholds = readThresholds();
		const costThresholds = readCostThresholds();
		const extensionOrder = readExtensionOrder();
		const balanceSymbol = readBalanceSymbol();
		const userRules = readTransformRules();
		ctx.ui.setFooter((tui: PiTui, theme: PiTheme, fd: PiFd) => {
			lastTheme = theme;
			return makeFooter(
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
				userRules,
			);
		});
	}

	function getCurrentRate(): number | undefined {
		const ccy = readCostCurrency();
		return ccyRate(ccy, readFxCache()?.rates);
	}

	/** Refresh footer after a config change; no-op when footer is off. */
	const commitFooter = (ctx: PiCtx) => {
		if (enabled) applyFooter(ctx);
	};

	function guardEnabled(fn: (args: string, ctx: PiCtx) => Promise<void>) {
		return async (args: string, ctx: PiCtx) => {
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

	/**
	 * Like guardEnabled, but also freezes the /ed rule commands when
	 * transformer mode is on (user transformers take over).
	 */
	function guardRuleCommands(fn: (args: string, ctx: PiCtx) => Promise<void>) {
		return guardEnabled(async (args: string, ctx: PiCtx) => {
			if (readTransformerMode()) {
				ctx.ui.notify(
					"Command unavailable: transformer mode is on — user transformers manage extension display. Use /edt off to return to /ed commands.",
					"info",
				);
				return;
			}
			return fn(args, ctx);
		});
	}

	/**
	 * Shared handler for bulk key commands (edh/eds/edc): parse keys, apply a
	 * per-key mutation, persist, refresh footer.
	 */
	function bulkKeysCommand(opts: {
		cmd: string;
		action: string;
		skipLabel: string;
		invalidLabel?: string;
		apply: (
			rules: Record<string, any>,
			key: string,
		) => boolean | "skip" | "invalid" | void;
		applyAll?: (rules: Record<string, any>) => number | void;
		freezeWhenTransformers?: boolean;
	}) {
		const guarded = async (args: string, ctx: PiCtx) => {
			const keys = parseArgs(args);
			if (keys.length === 0) {
				ctx.ui.notify(
					`Usage: /${opts.cmd} <key> [key...] — quote keys containing spaces`,
					"error",
				);
				return;
			}
			const rules = readTransformRules();
			const done: string[] = [];
			const skipped: string[] = [];
			const invalid: string[] = [];
			// "all" clears every user rule (falls back to defaults)
			if (keys.length === 1 && keys[0] === "all") {
				if (opts.applyAll) {
					const count = opts.applyAll(rules) ?? 0;
					if (!writeTransformRules(rules)) {
						ctx.ui.notify("Save failed — config not persisted. See logs.", "error");
						return;
					}
					commitFooter(ctx);
					ctx.ui.notify(
						count > 0
							? `${opts.action} all: ${count} rule${count > 1 ? "s" : ""}`
							: "Nothing to clear.",
						"info",
					);
				} else {
					ctx.ui.notify(`/${opts.cmd} does not support "all"`, "error");
				}
				return;
			}
			for (const key of keys) {
				const r = opts.apply(rules, key);
				if (r === false || r === "skip") skipped.push(key);
				else if (r === "invalid") invalid.push(key);
				else done.push(key);
			}
			if (!writeTransformRules(rules)) {
				ctx.ui.notify("Save failed — config not persisted. See logs.", "error");
				return;
			}
			commitFooter(ctx);
			const doneMsg = done.length > 0 ? `${opts.action}: ${done.join(", ")}` : "";
			const skipMsg =
				skipped.length > 0 ? `${opts.skipLabel}: ${skipped.join(", ")}` : "";
			const invalidMsg =
				invalid.length > 0 && opts.invalidLabel
					? `${opts.invalidLabel}: ${invalid.join(", ")}`
					: "";
			ctx.ui.notify(
				[doneMsg, skipMsg, invalidMsg].filter(Boolean).join(" | ") ||
					"Nothing done.",
				"info",
			);
		};
		return opts.freezeWhenTransformers
			? guardRuleCommands(guarded)
			: guardEnabled(guarded);
	}

	let enabled = readPersistedEnabled();

	pi.on("session_start", async (_event, ctx: PiCtx) => {
		enabled = readPersistedEnabled();
		toolState.active.clear();
		toolState.minDisplayQueue.length = 0;
		if (toolState.minDisplayTimer) clearTimeout(toolState.minDisplayTimer);
		toolState.minDisplayTimer = undefined;
		// ensure the user transformers dir + eduser.ts exist
		await ensureUserTfFile();
		// load builtin transformers from the package (always active)
		tidyBuiltin = (await readTidyBuiltin()) ?? {};
		// load user transformers (active only in transformer mode)
		tidyUser = (await readTidyUser()) ?? {};
		// load disabled transformer keys
		disabledTransformerKeys = new Set(readDisabledTransformerKeys());
		commitFooter(ctx);
		live.getThinkingLevel = () => pi.getThinkingLevel?.() ?? "off";
	});

	pi.on("tool_execution_start", (event) => {
		toolState.active.set(
			event.toolName,
			(toolState.active.get(event.toolName) ?? 0) + 1,
		);
		live.requestRender?.();
	});

	pi.on("tool_execution_end", (event) => {
		const n = toolState.active.get(event.toolName) ?? 0;
		if (n <= 1) toolState.active.delete(event.toolName);
		else toolState.active.set(event.toolName, n - 1);
		// minimum 150ms display so fast tools don't flicker
		if (toolState.active.has(event.toolName)) {
			toolState.minDisplayQueue = toolState.minDisplayQueue.filter(
				(q) => q !== event.toolName,
			);
		} else {
			if (!toolState.minDisplayQueue.includes(event.toolName)) {
				toolState.minDisplayQueue.push(event.toolName);
			}
			if (toolState.minDisplayTimer) clearTimeout(toolState.minDisplayTimer);
			toolState.minDisplayTimer = setTimeout(() => {
				toolState.minDisplayQueue = [];
				toolState.minDisplayTimer = undefined;
				live.requestRender?.();
			}, STATUS_MIN_MS);
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
		handler: async (_args: string, ctx: PiCtx) => {
			enabled = !enabled;
			if (!writePersistedEnabled(enabled)) {
				enabled = !enabled; // roll back
				ctx.ui.notify("Save failed — config not persisted. See logs.", "error");
				return;
			}

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
		handler: guardEnabled(async (args: string, ctx: PiCtx) => {
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
				ctx.ui.notify(`Invalid currency: "${ccy}". Available: ${list}`, "error");
				return;
			}
			if (!writeCostCurrency(ccy)) {
				ctx.ui.notify("Save failed — config not persisted. See logs.", "error");
				return;
			}
			commitFooter(ctx);
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
		writeFn: (w: number, a: number) => boolean;
		defaults: { warn: number; alert: number };
	}): (args: string, ctx: PiCtx) => Promise<void> {
		return guardEnabled(async (args: string, ctx: PiCtx) => {
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
			const ok = opts.writeFn(warn / rate, alert / rate);
			if (!ok) {
				ctx.ui.notify("Save failed — config not persisted. See logs.", "error");
				return;
			}
			commitFooter(ctx);
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
		handler: guardEnabled(async (args: string, ctx: PiCtx) => {
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
				let ok = writeBalanceSymbolList(custom);
				if (readBalanceSymbol() === sym) {
					ok = writeBalanceSymbol("⛽") && ok;
				}
				if (!ok) {
					ctx.ui.notify("Save failed — config not persisted. See logs.", "error");
					return;
				}
				commitFooter(ctx);
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
			if (trimmed) {
				let sym = args;
				if (args.length >= 2 && args[0] === '"' && args[args.length - 1] === '"') {
					sym = args.slice(1, -1);
				}
				const custom = readBalanceSymbolList();
				let ok = true;
				if (!custom.includes(sym)) {
					custom.push(sym);
					ok = writeBalanceSymbolList(custom);
				}
				ok = writeBalanceSymbol(sym) && ok;
				if (!ok) {
					ctx.ui.notify("Save failed — config not persisted. See logs.", "error");
					return;
				}
				commitFooter(ctx);
				const display = BALANCE_SYMBOL_OPTIONS[sym] ?? sym;
				ctx.ui.notify(`Balance symbol: ${display}`, "info");
			} else {
				const keys = getEffectiveSymbols();
				const current = readBalanceSymbol();
				const idx = keys.indexOf(current);
				const next = keys[(idx + 1) % keys.length];
				if (!writeBalanceSymbol(next)) {
					ctx.ui.notify("Save failed — config not persisted. See logs.", "error");
					return;
				}
				commitFooter(ctx);
				const display = BALANCE_SYMBOL_OPTIONS[next] ?? next;
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
		handler: guardEnabled(async (args: string, ctx: PiCtx) => {
			const trimmed = args.trim();
			if (!trimmed) {
				const current = readExtensionOrder();
				ctx.ui.notify(`Current order: ${current.join(" ")}`, "info");
				return;
			}
			const keys = trimmed.split(/\s+/);
			// ponytail: keys silently accepted, unknown keys sorted to end
			if (!writeExtensionOrder(keys)) {
				ctx.ui.notify("Save failed — config not persisted. See logs.", "error");
				return;
			}
			commitFooter(ctx);
			ctx.ui.notify(`Order set to: ${keys.join(" ")}`, "info");
		}),
	});

	pi.registerCommand("ew", {
		description: "Toggle extension wrap ON/OFF",
		handler: guardEnabled(async (_args: string, ctx: PiCtx) => {
			const next = !readWrapEnabled();
			if (!writeWrapEnabled(next)) {
				ctx.ui.notify("Save failed — config not persisted. See logs.", "error");
				return;
			}
			commitFooter(ctx);
			ctx.ui.notify(next ? "Extension wrap: ON" : "Extension wrap: OFF", "info");
		}),
	});

	pi.registerCommand("ede", {
		description: "Toggle extension emoji hiding ON/OFF",
		handler: guardRuleCommands(async (_args: string, ctx: PiCtx) => {
			const next = !readEmojiHidden();
			if (!writeEmojiHidden(next)) {
				ctx.ui.notify("Save failed — config not persisted. See logs.", "error");
				return;
			}
			commitFooter(ctx);
			ctx.ui.notify(
				next
					? "Extension emoji: HIDDEN"
					: "Extension emoji: SHOWN. For a single extension, use /edr <key> <pattern> <replacement>",
				"info",
			);
		}),
	});

	pi.registerCommand("ed", {
		description:
			"Extension display rules: list all extension status keys with their rules; quote keys containing spaces",
		handler: guardEnabled(async (_args: string, ctx: PiCtx) => {
			// transformer mode on: user transformers take over display
			if (readTransformerMode()) {
				const allKeys = [
					...new Set([
						...lastSeenExtKeys,
						...Object.keys(tidyBuiltin),
						...Object.keys(tidyUser),
					]),
				];
				const lines = allKeys.map((k) => {
					const parts: string[] = [];
					if (tidyUser[k]) parts.push("user transformer");
					if (tidyBuiltin[k]) parts.push("builtin transformer");
					if (parts.length === 0) parts.push("(no rule)");
					return `"${k}": ${parts.join(", ")}`;
				});
				ctx.ui.notify(
					`Transformer mode (user transformers):\n${lines.join("\n")}`,
					"info",
				);
				return;
			}
			const userRules = readTransformRules();
			const allKeys = [
				...new Set([
					...lastSeenExtKeys,
					...Object.keys(userRules),
					...Object.keys(tidyBuiltin),
				]),
			];
			if (allKeys.length === 0) {
				ctx.ui.notify("No extension display changed yet", "info");
				return;
			}
			const hasRule = (k: string) => userRules[k] || tidyBuiltin[k];
			// rules first, rest after; stable within each group
			const orderedKeys = [
				...allKeys.filter((k) => hasRule(k)),
				...allKeys.filter((k) => !hasRule(k)),
			];
			const lines = orderedKeys.map((k) => {
				const rawText = lastSeenExtStatuses.get(k)?.trim();
				const clean = rawText ? stripAnsi(rawText) : undefined;
				const parts: string[] = [];
				if (userRules[k]?.hide) {
					parts.push("hidden");
				} else if (clean && userRules[k]) {
					// /ed state rule preview (builtin transformers are functions —
					// their effect is not previewable here)
					const after = applyRewrite(clean, userRules[k]);
					parts.push(after === clean ? "no match" : `${clean} → ${after}`);
				} else if (tidyBuiltin[k]) {
					parts.push("builtin transformer");
				} else {
					parts.push("(no rule)");
				}
				return `"${k}": ${parts.join(", ")}`;
			});
			ctx.ui.notify(`Extension Display:\n${lines.join("\n")}`, "info");
		}),
	});

	pi.registerCommand("edh", {
		description:
			"Hide extension statuses: /edh <key> [key...]; quote keys containing spaces",
		handler: bulkKeysCommand({
			cmd: "edh",
			action: "Hidden",
			skipLabel: "Already hidden",
			invalidLabel: "Unknown extension",
			freezeWhenTransformers: true,
			apply: (rules, key) => {
				if (lastSeenExtKeys.length > 0 && !lastSeenExtKeys.includes(key)) {
					return "invalid";
				}
				if (rules[key]?.hide) return "skip";
				rules[key] = { ...rules[key], hide: true };
			},
		}),
	});

	pi.registerCommand("eds", {
		description:
			"Show extension statuses again: /eds <key> [key...]; quote keys containing spaces",
		handler: bulkKeysCommand({
			cmd: "eds",
			action: "Shown",
			skipLabel: "Already showing",
			invalidLabel: "Unknown extension",
			freezeWhenTransformers: true,
			apply: (rules, key) => {
				if (lastSeenExtKeys.length > 0 && !lastSeenExtKeys.includes(key)) {
					return "invalid";
				}
				if (!rules[key]?.hide) return "skip";
				const { hide: _h, ...rest } = rules[key];
				if (Object.keys(rest).length === 0) delete rules[key];
				else rules[key] = rest;
			},
		}),
	});

	pi.registerCommand("edr", {
		description:
			"Rewrite an extension status: /edr <key> <pattern> <replacement>; {1} {2}... = captured groups; quote args containing spaces",
		handler: guardRuleCommands(async (args: string, ctx: PiCtx) => {
			const parts = parseArgs(args);
			const key = parts[0] ?? "";
			const pattern = parts[1] ?? "";
			const replacement = parts[2] ?? "";
			if (!key || !pattern || replacement === undefined) {
				ctx.ui.notify(
					"Usage: /edr <key> <pattern> <replacement> — use {1} {2}... for captured groups; quote args containing spaces",
					"error",
				);
				return;
			}
			try {
				new RegExp(pattern);
			} catch {
				ctx.ui.notify(`Invalid pattern: "${pattern}"`, "error");
				return;
			}

			// key must be a known extension (when the runtime list is populated)
			if (lastSeenExtKeys.length > 0 && !lastSeenExtKeys.includes(key)) {
				ctx.ui.notify(
					`Unknown extension: "${key}" — run /ed to list available extensions`,
					"error",
				);
				return;
			}

			// replacement uses {n} but pattern has no real capture group
			// (excludes escaped \( and non-capturing (?:)
			if (/\{\d+\}/.test(replacement) && !/(?<!\\)\((?!\?)/.test(pattern)) {
				ctx.ui.notify(
					`Error. {n} needs (...) in the pattern. Try: /edr ${key} "(${pattern})" "${replacement}"`,
					"error",
				);
				return;
			}

			// baseline check: warn when the pattern targets the current display
			// (which includes a previous user rule) instead of the default output
			const rawText = lastSeenExtStatuses.get(key)?.trim();
			if (rawText) {
				const clean = stripAnsi;
				// default output = builtin transformer applied (if any)
				let defaultText = rawText;
				const builtinTf = tidyBuiltin[key];
				if (builtinTf && lastTheme) {
					try {
						const r = builtinTf.transform(key, rawText, {
							raw: rawText,
							plain: clean(rawText),
							theme: lastTheme,
						});
						if (typeof r === "string") defaultText = r;
					} catch {
						/* keep raw */
					}
				}
				const defaultOut = clean(defaultText);
				const userRule = readTransformRules()[key];
				const currentOut = clean(applyRewrite(defaultText, userRule, true));
				const re = new RegExp(colorblindPattern(pattern));
				if (!re.test(defaultOut) && re.test(currentOut)) {
					// user pattern only matches the current display (previous rule's
					// result), not the default output
					if (defaultOut.includes(replacement) && replacement.length >= 3) {
						// replacement equals a specific fragment of the default output →
						// user wants to restore the original → /edc
						ctx.ui.notify(
							`Error. To restore the original, use /edc "${key}"`,
							"error",
						);
					} else {
						ctx.ui.notify(
							`Error. Pick the fragment to rewrite from: "${defaultOut}"`,
							"error",
						);
					}
					return;
				}
				if (!re.test(defaultOut) && !re.test(currentOut)) {
					ctx.ui.notify(
						`Error. "${pattern}" not found in: "${defaultOut}"`,
						"error",
					);
				}
			}

			const rules = readTransformRules();
			rules[key] = { ...rules[key], rewrite: [pattern, replacement] };
			if (!writeTransformRules(rules)) {
				ctx.ui.notify("Save failed — config not persisted. See logs.", "error");
				return;
			}
			commitFooter(ctx);
			ctx.ui.notify(`Rewrite set for ${key}: ${replacement || "<empty>"}`, "info");
		}),
	});

	pi.registerCommand("edc", {
		description:
			"Clear transform rules: /edc <key> [key...] or /edc all; quote keys containing spaces",
		handler: bulkKeysCommand({
			cmd: "edc",
			action: "Cleared",
			skipLabel: "No rules for",
			invalidLabel: "Unknown extension",
			freezeWhenTransformers: true,
			apply: (rules, key) => {
				if (lastSeenExtKeys.length > 0 && !lastSeenExtKeys.includes(key)) {
					return "invalid";
				}
				if (!rules[key]) return "skip";
				delete rules[key];
			},
			applyAll: (rules) => {
				const count = Object.keys(rules).length;
				for (const key of Object.keys(rules)) delete rules[key];
				return count;
			},
		}),
	});

	pi.registerCommand("fcl", {
		description: "Clear all pi-tidy-footer config for clean uninstall",
		handler: async (_args: string, ctx: PiCtx) => {
			const result = resetAllConfig();
			const mcpResult = removeMcpCompact();
			if (!result.ok) {
				ctx.ui.notify(`pi-tidy-footer: ${result.msg}`, "error");
				return;
			}
			// remove user transformers (.ts files) — clean uninstall.
			// Guard: only delete the default dir (or a subdir of it); a user-set
			// transformersDir pointing elsewhere must never be wiped.
			const tfDir = readTransformersDir();
			const defaultDir = DEFAULT_TRANSFORMERS_DIR;
			if (
				existsSync(tfDir) &&
				(tfDir === defaultDir || tfDir.startsWith(defaultDir + sep))
			) {
				try {
					rmSync(tfDir, { recursive: true, force: true });
				} catch (e) {
					console.error("pi-tidy-footer: failed to remove transformers dir", e);
				}
			}
			commitFooter(ctx);
			ctx.ui.notify(
				`pi-tidy-footer: ${result.msg} ${mcpResult.msg} You can now uninstall the package.`,
				mcpResult.ok ? "info" : "error",
			);
		},
	});

	pi.registerCommand("edt", {
		description:
			"Manage transformer mode: on = user transformers take over (/ed frozen); off = return to /ed; d <key...> = disable transformer; e <key...> = enable; dir [path] = show/set user transformers dir; reload = re-read; no args = status",
		handler: async (args: string, ctx: PiCtx) => {
			const trimmed = args.trim();
			if (!trimmed) {
				ctx.ui.notify(
					`Transformer mode: ${readTransformerMode() ? "ON" : "OFF"}. User transformers: ${join(readTransformersDir(), "eduser.ts")}`,
					"info",
				);
				return;
			}
			const parts = trimmed.split(/\s+/);
			const sub = parts[0];
			const keys = parts.slice(1).filter(Boolean);
			if (sub === "on") {
				if (!writeTransformerMode(true)) {
					ctx.ui.notify("Save failed — config not persisted. See logs.", "error");
					return;
				}
				commitFooter(ctx);
				ctx.ui.notify(
					"Transformer mode: ON — user transformers take over extension display. /ed commands are frozen.",
					"info",
				);
				return;
			}
			if (sub === "off") {
				if (!writeTransformerMode(false)) {
					ctx.ui.notify("Save failed — config not persisted. See logs.", "error");
					return;
				}
				commitFooter(ctx);
				ctx.ui.notify(
					"Transformer mode: OFF — /ed commands control extension display again.",
					"info",
				);
				return;
			}
			if (sub === "d" || sub === "e") {
				if (keys.length === 0) {
					ctx.ui.notify(`Usage: /edt ${sub} <key> [<key>...]`, "error");
					return;
				}
				const disabled = new Set(readDisabledTransformerKeys());
				const changed: string[] = [];
				const skipped: string[] = [];
				for (const k of keys) {
					if (sub === "d") {
						if (disabled.has(k)) skipped.push(k);
						else {
							disabled.add(k);
							changed.push(k);
						}
					} else if (disabled.has(k)) {
						disabled.delete(k);
						changed.push(k);
					} else skipped.push(k);
				}
				if (!writeDisabledTransformerKeys([...disabled])) {
					ctx.ui.notify("Save failed — config not persisted. See logs.", "error");
					return;
				}
				disabledTransformerKeys = disabled;
				commitFooter(ctx);
				const changedMsg =
					changed.length > 0
						? `${sub === "d" ? "Disabled" : "Enabled"}: ${changed.join(", ")}`
						: "";
				const skipMsg =
					skipped.length > 0
						? `${sub === "d" ? "Already disabled" : "Not disabled"}: ${skipped.join(", ")}`
						: "";
				ctx.ui.notify(
					[changedMsg, skipMsg].filter(Boolean).join(" | ") ||
						`No transformer ${sub === "d" ? "disabled" : "enabled"}.`,
					"info",
				);
				return;
			}
			if (sub === "dir") {
				if (keys.length === 0) {
					ctx.ui.notify(`User transformers dir: ${readTransformersDir()}`, "info");
					return;
				}
				const newDir = keys.join(" ");
				if (!writeTransformersDir(newDir)) {
					ctx.ui.notify("Save failed — config not persisted. See logs.", "error");
					return;
				}
				commitFooter(ctx);
				ctx.ui.notify(`User transformers dir set to: ${newDir}`, "info");
				return;
			}
			if (sub === "reload") {
				await ensureUserTfFile();
				const nb = await readTidyBuiltin();
				const nu = await readTidyUser();
				// on failure keep the previous transformers and surface the error
				if (nb) tidyBuiltin = nb;
				if (nu) tidyUser = nu;
				commitFooter(ctx);
				const failed = [nb ? null : "builtin", nu ? null : "user"]
					.filter(Boolean)
					.join(" + ");
				ctx.ui.notify(
					failed
						? `Reload failed for ${failed} — previous transformers kept.`
						: `Reloaded transformers: ${Object.keys(tidyBuiltin).length} builtin, ${Object.keys(tidyUser).length} user transformer(s).`,
					failed ? "error" : "info",
				);
				return;
			}
			ctx.ui.notify(
				`Unknown subcommand: ${sub}. Usage: /edt on | off | d <key...> | e <key...> | dir [path] | reload`,
				"error",
			);
		},
	});
}
