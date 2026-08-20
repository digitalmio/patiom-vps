import { type Db, eq, lt, schema } from "@patiom/db";
import type { GeoLocation } from "@patiom/shared";

export type GeoEnv = {
	IPLOCATE_KEY?: string;
	IP_GEO_TTL_DAYS?: string;
};

const API_URL = "https://iplocate.io/api/lookup";
const DEFAULT_TTL_DAYS = 5;
const PRUNE_INTERVAL_MS = 15 * 60 * 1000;
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;

const empty: GeoLocation = {
	countryCode: null,
	countryName: null,
	city: null,
	latitude: null,
	longitude: null,
};

let lastPrune = 0;
// In-isolate short-circuit for IPs whose API lookup recently failed (e.g.
// quota exhausted or API downtime) so we don't hammer the API from the same
// isolate.
const failedIps = new Map<string, number>();

type IpLocateResponse = {
	country?: string | null;
	country_code?: string | null;
	city?: string | null;
	latitude?: number | null;
	longitude?: number | null;
};

/**
 * Resolve an IP to a GeoLocation, using the DB cache first and falling back to
 * the IPLocate HTTP API on a cache miss. Successful lookups are cached with a
 * TTL (default 5 days).
 */
export async function resolveIpGeo(
	db: Db,
	env: GeoEnv,
	ip: string | null | undefined,
): Promise<GeoLocation> {
	if (!ip) return empty;

	const now = Date.now();

	// 1. Cache hit?
	const cached = await db.query.ipGeoCache.findFirst({
		where: eq(schema.ipGeoCache.ip, ip),
	});
	if (cached && cached.expiresAt.getTime() > now) {
		return {
			countryCode: cached.countryCode,
			countryName: cached.countryName,
			city: cached.city,
			latitude: null,
			longitude: null,
		};
	}

	// 2. Skip the API if it recently failed for this IP
	const lastFail = failedIps.get(ip);
	if (lastFail && now - lastFail < FAILURE_BACKOFF_MS) {
		return empty;
	}

	// 3. Cache miss -> call the API
	const geo = await lookupFromApi(env, ip);
	if (geo.countryCode) {
		const expiresAt = new Date(now + ttlMs(env));
		await db
			.insert(schema.ipGeoCache)
			.values({
				ip,
				countryCode: geo.countryCode,
				countryName: geo.countryName,
				city: geo.city,
				expiresAt,
			})
			.onConflictDoUpdate({
				target: schema.ipGeoCache.ip,
				set: {
					countryCode: geo.countryCode,
					countryName: geo.countryName,
					city: geo.city,
					updatedAt: new Date(),
					expiresAt,
				},
			});
	} else {
		failedIps.set(ip, now);
	}

	return geo;
}

async function lookupFromApi(env: GeoEnv, ip: string): Promise<GeoLocation> {
	if (!env.IPLOCATE_KEY) return empty;

	try {
		const url = new URL(`${API_URL}/${encodeURIComponent(ip)}`);
		url.searchParams.set("apikey", env.IPLOCATE_KEY);
		url.searchParams.set(
			"include",
			"country,country_code,city,latitude,longitude",
		);

		const res = await fetch(url);
		if (!res.ok) return empty;

		const data = (await res.json()) as IpLocateResponse;

		return {
			countryCode: data.country_code ?? null,
			countryName: data.country ?? null,
			city: data.city ?? null,
			latitude: data.latitude != null ? String(data.latitude) : null,
			longitude: data.longitude != null ? String(data.longitude) : null,
		};
	} catch (error) {
		console.error("iplocate lookup failed", { ip, error });
		return empty;
	}
}

/**
 * Opportunistically delete expired cache rows. Runs at most once per
 * PRUNE_INTERVAL_MS across the lifetime of the isolate.
 */
export async function pruneExpiredGeoCache(db: Db): Promise<void> {
	const now = Date.now();
	if (now - lastPrune < PRUNE_INTERVAL_MS) return;
	lastPrune = now;

	try {
		await db
			.delete(schema.ipGeoCache)
			.where(lt(schema.ipGeoCache.expiresAt, new Date(now)));
	} catch (error) {
		console.error("Failed to prune IP geo cache", error);
	}
}

function ttlMs(env: GeoEnv): number {
	const days = Number(env.IP_GEO_TTL_DAYS ?? DEFAULT_TTL_DAYS);
	const safe = Number.isFinite(days) && days > 0 ? days : DEFAULT_TTL_DAYS;
	return safe * 24 * 60 * 60 * 1000;
}
