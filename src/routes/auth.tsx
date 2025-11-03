import { createFileRoute, redirect } from "@tanstack/react-router";
import { Logo } from "@/components/app-sidebar/logo";
import { LoginForm } from "@/components/login-form";
import { getUserData } from "@/services/auth-server-fn";

export const Route = createFileRoute("/auth")({
	component: RouteComponent,
	staticData: {
		path: [["Auth", "/auth"]],
	},
	beforeLoad: async () => {
		const userId = await getUserData().then((data) => data?.id);
		if (userId) {
			throw redirect({ to: "/" });
		}
	},
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
