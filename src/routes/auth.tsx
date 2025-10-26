import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "@/lib/auth/client";

export const Route = createFileRoute("/auth")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div>
			<button
				type="button"
				onClick={async () =>
					await authClient.signIn.social({
						provider: "github",
						// callbackURL: "http://localhost:3000/",
					})
				}
			>
				Login
			</button>
		</div>
	);
}
