import { mkdir, writeFile } from "node:fs/promises";

const RESOURCES = [
	"films",
	"people",
	"planets",
	"species",
	"starships",
	"vehicles",
] as const;

const BASE_URL = "https://swapi.info/api";
const OUT_DIR = new URL("../data/", import.meta.url);

async function fetchResource(resource: string): Promise<unknown[]> {
	const res = await fetch(`${BASE_URL}/${resource}`);
	if (!res.ok) {
		throw new Error(`Failed to fetch ${resource}: ${res.status}`);
	}
	const data: unknown = await res.json();
	if (!Array.isArray(data)) {
		throw new Error(`Unexpected response shape for ${resource}`);
	}
	return data;
}

for (const resource of RESOURCES) {
	const records = await fetchResource(resource);
	await mkdir(OUT_DIR, { recursive: true });
	await writeFile(
		new URL(`${resource}.json`, OUT_DIR),
		`${JSON.stringify(records, null, 2)}\n`,
	);
	console.log(`${resource}: ${records.length} records`);
}