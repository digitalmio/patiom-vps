import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/project/$projectId/errors")({
	component: RouteComponent,
	staticData: {
		title: "Project Errors",
	},
});

function RouteComponent() {
	return <div>Hello "/_app/project/$projectId/errors"!</div>;
}
