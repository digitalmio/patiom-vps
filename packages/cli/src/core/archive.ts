import fs from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import archiver from "archiver";
import { glob } from "glob";

type ArchiveOptions = {
	cwd: string;
	include: string[];
};

export const archive = async ({
	cwd,
	include,
}: ArchiveOptions): Promise<Buffer> => {
	let hasLockfile = false;
	try {
		await fs.access(path.join(cwd, "package-lock.json"));
		hasLockfile = true;
	} catch {
		// no lockfile
	}

	const files = await glob(include, { cwd, nodir: true });

	return new Promise<Buffer>((resolve, reject) => {
		const zip = archiver("zip", { zlib: { level: 9 } });
		const passThrough = new PassThrough();
		const chunks: Buffer[] = [];

		passThrough.on("data", (chunk: Buffer) => chunks.push(chunk));
		passThrough.on("end", () => resolve(Buffer.concat(chunks)));
		passThrough.on("error", reject);

		zip.pipe(passThrough);

		zip.file(path.join(cwd, "package.json"), { name: "package.json" });

		if (hasLockfile) {
			zip.file(path.join(cwd, "package-lock.json"), { name: "package-lock.json" });
		}

		files.forEach((file) =>
			zip.file(path.join(cwd, file), { name: file })
		);

		zip.on("error", reject);
		zip.finalize();
	});
};
