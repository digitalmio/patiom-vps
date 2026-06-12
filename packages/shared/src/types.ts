export type PatiomConfig = {
  include?: string[];
  domains?: string[];
  patiomRunDomain?: boolean;
  instances?: number;
  dbFolder?: string;
  storageFolder?: string;
};

export type DeployRequest = {
  name: string;
  type: "node";
  domains: string[];
  patiomRunDomain: boolean;
  instances: number;
  dbFolder: string;
  storageFolder: string;
};

export type GlobalConfig = {
  url: string;
  token: string;
};
