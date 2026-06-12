import fs from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import { PassThrough } from "node:stream";

const LOCKFILES = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"];

type ArchiveOptions = {
	cwd: string;
	include: string[];
};

export const archive = async ({ cwd, include }: ArchiveOptions): Promise<Buffer> => {
	let lockfileName: string | null = null;
	for (const candidate of LOCKFILES) {
		try {
			await fs.access(path.join(cwd, candidate));
			lockfileName = candidate;
			break;
		} catch {
			// not found, try next
		}
	}

	const addToDir: { path: string; name: string }[] = [];
	const addToFile: { path: string; name: string }[] = [];

	for (const item of include) {
		const itemPath = path.join(cwd, item);
		let stats;
		try {
			stats = await fs.stat(itemPath);
		} catch {
			console.warn(`Include path not found, skipping: ${item}`);
			continue;
		}
		if (stats.isDirectory()) {
			addToDir.push({ path: itemPath, name: item });
		} else {
			addToFile.push({ path: itemPath, name: item });
		}
	}

	return new Promise<Buffer>((resolve, reject) => {
		const zip = archiver("zip", { zlib: { level: 9 } });
		const passThrough = new PassThrough();
		const chunks: Buffer[] = [];

		passThrough.on("data", (chunk: Buffer) => chunks.push(chunk));
		passThrough.on("end", () => resolve(Buffer.concat(chunks)));
		passThrough.on("error", reject);

		zip.pipe(passThrough);

		zip.file(path.join(cwd, "package.json"), { name: "package.json" });

		if (lockfileName) {
			zip.file(path.join(cwd, lockfileName), { name: lockfileName });
		}

		for (const d of addToDir) {
			zip.directory(d.path, d.name);
		}

		for (const f of addToFile) {
			zip.file(f.path, { name: f.name });
		}

		zip.on("error", reject);
		zip.finalize();
	});
};
