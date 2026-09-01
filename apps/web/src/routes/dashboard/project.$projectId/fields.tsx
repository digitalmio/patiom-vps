import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/project/$projectId/fields")({
	component: RouteComponent,
	staticData: {
		title: "Project Fields",
	},
});

function RouteComponent() {
	return <div>Hello "/dashboard/project/$projectId/fields"!</div>;
}
