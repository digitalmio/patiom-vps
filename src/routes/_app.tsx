import {
	createFileRoute,
	Outlet,
	redirect,
	useMatches,
} from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar/app-sidebar";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { getUserData } from "@/services/auth-server-fn";

export const Route = createFileRoute("/_app")({
	component: RouteComponent,
	beforeLoad: async () => {
		const userId = await getUserData().then((data) => data?.id);
		if (!userId) {
			throw redirect({ to: "/auth" });
		}
	},
});

function RouteComponent() {
	const matches = useMatches();
	const currentRoute = matches[matches.length - 1];
	const { path } = currentRoute.staticData || {};

	console.log("Current Route Path:", path);

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
					<div className="flex items-center gap-2 px-4 w-full">
						<SidebarTrigger className="-ml-1" />
						<Button size="sm" className="ml-auto">
							<Plus /> Add New Project
						</Button>
					</div>
				</header>
				<Outlet />
			</SidebarInset>
		</SidebarProvider>
	);
}
