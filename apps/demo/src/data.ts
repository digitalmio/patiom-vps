import filmsJson from "../data/films.json";
import peopleJson from "../data/people.json";
import planetsJson from "../data/planets.json";
import speciesJson from "../data/species.json";
import starshipsJson from "../data/starships.json";
import vehiclesJson from "../data/vehicles.json";

export type SwapiRecord = {
	url: string;
	[key: string]: unknown;
};

export const films = filmsJson as SwapiRecord[];
export const people = peopleJson as SwapiRecord[];
export const planets = planetsJson as SwapiRecord[];
export const species = speciesJson as SwapiRecord[];
export const starships = starshipsJson as SwapiRecord[];
export const vehicles = vehiclesJson as SwapiRecord[];

const byUrl = new Map<string, SwapiRecord>();

for (const record of [
	...films,
	...people,
	...planets,
	...species,
	...starships,
	...vehicles,
]) {
	byUrl.set(record.url, record);
}

export function getByUrl(url: unknown): SwapiRecord | null {
	if (typeof url !== "string") return null;
	return byUrl.get(url) ?? null;
}

export function getId(url: string): string {
	const trimmed = url.endsWith("/") ? url.slice(0, -1) : url;
	const index = trimmed.lastIndexOf("/");
	return index === -1 ? trimmed : trimmed.slice(index + 1);
}

export function listByType(type: string): SwapiRecord[] {
	switch (type) {
		case "films":
			return films;
		case "people":
			return people;
		case "planets":
			return planets;
		case "species":
			return species;
		case "starships":
			return starships;
		case "vehicles":
			return vehicles;
		default:
			return [];
	}
}

export function getByTypeId(type: string, id: string): SwapiRecord | null {
	return listByType(type).find((record) => getId(record.url) === id) ?? null;
}

export function resolveMany(urls: unknown): SwapiRecord[] {
	if (!Array.isArray(urls)) return [];
	return urls
		.map((url) => getByUrl(url))
		.filter((record): record is SwapiRecord => record !== null);
}

export function toInt(value: unknown): number | null {
	if (typeof value !== "string") {
		return typeof value === "number" && Number.isFinite(value) ? value : null;
	}
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

export function toFloat(value: unknown): number | null {
	if (typeof value !== "string") {
		return typeof value === "number" && Number.isFinite(value) ? value : null;
	}
	const parsed = Number.parseFloat(value);
	return Number.isNaN(parsed) ? null : parsed;
}
