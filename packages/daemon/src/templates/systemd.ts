import { PATIOM_ROOT } from "../config";

type AppTemplateParams = {
  fnmBinPath: string;
  startScript: string;
};

export const appServiceTemplate = ({ fnmBinPath, startScript }: AppTemplateParams) => `[Unit]
Description=Patiom App: %p (port %i)
After=network.target

[Service]
Type=exec
WorkingDirectory=${PATIOM_ROOT}/apps/%p/current
ExecStart=${fnmBinPath}/node ${PATIOM_ROOT}/apps/%p/current/${startScript}
Restart=always
EnvironmentFile=${PATIOM_ROOT}/apps/%p/shared/.env
Environment=PORT=%i

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
  fnmBinPath: string;
  daemonBinPath: string;
  port: number;
};

export const daemonServiceTemplate = ({ fnmBinPath, daemonBinPath, port }: DaemonTemplateParams) => `[Unit]
Description=Patiom Daemon
After=network.target

[Service]
Type=exec
ExecStart=${fnmBinPath}/node ${daemonBinPath}
Restart=always
Environment=PORT=${port}

[Install]
WantedBy=multi-user.target
`;
