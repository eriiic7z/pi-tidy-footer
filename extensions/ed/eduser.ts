/**
 * pi-tidy-footer — your user transformers.
 *
 * This file lives in your user directory and is never overwritten by
 * extension updates. Declare transformers here to override builtin ones
 * (same key wins) or to customise extensions the builtins don't touch.
 *
 * A transformer is an object with a `transform(key, value, ctx)` function,
 * keyed by extension name. Return a string to replace the
 * display, or null/undefined to hide the entry entirely. `ctx` provides
 * `raw` (status with ANSI), `plain` (status without ANSI) and `theme`.
 */

export const user: Record<
	string,
	{
		transform(
			key: string,
			value: string,
			ctx: { raw: string; plain: string; theme: any },
		): string | null | undefined;
	}
> = {
	// Example (delete or edit):
	// mcp: {
	//   transform(_key, value, { plain }) {
	//     const m = plain.match(/(\d+)\s+servers?\s+enabled/);
	//     return m ? `MCP(${m[1]})` : value;
	//   },
	// },
};
