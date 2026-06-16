import Conf from "conf";
import type { GlobalConfig } from "@patiom/shared";

export const config = new Conf<GlobalConfig>({
  projectName: "patiom",
  schema: {
    url: {
      type: "string",
      format: "uri",
    },
    token: {
      type: "string",
    },
  },
});
