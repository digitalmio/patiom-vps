import { PATIOM_ROOT } from "../config";

type AppTemplateParams = {
  nodeBinPath: string;
  startScript: string;
};

export const appServiceTemplate = ({ nodeBinPath, startScript }: AppTemplateParams) => `[Unit]
Description=Patiom App: %p (port %i)
After=network.target

[Service]
Type=exec
WorkingDirectory=${PATIOM_ROOT}/apps/%p/current
ExecStart=/usr/local/bin/pnpm run ${startScript}
Restart=always
EnvironmentFile=${PATIOM_ROOT}/apps/%p/shared/.env
Environment=PORT=%i
Environment=PATH=${nodeBinPath}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

DynamicUser=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=${PATIOM_ROOT}/apps/%p

[Install]
WantedBy=multi-user.target
`;

type RpxyTemplateParams = {
  rpxyBinPath: string;
};

export const rpxyServiceTemplate = ({ rpxyBinPath }: RpxyTemplateParams) => `[Unit]
Description=rpxy Reverse Proxy
After=network.target

[Service]
ExecStart=${rpxyBinPath} --config /etc/rpxy/config.toml
Restart=always
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
`;

type DaemonTemplateParams = {
  nodeBinPath: string;
  port: number;
};

export const daemonServiceTemplate = ({ nodeBinPath, port }: DaemonTemplateParams) => `[Unit]
Description=Patiom Daemon
After=network.target

[Service]
Type=exec
ExecStart=/usr/local/bin/patiom-server serve
Restart=always
Environment=PORT=${port}
Environment=PATH=${nodeBinPath}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

[Install]
WantedBy=multi-user.target
`;
