export const typeDefs = /* GraphQL */ `
	scalar DateTime
	scalar JSON

	enum Granularity {
		hour
		day
	}

	type Query {
		project: Project!
		operations(
			granularity: Granularity! = day
			from: DateTime
			to: DateTime
		): [OperationStats!]!
		recentOperations(limit: Int = 20): [OperationSummary!]!
		fields(from: DateTime, to: DateTime, limit: Int = 25): [FieldUsage!]!
		errors(
			operationName: String
			from: DateTime
			to: DateTime
			limit: Int = 50
			offset: Int = 0
		): [ErrorLog!]!
		requests(
			operationName: String
			statusCode: Int
			from: DateTime
			to: DateTime
			limit: Int = 50
			offset: Int = 0
		): [RequestLog!]!
		dashboard(from: DateTime, to: DateTime): Dashboard!
	}

	type Project {
		id: ID!
		name: String!
		description: String
		createdAt: DateTime!
	}

	type OperationStats {
		bucket: DateTime!
		operationName: String
		totalRequests: Int!
		avgLatencyMs: Float
		minLatencyMs: Int
		maxLatencyMs: Int
		p50LatencyMs: Float
		p95LatencyMs: Float
		p99LatencyMs: Float
		totalResponseSizeBytes: Int
		errorCount: Int
		errorRatePct: Float
	}

	type OperationSummary {
		operationName: String
		totalRequests: Int!
		avgLatencyMs: Float
		p95LatencyMs: Float
		errorRatePct: Float
	}

	type FieldUsage {
		fieldId: ID!
		fieldPath: String!
		parentType: String!
		bucket: DateTime!
		usageCount: Int!
	}

	type ErrorLog {
		id: ID!
		timestamp: DateTime!
		operationName: String
		elapsedMs: Int
		statusCode: Int
		errors: JSON
		ip: String
		userAgent: String
	}

	type RequestLog {
		id: ID!
		timestamp: DateTime!
		operationType: String
		operationName: String
		operation: String!
		elapsedMs: Int!
		responseSizeBytes: Int
		statusCode: Int!
		hasSetCookie: Boolean
		referer: String
		userAgent: String
		ip: String
		browserName: String
		osName: String
		countryCode: String
		countryName: String
		city: String
		errorCount: Int
		errors: JSON
		requestedFieldIds: [String!]
	}

	type Dashboard {
		totalRequests: Int!
		errorCount: Int!
		errorRatePct: Float
		avgLatencyMs: Float
		p95LatencyMs: Float
		recentOperations: [OperationSummary!]!
		topFields: [FieldUsage!]!
		hourly: [OperationStats!]!
	}
`;
