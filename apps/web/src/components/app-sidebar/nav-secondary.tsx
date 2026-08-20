import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavSecondary({
	links,
}: {
	links: {
		name: string;
		url: string;
		icon: LucideIcon;
	}[];
}) {
	return (
		<SidebarGroup className="mt-auto group/collapsible">
			<SidebarGroupLabel>Main menu</SidebarGroupLabel>
			<SidebarMenu>
				{links.map((item) => (
					<SidebarMenuItem key={item.name}>
						<SidebarMenuButton asChild size="sm">
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
