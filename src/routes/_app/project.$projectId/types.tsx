import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/project/$projectId/types")({
	component: RouteComponent,
	staticData: {
		title: "Project Types",
	},
});

function RouteComponent() {
	return <div>Hello "/_app/project/$projectId/types"!</div>;
}
