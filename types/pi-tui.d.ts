declare module "@earendil-works/pi-tui" {
	export function truncateToWidth(
		text: string,
		width: number,
		ellipsis: string,
	): string;
	export function visibleWidth(text: string): number;
}
