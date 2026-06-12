type SystemDParams = {
	appName: string;
	appPath: string;
	fnmBinPath: string;
};

export const systemDTemplate = ({ appName, appPath, fnmBinPath }: SystemDParams) => `[Unit]
Description=Patiom App: ${appName}
After=network.target

[Service]
Type=exec
WorkingDirectory=${appPath}
# Point directly to the active fnm node binary
ExecStart=${fnmBinPath}/node ${appPath}/dist/index.js
Restart=always
EnvironmentFile=${appPath}/.env

# The single-server security magic
DynamicUser=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=${appPath}

[Install]
WantedBy=multi-user.target
`;
