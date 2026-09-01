import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SitePage } from "@/components/marketing/site-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
	component: LandingPage,
	head: () => ({
		meta: [
			{ title: "Patiom — GraphQL analytics platform" },
			{
				name: "description",
				content:
					"Schema history, field-level usage, slow operations and errors for your GraphQL API. A 3-line install for Yoga, Apollo and Mercurius.",
			},
			{ property: "og:title", content: "Patiom — GraphQL analytics platform" },
			{
				property: "og:description",
				content:
					"Know exactly how your GraphQL API is used. Schema history, field usage, performance and errors.",
			},
		],
	}),
});

function LandingPage() {
	return (
		<SitePage>
			<Hero />
			<SocialProof />
			<Features />
			<HowItWorks />
			<Pricing />
			<CtaSection />
		</SitePage>
	);
}

function Hero() {
	return (
		<section className="mx-auto max-w-6xl px-4 pt-20 pb-16 text-center sm:pt-28">
			<p className="text-muted-foreground mb-4 text-sm font-medium tracking-wide uppercase">
				GraphQL analytics
			</p>
			<h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
				Know exactly how your GraphQL API is used
			</h1>
			<p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-lg text-balance">
				Schema history with diffs, field-level usage, slow operations and errors
				— from a 3-line install. No PII, no variables, no storage of your users'
				data.
			</p>
			<div className="mt-8 flex items-center justify-center gap-3">
				<a href="/auth">
					<Button size="lg">Start free</Button>
				</a>
				<a href="#how">
					<Button size="lg" variant="outline">
						See how it works
					</Button>
				</a>
			</div>
		</section>
	);
}

const worksWith = ["GraphQL Yoga", "Apollo Server", "Mercurius", "Envelope"];

function SocialProof() {
	return (
		<section className="border-y">
			<div className="text-muted-foreground mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-2 px-4 py-6 text-sm">
				<span>Works with</span>
				{worksWith.map((name) => (
					<span key={name} className="font-medium">
						{name}
					</span>
				))}
			</div>
		</section>
	);
}

const features: { title: string; body: ReactNode }[] = [
	{
		title: "Schema history & diffs",
		body: "Every deploy is versioned. See what changed, when, and which operations each version served — including breaking-change detection.",
	},
	{
		title: "Field-level usage",
		body: "Which fields are actually queried, across versions and over time. Deprecate with confidence instead of guessing.",
	},
	{
		title: "Slowest operations",
		body: "Latency percentiles per operation, so you fix the queries that matter instead of the ones that shout.",
	},
	{
		title: "Errors that correlate",
		body: "Error counts next to the operations that caused them — spot the field resolver that started failing after a deploy.",
	},
	{
		title: "Privacy-first by design",
		body: "No variables, no response data, no user identifiers. Country-level geo only. Your customers' data never leaves your servers.",
	},
	{
		title: "Multi-framework",
		body: "First-class plugins for GraphQL Yoga, Apollo Server and Mercurius, plus an HTTP endpoint for anything else.",
	},
];

function Features() {
	return (
		<section className="mx-auto max-w-6xl px-4 py-20">
			<h2 className="text-center text-3xl font-bold tracking-tight">
				Everything you need to run a GraphQL API in production
			</h2>
			<div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{features.map((feature) => (
					<div
						key={feature.title}
						className="bg-card rounded-xl border p-6 shadow-sm"
					>
						<h3 className="font-semibold">{feature.title}</h3>
						<p className="text-muted-foreground mt-2 text-sm">{feature.body}</p>
					</div>
				))}
			</div>
		</section>
	);
}

const quickstart = `import { createPatiom } from "@patiom/client/yoga";

const patiom = createPatiom({ token: process.env.PATIOM_TOKEN });

createYoga({ plugins: [patiom()] })`;

function HowItWorks() {
	return (
		<section id="how" className="bg-muted/30 border-y">
			<div className="mx-auto max-w-6xl px-4 py-20">
				<h2 className="text-center text-3xl font-bold tracking-tight">
					Up and running in three steps
				</h2>
				<div className="mt-12 grid items-start gap-10 lg:grid-cols-2">
					<ol className="space-y-8">
						{[
							{
								title: "Create a project",
								body: "Sign up, create a project, copy the token. Takes a minute.",
							},
							{
								title: "Add the plugin",
								body: "One import and one line in your server config. Zero changes to your resolvers.",
							},
							{
								title: "Explore your data",
								body: "Schema history, field usage, latency and errors appear in your dashboard within seconds.",
							},
						].map((step, index) => (
							<li key={step.title} className="flex gap-4">
								<span className="bg-primary text-primary-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">
									{index + 1}
								</span>
								<div>
									<h3 className="font-semibold">{step.title}</h3>
									<p className="text-muted-foreground mt-1 text-sm">
										{step.body}
									</p>
								</div>
							</li>
						))}
					</ol>
					<div className="bg-card overflow-hidden rounded-xl border shadow-sm">
						<div className="bg-muted/50 border-b px-4 py-2 text-xs font-medium">
							yoga.ts
						</div>
						<pre className="overflow-x-auto p-4 text-sm">
							<code>{quickstart}</code>
						</pre>
					</div>
				</div>
			</div>
		</section>
	);
}

const tiers = [
	{
		name: "Free",
		price: "$0",
		description: "For side projects and trying Patiom out.",
		features: [
			"1 project",
			"7-day data retention",
			"100k requests / month",
			"Full dashboard",
		],
		cta: "Start free",
		highlight: false,
	},
	{
		name: "Pro",
		price: "$29",
		description: "For production APIs and growing teams.",
		features: [
			"3 projects",
			"90-day data retention",
			"2M requests / month",
			"Schema diff alerts",
		],
		cta: "Get Pro",
		highlight: true,
	},
	{
		name: "Scale",
		price: "$99+",
		description: "For high-traffic APIs and platform teams.",
		features: [
			"Unlimited projects",
			"Custom retention",
			"Volume pricing",
			"Priority support",
		],
		cta: "Contact us",
		highlight: false,
	},
];

function Pricing() {
	return (
		<section className="mx-auto max-w-6xl px-4 py-20">
			<h2 className="text-center text-3xl font-bold tracking-tight">
				Simple pricing
			</h2>
			<p className="text-muted-foreground mt-2 text-center">
				Pricing scales with usage, not with seats.
			</p>
			<div className="mt-12 grid gap-6 lg:grid-cols-3">
				{tiers.map((tier) => (
					<div
						key={tier.name}
						className={`bg-card rounded-xl border p-6 shadow-sm ${
							tier.highlight ? "border-primary ring-primary/20 ring-2" : ""
						}`}
					>
						<h3 className="font-semibold">{tier.name}</h3>
						<p className="mt-2 text-3xl font-bold">
							{tier.price}
							<span className="text-muted-foreground text-sm font-normal">
								/mo
							</span>
						</p>
						<p className="text-muted-foreground mt-2 text-sm">
							{tier.description}
						</p>
						<ul className="mt-6 space-y-2 text-sm">
							{tier.features.map((feature) => (
								<li key={feature} className="flex items-center gap-2">
									<span className="text-primary">✓</span>
									{feature}
								</li>
							))}
						</ul>
						<a href="/auth" className="mt-8 block">
							<Button
								className="w-full"
								variant={tier.highlight ? "default" : "outline"}
							>
								{tier.cta}
							</Button>
						</a>
					</div>
				))}
			</div>
		</section>
	);
}

function CtaSection() {
	return (
		<section className="border-t">
			<div className="mx-auto max-w-6xl px-4 py-20 text-center">
				<h2 className="text-3xl font-bold tracking-tight">
					Stop guessing how your API is used
				</h2>
				<p className="text-muted-foreground mx-auto mt-3 max-w-xl">
					Install the plugin, send your first request, and watch the data land
					in under a minute.
				</p>
				<a href="/auth" className="mt-8 inline-block">
					<Button size="lg">Start free</Button>
				</a>
			</div>
		</section>
	);
}
