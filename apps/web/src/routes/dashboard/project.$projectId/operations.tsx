import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
	"/dashboard/project/$projectId/operations",
)({
	component: RouteComponent,
	staticData: {
		title: "Project Operations",
	},
});

function RouteComponent() {
	return <div>Hello "/dashboard/project/$projectId/operations"!</div>;
}
