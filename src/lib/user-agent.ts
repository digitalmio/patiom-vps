// User-Agent parsing using Bowser
import Bowser from "bowser";

export interface ParsedUserAgent {
	browserName: string | null;
	browserVersion: string | null;
	osName: string | null;
	osVersion: string | null;
	platformType: string | null; // desktop, mobile, tablet, tv
}

/**
 * Parse user-agent string to extract browser, OS, and device information
 */
export function parseUserAgent(
	userAgent: string | null | undefined,
): ParsedUserAgent {
	const defaultUA: ParsedUserAgent = {
		browserName: null,
		browserVersion: null,
		osName: null,
		osVersion: null,
		platformType: null,
	};

	if (!userAgent) return defaultUA;

	try {
		const browser = Bowser.parse(userAgent);

		return {
			browserName: browser.browser.name || null,
			browserVersion: browser.browser.version || null,
			osName: browser.os.name || null,
			osVersion: browser.os.version || null,
			platformType: browser.platform.type || null,
		};
	} catch (error) {
		console.error("User-agent parsing failed:", error);
		return defaultUA;
	}
}
