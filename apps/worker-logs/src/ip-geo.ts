import type { GeoLocation } from "@patiom/shared";
import { hashIp } from "./hash";

export type GeoEnv = {
	IPLOCATE_KEY?: string;
	IP_GEO_TTL_DAYS?: string;
};

const API_URL = "https://iplocate.io/api/lookup";
const DEFAULT_TTL_DAYS = 5;
const FAILURE_BACKOFF_MS = 5 * 60 * 1000;
// Synthetic origin used solely as a Cache API key namespace.
const CACHE_KEY_BASE = "https://geo-cache.patiom.internal/geo";

const empty: GeoLocation = {
	countryCode: null,
	countryName: null,
	city: null,
	latitude: null,
	longitude: null,
};

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

type WaitUntil = (promise: Promise<unknown>) => void;

/**
 * Resolve an IP to a GeoLocation using the Workers Cache API (keyed by the
 * SHA-256 hash of the IP — raw addresses are never persisted anywhere) and
 * falling back to the IPLocate HTTP API on a cache miss. Successful lookups
 * are cached at the edge with a TTL (default 5 days).
 */
export async function resolveIpGeo(
	env: GeoEnv,
	ip: string | null | undefined,
	waitUntil?: WaitUntil,
): Promise<GeoLocation> {
	if (!ip) return empty;

	const cacheKey = await hashIp(ip);
	const now = Date.now();
	return resolveIpGeoInner(env, ip, cacheKey, now, waitUntil);
}

async function resolveIpGeoInner(
	env: GeoEnv,
	ip: string,
	cacheKey: string,
	now: number,
	waitUntil?: WaitUntil,
): Promise<GeoLocation> {
	// 1. Skip the API if it recently failed for this IP
	const lastFail = failedIps.get(cacheKey);
	if (lastFail && now - lastFail < FAILURE_BACKOFF_MS) {
		return empty;
	}

	// 2. Edge cache lookup
	const cache = caches.default;
	const cacheRequest = new Request(`${CACHE_KEY_BASE}/${cacheKey}`);
	// workers-types narrows match() to `never` in some versions — accept both shapes.
	const cached = (await cache.match(cacheRequest)) as Response | undefined;
	if (cached) {
		return (await cached.json()) as GeoLocation;
	}

	// 3. Cache miss -> call the API
	const geo = await lookupFromApi(env, ip);
	if (geo.countryCode) {
		const stored = new Response(JSON.stringify(geo), {
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": `public, s-maxage=${ttlSeconds(env)}`,
			},
		});
		const put = cache.put(cacheRequest, stored.clone());
		if (waitUntil) {
			waitUntil(put);
		} else {
			await put;
		}
	} else {
		failedIps.set(cacheKey, now);
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

function ttlSeconds(env: GeoEnv): number {
	const days = Number(env.IP_GEO_TTL_DAYS ?? DEFAULT_TTL_DAYS);
	const safe = Number.isFinite(days) && days > 0 ? days : DEFAULT_TTL_DAYS;
	return safe * 24 * 60 * 60;
}
