import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
	return (
		<header className="bg-background/80 sticky top-0 z-50 border-b backdrop-blur">
			<div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
				<Link to="/" className="flex items-center gap-2">
					<img src="/logo/patiom-logo.svg" alt="Patiom" className="h-6" />
				</Link>
				<nav className="flex items-center gap-4">
					<Link
						to="/privacy"
						className="text-muted-foreground hover:text-foreground hidden text-sm sm:inline"
					>
						Privacy
					</Link>
					<Link to="/auth">
						<Button variant="ghost" size="sm">
							Log in
						</Button>
					</Link>
					<Link to="/auth">
						<Button size="sm">Get started</Button>
					</Link>
				</nav>
			</div>
		</header>
	);
}

export function SiteFooter() {
	return (
		<footer className="border-t">
			<div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm sm:flex-row">
				<span>© {new Date().getFullYear()} Patiom</span>
				<nav className="flex items-center gap-4">
					<Link to="/privacy" className="hover:text-foreground">
						Privacy
					</Link>
					<a href="https://ingest.patiom.dev" className="hover:text-foreground">
						Status
					</a>
				</nav>
			</div>
		</footer>
	);
}

export function SitePage({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-svh flex-col">
			<SiteHeader />
			<main className="flex-1">{children}</main>
			<SiteFooter />
		</div>
	);
}
