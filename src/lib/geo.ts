// IP Geolocation using MaxMind GeoLite2

import path from "node:path";
import { Reader } from "@maxmind/geoip2-node";

let reader: Reader | null = null;

/**
 * Initialize the MaxMind reader (lazy loaded)
 */
async function getReader(): Promise<Reader> {
	if (!reader) {
		const dbPath = path.join(
			process.cwd(),
			"src/workers/maxmind/GeoLite2-City.mmdb",
		);
		reader = await Reader.open(dbPath);
	}
	return reader;
}

export interface GeoLocation {
	countryCode: string | null;
	countryName: string | null;
	city: string | null;
	latitude: string | null;
	longitude: string | null;
}

/**
 * Parse IP address to get geolocation data
 */
export async function parseIpGeolocation(
	ip: string | null | undefined,
): Promise<GeoLocation> {
	const defaultGeo: GeoLocation = {
		countryCode: null,
		countryName: null,
		city: null,
		latitude: null,
		longitude: null,
	};

	if (!ip) return defaultGeo;

	try {
		const geoReader = await getReader();
		// @ts-expect-error - MaxMind types are incomplete
		const response = await geoReader.city(ip);

		return {
			countryCode: response.country?.isoCode || null,
			countryName: response.country?.names?.en || null,
			city: response.city?.names?.en || null,
			latitude: response.location?.latitude?.toString() || null,
			longitude: response.location?.longitude?.toString() || null,
		};
	} catch (error) {
		// IP not found in database or invalid IP
		console.error("Geolocation lookup failed:", error);
		return defaultGeo;
	}
}
