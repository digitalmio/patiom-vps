import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/test")({
	component: RouteComponent,
	staticData: {
		title: "Test Page",
	},
});

function RouteComponent() {
	return <div>Hello from test route!</div>;
}
