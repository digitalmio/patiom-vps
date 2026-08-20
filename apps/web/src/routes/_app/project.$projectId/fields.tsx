import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/project/$projectId/fields")({
	component: RouteComponent,
	staticData: {
		title: "Project Fields",
	},
});

function RouteComponent() {
	return <div>Hello "/_app/project/$projectId/fields"!</div>;
}
