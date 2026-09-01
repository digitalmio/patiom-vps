import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SitePage } from "@/components/marketing/site-shell";

export const Route = createFileRoute("/privacy")({
	component: PrivacyPage,
	head: () => ({
		meta: [
			{ title: "Privacy & data — Patiom" },
			{
				name: "description",
				content:
					"Exactly what Patiom collects from your GraphQL API, what it never collects, and how long data is kept.",
			},
		],
	}),
});

function PrivacyPage() {
	return (
		<SitePage>
			<article className="mx-auto max-w-3xl px-4 py-16">
				<h1 className="text-3xl font-bold tracking-tight">
					Privacy &amp; data
				</h1>
				<p className="text-muted-foreground mt-3">
					Patiom is an analytics tool that runs inside your GraphQL server. This
					page states plainly what it collects and what it never touches.
				</p>

				<Section title="What we collect">
					<ul>
						<li>
							<strong>Your schema</strong> — the GraphQL introspection result,
							sent once per schema change.
						</li>
						<li>
							<strong>Operation metadata</strong> — operation name, operation
							type and the operation document text (the query your server
							received).
						</li>
						<li>
							<strong>Field paths</strong> — which fields were requested (e.g.{" "}
							<code>Film.title</code>), derived from your schema.
						</li>
						<li>
							<strong>Performance data</strong> — request duration, status
							codes, error counts and error codes.
						</li>
						<li>
							<strong>Coarse location</strong> — country derived from the client
							IP. The IP itself is not stored.
						</li>
						<li>
							<strong>Client info</strong> — user-agent of the GraphQL client
							(parsed into name/version; the raw header is not stored).
						</li>
					</ul>
				</Section>

				<Section title="What we never collect">
					<ul>
						<li>
							Variables — the arguments your API callers pass are never sent to
							Patiom.
						</li>
						<li>
							Response data — nothing your resolvers return is seen or stored.
						</li>
						<li>
							Authentication material — no headers, cookies or tokens beyond
							your own Patiom project token.
						</li>
						<li>
							Raw IP addresses, email addresses of your API users, or any other
							end-user PII.
						</li>
					</ul>
				</Section>

				<Section title="Retention">
					<p>
						Request logs are kept according to your plan (7 days on Free, 90
						days on Pro) and then deleted. Schema versions and their aggregate
						statistics are kept for the life of the project, because they are
						the product.
					</p>
				</Section>

				<Section title="Where data lives">
					<p>
						Data is processed on Cloudflare Workers and stored in an encrypted
						Postgres database. We do not share, sell or use your data for
						advertising — ever.
					</p>
				</Section>

				<Section title="Contact">
					<p>
						Questions about this policy? Email{" "}
						<a
							href="mailto:hello@patiom.dev"
							className="text-primary underline underline-offset-4"
						>
							hello@patiom.dev
						</a>
						.
					</p>
				</Section>
			</article>
		</SitePage>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="mt-10">
			<h2 className="text-xl font-semibold">{title}</h2>
			<div className="text-muted-foreground mt-3 space-y-2 text-sm leading-relaxed">
				{children}
			</div>
		</section>
	);
}
