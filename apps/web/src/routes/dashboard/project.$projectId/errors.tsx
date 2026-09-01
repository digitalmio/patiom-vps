import { createFileRoute } from "@tanstack/react-router";
import { getProjectErrors } from "@/services/errors-sfn";

export const Route = createFileRoute("/dashboard/project/$projectId/errors")({
	component: RouteComponent,
	staticData: {
		title: "Project Errors",
	},
	beforeLoad: async ({ params }) => {
		const { projectId } = params;
		const errors = await getProjectErrors({ data: { projectId } });
		return { errors };
	},
	loader: async ({ context }) => {
		return { errors: context.errors };
	},
});

function RouteComponent() {
	const { errors } = Route.useLoaderData();
	return <pre>{JSON.stringify(errors, null, 2)}</pre>;
}
