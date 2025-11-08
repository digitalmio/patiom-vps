import {
	createFileRoute,
	Outlet,
	redirect,
	useMatches,
} from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar/app-sidebar";
import { Header } from "@/components/app-sidebar/header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getUserData } from "@/services/auth-sfn";
import { getUserProjects } from "@/services/projects-sfn";

export const Route = createFileRoute("/_app")({
	component: RouteComponent,
	beforeLoad: async () => {
		const userData = await getUserData();
		const userId = userData?.id;

		// if not logged in, redirect to auth
		if (!userId) {
			throw redirect({ to: "/auth" });
		}

		// else return user data and projects
		const projects = await getUserProjects();
		return { userData, projects };
	},
	loader: async ({ context }) => {
		return {
			userData: context.userData,
			projects: context.projects,
		};
	},
});

function RouteComponent() {
	const matches = useMatches();
	const { title } = matches[matches.length - 1].staticData || {};
	const { userData, projects } = Route.useLoaderData();

	return (
		<SidebarProvider>
			<AppSidebar userData={userData} projects={projects} />
			<SidebarInset>
				<Header title={title} />
				<div className="px-5">
					<Outlet />
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
