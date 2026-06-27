import Table from "cli-table3";
import pc from "picocolors";

export const stateColor = (state: string): string => {
  switch (state) {
    case "active":
      return pc.green(state);
    case "failed":
      return pc.red(state);
    case "inactive":
    case "deactivating":
      return pc.yellow(state);
    default:
      return pc.dim(state);
  }
};

export const scopeColor = (scope: string): string => {
  switch (scope) {
    case "master":
      return pc.magenta(scope);
    case "rw":
      return pc.cyan(scope);
    case "ro":
      return pc.dim(scope);
    default:
      return scope;
  }
};

export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

type TableOptions = {
  colWidths?: number[];
};

export const createTable = (headers: string[], rows: string[][], options?: TableOptions): string => {
  const table = new Table({
    head: headers.map((h) => pc.bold(h)),
    style: {
      head: [],
      border: ["dim"],
      "padding-left": 2,
      "padding-right": 2,
    },
    ...(options?.colWidths ? { colWidths: options.colWidths } : {}),
    wordWrap: true,
  });
  rows.forEach((row) => table.push(row));
  return table.toString();
};

export const printTable = (headers: string[], rows: string[][], options?: TableOptions): void => {
  console.log("");
  console.log(createTable(headers, rows, options));
};
