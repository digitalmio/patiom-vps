// Hash function for creating unique identifiers (djb2 algorithm)
// for now this is a copy/paste from plugins/shared/hash.ts
export function createDjb2Hash(str: string): number {
	let val = 0;
	const strlen = str.length;

	if (strlen === 0) {
		return 0;
	}

	for (let i = 0; i < strlen; i++) {
		const code = str.charCodeAt(i);
		val = (val << 5) - val + code;
		val &= val; // Convert to 32-bit integer
	}

	return val >>> 0; // Convert to unsigned 32-bit integer
}
