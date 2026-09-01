const encoder = new TextEncoder();

/**
 * SHA-256 hex digest of an IP address. Stored instead of the raw address:
 * geo is resolved before hashing, so analytics keep country/city and
 * distinct-visitor counting, while no PII address is persisted.
 */
export async function hashIp(ip: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(ip));
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}
