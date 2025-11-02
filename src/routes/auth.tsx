import { createFileRoute, redirect } from "@tanstack/react-router";
import { Logo } from "@/components/app-sidebar/logo";
import { LoginForm } from "@/components/login-form";
import { authClient } from "@/lib/auth/client";

export const Route = createFileRoute("/auth")({
	component: RouteComponent,
	// beforeLoad: async () => {
	// 	console.log("Auth route - beforeLoad");
	// 	const req = getRequest();
	// 	// Check if user is already logged in
	// 	const session = await authClient.getSession({
	// 		fetchOptions: {
	// 			headers: req.headers as HeadersInit,
	// 		},
	// 	});
	// 	console.log("Auth route - session:", session);

	// 	if (session.data?.session) {
	// 		// User is logged in, redirect to home
	// 		throw redirect({ to: "/" });
	// 	}
	// },
});

function RouteComponent() {
	return (
		<div className="grid min-h-svh lg:grid-cols-2">
			<div className="flex flex-col gap-4 p-6 md:p-10">
				<div className="flex justify-center gap-2 md:justify-start">
					<Logo />
				</div>
				<div className="flex flex-1 items-center justify-center">
					<div className="w-full max-w-xs">
						<LoginForm />
					</div>
				</div>
			</div>
			<div className="bg-muted relative hidden lg:block">
				<img
					src="/bg3.jpg"
					alt="Placeholder of something nice"
					className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
				/>
			</div>
		</div>
	);
}
