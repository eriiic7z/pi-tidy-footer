/**
 * pi-tidy-footer — pure-function self-check (zero dependencies).
 * Run: node scripts/selfcheck.ts  (Node 23.6+ / 22.6 with flag; strip-types native)
 * Fails with exit != 0 when any assertion breaks.
 */
import assert from "node:assert/strict";
import {
	applyRewrite,
	colorblindPattern,
	fmtCwd,
	fmtTok,
	parseArgs,
	parseGitStatusTokens,
	stripAnsi,
} from "../extensions/pi-tidy-footer.ts";

/* parseGitStatusTokens — porcelain v1 six token classes */
assert.equal(parseGitStatusTokens("## main"), "");
assert.equal(parseGitStatusTokens("## main\n M a.ts"), "~1");
assert.equal(parseGitStatusTokens("## main\nA  b.ts"), "+1");
assert.equal(parseGitStatusTokens("## main\n?? c.md"), "?1");
assert.equal(parseGitStatusTokens("## main\nUU d.ts"), "!1");
assert.equal(
	parseGitStatusTokens("## main...origin/main [ahead 2, behind 3]"),
	"⇡2 ⇣3",
);
// x=! column (ignored) must not count
assert.equal(parseGitStatusTokens("## main\n!! ignored.txt"), "");
// token order fixed: ⇡ ⇣ + ~ ? !
assert.equal(
	parseGitStatusTokens("## main [ahead 1]\n M a\nA  b\n?? c\nUU d"),
	"⇡1 +1 ~1 ?1 !1",
);
// four conflict variants, none double-counted as staged
assert.equal(parseGitStatusTokens("## main\nDD a\nAA b\nU? c\n?U d"), "!4");

/* applyRewrite — template substitution, no-match, invalid regex, no g flag */
assert.equal(
	applyRewrite("hello world", { rewrite: ["world", "pi"] }),
	"hello pi",
);
assert.equal(
	applyRewrite("abc123", { rewrite: ["(\\d+)", "<{1}>"] }),
	"abc<123>",
);
assert.equal(applyRewrite("abc", { rewrite: ["z+", "x"] }), "abc");
assert.equal(applyRewrite("abc", { rewrite: ["[", "x"] }), "abc");
assert.equal(applyRewrite("abc", {}), "abc");
assert.equal(applyRewrite("abc", { hide: true }), "abc");
// no g flag — first match only (documented)
assert.equal(applyRewrite("a a", { rewrite: ["a", "b"] }), "b a");
// {n} captured-group reorder
assert.equal(
	applyRewrite("x-1-2", { rewrite: ["x-(\\d)-(\\d)", "{2}{1}"] }),
	"21",
);
// transparent: pattern matches across ANSI; trailing reset preserved (after *? fix)
assert.equal(
	applyRewrite("\x1b[31mfoo\x1b[0m", { rewrite: ["foo", "bar"] }, true),
	"\x1b[31mbar\x1b[0m",
);
// inter-char ANSI with transparent on — loose assertion (match swallows inner codes)
const interAnsi = "\x1b[31mf\x1b[0mo\x1b[0mo";
assert.ok(
	applyRewrite(interAnsi, { rewrite: ["foo", "bar"] }, true).includes("bar"),
);
// inter-char ANSI with transparent off — no match, original returned
assert.equal(applyRewrite(interAnsi, { rewrite: ["foo", "bar"] }), interAnsi);

/* colorblindPattern — literal chars gain transparent group; meta/escape/class untouched */
assert.equal(colorblindPattern("a"), "a(?:\\x1b\\[[0-9;]*m)*?");
assert.equal(colorblindPattern("."), ".");
assert.equal(colorblindPattern("[a]"), "[a]");
assert.equal(colorblindPattern("\\d"), "\\d");
assert.equal(
	colorblindPattern("a.b"),
	"a(?:\\x1b\\[[0-9;]*m)*?.b(?:\\x1b\\[[0-9;]*m)*?",
);
assert.equal(colorblindPattern(""), "");

/* parseArgs — tokenize, quote stripping, empty tokens dropped */
assert.deepEqual(parseArgs("a b c"), ["a", "b", "c"]);
assert.deepEqual(parseArgs('"a b" c'), ["a b", "c"]);
assert.deepEqual(parseArgs(""), []);
assert.deepEqual(parseArgs("  "), []);
assert.deepEqual(parseArgs('k "x y" z'), ["k", "x y", "z"]);
// trailing space is data-layer format — \S+ split drops it (AGENTS.md guard)
assert.deepEqual(parseArgs("⛽ "), ["⛽"]);
// empty quoted token is dropped — /edr empty-replacement relies on parts[2] ?? ""
assert.deepEqual(parseArgs('a "" b'), ["a", "b"]);

/* fmtTok — k/M boundaries */
assert.equal(fmtTok(0), "0");
assert.equal(fmtTok(999), "999");
assert.equal(fmtTok(1000), "1.0k");
assert.equal(fmtTok(2500), "2.5k");
assert.equal(fmtTok(9999), "10.0k");
assert.equal(fmtTok(10000), "10k");
assert.equal(fmtTok(999_999), "1000k"); // documented boundary
assert.equal(fmtTok(1_000_000), "1.0M");

/* fmtCwd — home in/out, sibling dirs, no-home */
const HOME = "/Users/ericzhao";
assert.equal(fmtCwd("/Users/ericzhao", HOME), "~");
assert.equal(fmtCwd("/Users/ericzhao/文件", HOME), "~/文件");
assert.equal(fmtCwd("/etc", HOME), "/etc");
assert.equal(fmtCwd("/Users/ericzhao2", HOME), "/Users/ericzhao2");
assert.equal(fmtCwd("/Users/ericzhao/文件", undefined), "/Users/ericzhao/文件");

/* stripAnsi — 256-color/RGB sequences */
assert.equal(stripAnsi("\x1b[31mred\x1b[0m"), "red");
assert.equal(stripAnsi("\x1b[38;2;255;0;0mX\x1b[0m"), "X");
assert.equal(stripAnsi("plain"), "plain");
assert.equal(stripAnsi(""), "");

console.log("selfcheck: all assertions passed");
