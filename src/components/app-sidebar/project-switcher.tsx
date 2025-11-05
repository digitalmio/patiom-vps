import { useNavigate } from "@tanstack/react-router";
import { ChevronsUpDown, Layers, Plus } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import type { schema } from "@/lib/db";

export function ProjectSwitcher({
	projects,
	activeProject,
}: {
	projects: (typeof schema.projects.$inferSelect)[];
	activeProject: string | null;
}) {
	const { isMobile } = useSidebar();
	const navigate = useNavigate();

	const activeProjectData =
		(Boolean(activeProject) && projects.find((p) => p.id === activeProject)) ||
		projects[0];

	if (!activeProjectData) {
		return null;
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
								<Layers className="size-4" />
							</div>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">
									{activeProjectData.name}
								</span>
								<span className="truncate text-xs">
									{activeProjectData.description}
								</span>
							</div>
							<ChevronsUpDown className="ml-auto" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
						align="start"
						side={isMobile ? "bottom" : "right"}
						sideOffset={4}
					>
						<DropdownMenuLabel className="text-muted-foreground text-xs">
							Your Projects
						</DropdownMenuLabel>
						{projects.map((project) => {
							return (
								<DropdownMenuItem
									key={project.name}
									onClick={() => navigate({ to: `/project/${project.id}/` })}
									className="gap-2 p-2"
								>
									<div className="flex size-6 items-center justify-center rounded-md border">
										<Layers className="size-3.5 shrink-0" />
									</div>
									{project.name}
								</DropdownMenuItem>
							);
						})}
						<DropdownMenuSeparator />
						<DropdownMenuItem className="gap-2 p-2">
							<div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
								<Plus className="size-4" />
							</div>
							<div className="text-muted-foreground font-medium">
								Add new project
							</div>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
