/**
 * pi-tidy-footer — builtin transformers (shipped with the extension).
 *
 * This file is read-only for users: it ships inside the package and updates
 * with each release. To override a builtin transformer, declare the same key
 * in your user file (~/.pi/agent/extensions/pi-tidy-footer/transformers/user.ts)
 * — user transformers take precedence (last-write-wins).
 */

export interface TransformContext {
	raw: string;
	plain: string;
	theme: any;
}

export interface StatusTransformer {
	keys: string[];
	transform(
		key: string,
		value: string,
		ctx: TransformContext,
	): string | null | undefined;
}

export const builtin: Record<string, StatusTransformer> = {
	caveman: {
		keys: ["caveman"],
		transform(_key, value, { theme }) {
			// keep the animated frame colours (raw ANSI intact); only the
			// " space + colour-code + label " segment is replaced and the label
			// re-coloured muted
			return value.replace(
				/\s*\x1b\[[0-9;]*mcaveman level: /,
				theme.fg("muted", "🗿caveman: "),
			);
		},
	},
	ponytail: {
		keys: ["ponytail"],
		transform(_key, value, { theme }) {
			// drop the ⚡ level icon and the space between ○/● and 🐴,
			// keep the indicator colour from the raw text
			return value
				.replace(/\x1b\[[0-9;]*m⚡\s*/, "")
				.replace(/([○●])\x1b\[[0-9;]*m 🐴 /, "$1🐴")
				.replace(/ponytail: /, theme.fg("muted", "ponytail: "));
		},
	},
};
