import type { GraphQLError } from "graphql";

export type Headers = {
	get(name: string): string | null;
	has(name: string): boolean;
};

export type PatiomPayloadOptions = {
	headers: Headers;
	operation: string;
	method: string;
	start: number;
	operationName?: string | null;
	errors?: readonly GraphQLError[] | null;
	response: unknown;
	variables?: Record<string, unknown> | null;
	responseHeaders?: Headers;
	hasSetCookie?: boolean;
	graphqlClientName?: string;
	graphqlClientVersion?: string;
};

export type PatiomPayload = {
	graphqlClientName?: string;
	graphqlClientVersion?: string;
	operation: string;
	operationName?: string | null;
	variables?: Record<string, unknown> | null;
	variableHash?: number;
	method: string;
	elapsed: number;
	ip?: string;
	hasSetCookie: boolean;
	referer?: string;
	userAgent?: string;
	statusCode: number;
	errors?: readonly GraphQLError[] | null;
	responseSize: number;
	responseHash: number;
	varyHash?: number;
};

export type PatiomLoggerOptions = {
	fetch?: typeof fetch;
	token: string;
	endpoint?: string;
	sendVariablesAsHash?: boolean;
	schemaSyncing?: boolean;
};
