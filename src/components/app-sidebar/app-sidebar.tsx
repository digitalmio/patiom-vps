import {
	Activity,
	AlertCircle,
	Boxes,
	FolderDot,
	Grid3x3,
	LayoutDashboard,
	MessageCircle,
	Plus,
	Settings,
} from "lucide-react";
import type * as React from "react";
import { NavProjects } from "@/components/app-sidebar/nav-projects";
import { NavSecondary } from "@/components/app-sidebar/nav-secondary";
import { NavUser } from "@/components/app-sidebar/nav-user";
import { ProjectSwitcher } from "@/components/app-sidebar/project-switcher";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
} from "@/components/ui/sidebar";
import type { schema } from "@/lib/db";
import { Logo } from "../logo";

const data = {
	projectMenu: [
		{
			name: "Overview",
			url: "#",
			icon: LayoutDashboard,
		},
		{
			name: "Operations",
			url: "#",
			icon: Activity,
		},
		{
			name: "Fields",
			url: "#",
			icon: Grid3x3,
		},
		{
			name: "Types",
			url: "#",
			icon: Boxes,
		},
		{
			name: "Errors",
			url: "#",
			icon: AlertCircle,
		},
	],
	mainNav: [
		{
			name: "All Projects",
			url: "/",
			icon: FolderDot,
		},
		{
			name: "Add New Project",
			url: "/new-project",
			icon: Plus,
		},
		{
			name: "Feedback",
			url: "/feedback",
			icon: MessageCircle,
		},
		{
			name: "Settings",
			url: "/settings",
			icon: Settings,
		},
	],
};

export function AppSidebar({
	userData,
	projects,
	...props
}: React.ComponentProps<typeof Sidebar> & {
	userData: { name: string; email: string; image?: string };
	projects: Array<typeof schema.projects.$inferSelect>;
}) {
	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader className="border-b">
				<Logo />
			</SidebarHeader>
			<SidebarHeader>
				<ProjectSwitcher projects={projects} />
			</SidebarHeader>
			<SidebarContent>
				<NavProjects projectMenu={data.projectMenu} />
				<NavSecondary links={data.mainNav} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser user={userData} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
