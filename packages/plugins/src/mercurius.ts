import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DocumentNode, GraphQLError, GraphQLSchema } from "graphql";
import { createPatiomLogger } from "./core/logger";
import type { Headers, PatiomLoggerOptions } from "./core/types";

type MercuriusGraphQL = {
	schema?: GraphQLSchema;
	// biome-ignore lint/suspicious/noExplicitAny: loose view of mercurius' addHook signature
	addHook(event: string, hook: (...args: any[]) => unknown): void;
};

type MercuriusContext = {
	reply?: FastifyReply;
	[key: string]: unknown;
};

type Pending = {
	start: number;
	source: string;
	operationName?: string | null;
	variables?: Record<string, unknown> | null;
	request: FastifyRequest;
	reply: FastifyReply;
};

const pending = new WeakMap<object, Pending>();

function requestHeaders(request: FastifyRequest): Headers {
	return {
		get(name) {
			const value = request.headers[name.toLowerCase()];
			return value == null
				? null
				: Array.isArray(value)
					? (value[0] ?? null)
					: value;
		},
		has(name) {
			return request.headers[name.toLowerCase()] != null;
		},
	};
}

function responseHeaders(reply: FastifyReply): Headers {
	const raw = reply.getHeaders();
	return {
		get(name) {
			const value = raw[name.toLowerCase()];
			return value == null
				? null
				: Array.isArray(value)
					? (value[0] ?? null)
					: String(value);
		},
		has(name) {
			return raw[name.toLowerCase()] != null;
		},
	};
}

function operationNameFromDocument(document: DocumentNode): string | undefined {
	const definition = document.definitions.find(
		(def) => def.kind === "OperationDefinition" && def.name,
	);
	return (definition as { name?: { value?: string } } | undefined)?.name?.value;
}

export type PatiomMercuriusPlugin = {
	/**
	 * Register the Mercurius hooks. Call after Mercurius has been registered:
	 *   await patiom.register(fastify)
	 */
	register(fastify: FastifyInstance): Promise<void>;
	stop(): void;
};

export function createPatiomMercuriusPlugin(
	options: PatiomLoggerOptions,
): PatiomMercuriusPlugin {
	const logger = createPatiomLogger(options);

	return {
		async register(fastify: FastifyInstance) {
			const mercurius = (fastify as unknown as { graphql?: MercuriusGraphQL })
				.graphql;
			if (!mercurius) {
				console.warn(
					"Patiom Mercurius plugin must be registered after Mercurius.",
				);
				return;
			}

			await fastify.ready();

			if (mercurius.schema) {
				logger.sendSchema(mercurius.schema);
			}

			mercurius.addHook("onExtendSchema", async (schema: GraphQLSchema) => {
				logger.sendSchema(schema);
			});

			mercurius.addHook(
				"preParsing",
				async (
					_schema: GraphQLSchema,
					source: string,
					context: MercuriusContext,
				) => {
					const reply = context.reply;
					const request = reply?.request;
					if (!request) return;
					pending.set(context, {
						start: Date.now(),
						source,
						request,
						reply,
					});
				},
			);

			mercurius.addHook(
				"preExecution",
				async (
					_schema: GraphQLSchema,
					document: DocumentNode,
					context: MercuriusContext,
					variables: Record<string, unknown> | null | undefined,
				) => {
					const stored = pending.get(context);
					if (!stored) return;
					stored.variables = variables ?? null;
					stored.operationName = operationNameFromDocument(document);
				},
			);

			mercurius.addHook(
				"onResolution",
				async (
					execution: { data?: unknown; errors?: readonly GraphQLError[] },
					context: MercuriusContext,
				) => {
					const stored = pending.get(context);
					if (!stored) return;
					pending.delete(context);

					const headers = requestHeaders(stored.request);
					const resHeaders = responseHeaders(stored.reply);

					logger.log({
						headers,
						responseHeaders: resHeaders,
						operation: stored.source,
						method: stored.request.method,
						start: stored.start,
						operationName: stored.operationName,
						errors: execution.errors,
						response: execution.data,
						variables: stored.variables,
						hasSetCookie: resHeaders.has("set-cookie"),
						graphqlClientName:
							headers.get("x-graphql-client-name") ?? undefined,
						graphqlClientVersion:
							headers.get("x-graphql-client-version") ?? undefined,
						statusCode: stored.reply.statusCode,
					});
				},
			);
		},
		stop() {
			logger.stop();
		},
	};
}
