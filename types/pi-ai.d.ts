declare module "@earendil-works/pi-ai" {
	export interface AssistantMessage {
		role: "assistant";
		usage: {
			input: number;
			output: number;
			cacheRead: number;
			cacheWrite: number;
		};
	}
}
