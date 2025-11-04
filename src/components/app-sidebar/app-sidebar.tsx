import {
	Activity,
	AlertCircle,
	Boxes,
	FolderDot,
	Grid3x3,
	LayoutDashboard,
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
import { Logo } from "../logo";

const data = {
	projects: [
		{
			name: "The only project",
			plan: "Enterprise",
		},
	],
	projectNav: [
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
			url: "#",
			icon: FolderDot,
		},
		{
			name: "Add New Project",
			url: "#",
			icon: Plus,
		},
		{
			name: "Settings",
			url: "#",
			icon: Settings,
		},
	],
};

export function AppSidebar({
	userData,
	...props
}: React.ComponentProps<typeof Sidebar> & {
	userData: { name: string; email: string; image?: string };
}) {
	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader className="border-b">
				<Logo />
			</SidebarHeader>
			<SidebarHeader>
				<ProjectSwitcher projects={data.projects} />
			</SidebarHeader>
			<SidebarContent>
				<NavProjects projects={data.projectNav} />
				<NavSecondary links={data.mainNav} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser user={userData} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
