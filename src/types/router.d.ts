import "@tanstack/react-router";

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		path?: [string, string][];
		title?: string;
		breadcrumb?: string;
		activeNav?: string;
	}
}
