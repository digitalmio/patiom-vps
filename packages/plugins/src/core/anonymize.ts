import { parse, print, visit } from "graphql";
import { createDjb2Hash } from "./hash";

/**
 * Strip potentially sensitive information from an operation's source text
 * while preserving its structure: argument values (often contain user data),
 * aliases and their values are removed. The selection shape is kept intact so
 * server-side field-usage analytics keep working.
 *
 * If the operation cannot be parsed (batching, unsupported syntax), a stable
 * hash placeholder is returned instead — the raw text is never sent.
 */
export function anonymizeQuery(operation: string): string {
	try {
		const document = parse(operation);
		const anonymized = visit(document, {
			Argument: () => null,
			Field: (node) => (node.alias ? { ...node, alias: undefined } : undefined),
		});
		return print(anonymized);
	} catch {
		return `__anonymized_${createDjb2Hash(operation)}__`;
	}
}
