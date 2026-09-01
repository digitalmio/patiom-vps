import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/project/$projectId/")({
	component: RouteComponent,
	staticData: {
		title: "Project Home",
	},
});

function RouteComponent() {
	const { projectId } = Route.useParams();

	return <div>Hello "/project/{projectId}/"!</div>;
}
