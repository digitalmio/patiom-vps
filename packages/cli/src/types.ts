export type PatiomConfig = {
  include?: string[];
  domains?: string[];
  sslipDomain?: boolean;
  instances?: number;
  dbFolder?: string;
  storageFolder?: string;
};

export type GlobalConfig = {
  url: string;
  token: string;
};
