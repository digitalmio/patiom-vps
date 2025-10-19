export type LogJobData = {
	projectId: string;
	timestamp: Date;

	// GraphQL Operation
	operation: string;
	operationName?: string | null;
	variableHash?: number;

	// Performance
	elapsed: number;
	responseSize: number;
	responseHash: number;

	// Client Info
	graphqlClientName?: string;
	graphqlClientVersion?: string;

	// Network
	method: string;
	statusCode: number;
	hasSetCookie: boolean;
	referer?: string;
	userAgent?: string;
	ip?: string;

	// Cache
	varyHash?: number;

	// Errors
	errors?: Array<{
		message: string;
		locations?: Array<{ line: number; column: number }>;
		path?: Array<string | number>;
	}>;
};
