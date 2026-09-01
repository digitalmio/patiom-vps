import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/project/$projectId/types")({
	component: RouteComponent,
	staticData: {
		title: "Project Types",
	},
});

function RouteComponent() {
	return <div>Hello "/dashboard/project/$projectId/types"!</div>;
}
