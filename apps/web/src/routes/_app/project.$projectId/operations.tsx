import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/project/$projectId/operations")({
	component: RouteComponent,
	staticData: {
		title: "Project Operations",
	},
});

function RouteComponent() {
	return <div>Hello "/_app/project/$projectId/operations"!</div>;
}
