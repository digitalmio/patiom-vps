import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { isProjectOwner } from "@/services/project-owner-sfn";

export const Route = createFileRoute("/_app/project/$projectId")({
	beforeLoad: async ({ context, params }) => {
		// Access userData from parent _app route context
		const userId = context.userData?.id;

		if (!userId) {
			throw redirect({ to: "/auth" });
		}

		try {
			// Verify the user owns this project
			await isProjectOwner({ data: { userId, projectId: params.projectId } });
		} catch (_error) {
			// If ownership check fails, redirect to the first available project
			// or to the projects list if no projects exist
			const firstProject = context.projects?.[0]?.id;

			if (firstProject) {
				throw redirect({
					to: "/project/$projectId",
					params: { projectId: firstProject },
				});
			}
			throw redirect({ to: "/" });
		}

		// Pass projectId to child routes via context
		return {
			projectId: params.projectId,
		};
	},
	component: RouteComponent,
});

function RouteComponent() {
	// This is just a layout wrapper for all /project/:id/* routes
	return <Outlet />;
}
