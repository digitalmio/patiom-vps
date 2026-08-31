/**
 * Generate a URL-friendly slug from a string
 * @param text - The text to convert to a slug
 * @returns A slugified version of the text
 */
export function slugify(text: string): string {
	return text
		.toString()
		.toLowerCase()
		.trim()
		.replace(/\s+/g, "-") // Replace spaces with -
		.replace(/[^\w-]+/g, "") // Remove all non-word chars
		.replace(/--+/g, "-") // Replace multiple - with single -
		.replace(/^-+/, "") // Trim - from start of text
		.replace(/-+$/, ""); // Trim - from end of text
}

/**
 * Generate a unique slug by appending a random suffix if needed
 * @param text - The text to convert to a slug
 * @param existingSlugs - Optional array of existing slugs to avoid collisions
 * @returns A unique slugified version of the text
 */
export function generateUniqueSlug(
	text: string,
	existingSlugs?: string[],
): string {
	const baseSlug = slugify(text);

	if (!existingSlugs || !existingSlugs.includes(baseSlug)) {
		return baseSlug;
	}

	// Append random suffix if slug already exists
	const randomSuffix = Math.random().toString(36).substring(2, 6);
	return `${baseSlug}-${randomSuffix}`;
}
