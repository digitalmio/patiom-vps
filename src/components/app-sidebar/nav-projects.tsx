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
	shouldDisplay,
}: {
	projectMenu: {
		name: string;
		url: string;
		icon: LucideIcon;
	}[];
	shouldDisplay: boolean;
}) {
	// we're not on the route that is project specific, don't show the project nav
	if (!shouldDisplay) {
		return null;
	}

	return (
		<SidebarGroup className="group/collapsible">
			<SidebarMenu>
				{projectMenu.map((item) => (
					<SidebarMenuItem key={item.name}>
						<SidebarMenuButton asChild>
							<Link to={item.url}>
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
