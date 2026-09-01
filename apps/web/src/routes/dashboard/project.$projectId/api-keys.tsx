import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
	createProjectApiKey,
	deleteProjectApiKey,
	listProjectApiKeys,
} from "@/services/api-keys-sfn";

export const Route = createFileRoute("/dashboard/project/$projectId/api-keys")({
	component: RouteComponent,
	staticData: {
		title: "API Keys",
	},
});

type ApiKeyRecord = {
	id: string;
	name: string | null;
	start: string | null;
	createdAt: Date;
};

function RouteComponent() {
	const { projectId } = Route.useParams();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [createdKey, setCreatedKey] = useState<string | null>(null);

	const keysQuery = useQuery({
		queryKey: ["project-api-keys", projectId],
		queryFn: () => listProjectApiKeys({ data: { projectId } }),
	});

	const createMutation = useMutation({
		mutationFn: () =>
			createProjectApiKey({
				data: { projectId, name: name || undefined },
			}),
		onSuccess: (result) => {
			setCreatedKey(result.key);
			setName("");
			queryClient.invalidateQueries({
				queryKey: ["project-api-keys", projectId],
			});
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (keyId: string) => deleteProjectApiKey({ data: { keyId } }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["project-api-keys", projectId],
			});
		},
	});

	const keys = (keysQuery.data ?? []) as ApiKeyRecord[];

	return (
		<div className="p-6 space-y-6">
			<div>
				<h1 className="text-lg font-semibold">API Keys</h1>
				<p className="text-sm text-gray-500">
					Keys authenticate requests to the Patiom GraphQL data API
					(Authorization: Bearer ptk_...). The full key is shown only once at
					creation.
				</p>
			</div>

			{createdKey && (
				<div className="rounded border border-green-300 bg-green-50 p-3">
					<p className="text-sm font-semibold">Key created — copy it now</p>
					<code className="text-sm break-all">{createdKey}</code>
				</div>
			)}

			<form
				className="flex gap-2"
				onSubmit={(event) => {
					event.preventDefault();
					createMutation.mutate();
				}}
			>
				<input
					className="rounded border px-3 py-1.5 text-sm"
					placeholder="Key name (optional)"
					value={name}
					onChange={(event) => setName(event.target.value)}
				/>
				<button
					type="submit"
					className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50"
					disabled={createMutation.isPending}
				>
					Create key
				</button>
			</form>

			<ul className="space-y-2">
				{keys.map((key) => (
					<li
						key={key.id}
						className="flex items-center justify-between rounded border p-3"
					>
						<div>
							<p className="text-sm font-medium">
								{key.name ?? "Untitled key"}
							</p>
							<code className="text-xs text-gray-500">
								{key.start ?? "ptk_"}
							</code>
						</div>
						<button
							type="button"
							className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 disabled:opacity-50"
							disabled={deleteMutation.isPending}
							onClick={() => deleteMutation.mutate(key.id)}
						>
							Revoke
						</button>
					</li>
				))}
				{keys.length === 0 && !keysQuery.isLoading && (
					<li className="text-sm text-gray-500">
						No API keys yet. Create one to query the data API.
					</li>
				)}
			</ul>
		</div>
	);
}
