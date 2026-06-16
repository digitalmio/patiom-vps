import getPort, { portNumbers } from "get-port";
import { PORT_MIN, PORT_MAX } from "../config";

export type Logger = (msg: string) => void;

export const allocatePortBlock = async (
  instances: number,
  log: Logger
): Promise<number[]> => {
  log(`Allocating ${instances} contiguous ports...`);

  const port = await getPort({
    port: portNumbers(PORT_MIN, PORT_MAX),
  });

  const ports = Array.from({ length: instances }, (_, i) => port + i);

  if (port + instances - 1 > PORT_MAX) {
    throw new Error(
      `Could not allocate ${instances} contiguous ports in range ${PORT_MIN}-${PORT_MAX}`
    );
  }

  log(`Allocated ports: ${ports.join(", ")}`);
  return ports;
};

export const releasePorts = (
  ports: number[],
  log: Logger
): void => {
  log(`Releasing ports: ${ports.join(", ")}`);
};
