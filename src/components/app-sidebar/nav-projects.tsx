import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	SidebarGroup,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavProjects({
	projectMenu,
	routeData,
}: {
	projectMenu: {
		name: string;
		url: string;
		icon: LucideIcon;
	}[];
	routeData:
		| false
		| {
				projectId: string;
				"**"?: string;
		  };
}) {
	// we're not on the route that is project specific, don't show the project nav
	if (!routeData || !routeData?.projectId) {
		return null;
	}

	const isActive = (url: string) =>
		(!routeData["**"] && !url) || routeData["**"] === url;

	return (
		<SidebarGroup className="group/collapsible">
			<SidebarMenu>
				{projectMenu.map((item) => (
					<SidebarMenuItem key={item.name}>
						<SidebarMenuButton asChild isActive={isActive(item.url)}>
							<Link
								to={`/project/${routeData?.projectId}/${item.url}` as string}
							>
								<item.icon />
								<span>{item.name}</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}
