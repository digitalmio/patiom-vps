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

// This is sample data.
const data = {
	user: {
		name: "shadcn",
		email: "m@example.com",
		avatar: "/avatars/shadcn.jpg",
	},
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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<div className="py-2 px-2 border-b-slate-100 border-b">
					<img src="/logo/patiom-logo.svg" alt="Patiom Logo" className="h-8" />
				</div>
			</SidebarHeader>
			<SidebarHeader>
				<ProjectSwitcher projects={data.projects} />
			</SidebarHeader>
			<SidebarContent>
				<NavProjects projects={data.projectNav} />
				<NavSecondary links={data.mainNav} />
			</SidebarContent>
			<SidebarFooter>
				<NavUser user={data.user} />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
