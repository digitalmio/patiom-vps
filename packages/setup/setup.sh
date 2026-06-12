#!/bin/bash
set -e

if [ "$(id -u)" -ne 0 ]; then
    echo "❌ This script must be run as root. Try: sudo $0 $*"
    exit 1
fi

DAEMON_PORT=4000
SKIP_FIREWALL=false
ACME_PROXY=""
ACME_EMAIL=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --port)          DAEMON_PORT="$2"; shift 2 ;;
        --skip-firewall) SKIP_FIREWALL=true; shift ;;
        --acme-proxy)    ACME_PROXY="true"; shift ;;
        --no-acme-proxy) ACME_PROXY="false"; shift ;;
        --email)         ACME_EMAIL="$2"; shift 2 ;;
        -h|--help)
            echo "Usage: sudo $0 [--port PORT] [--skip-firewall] [--acme-proxy | --no-acme-proxy --email EMAIL]"
            echo "  --port PORT          Daemon port (default: 4000)"
            echo "  --skip-firewall      Skip UFW/Firewalld configuration"
            echo "  --acme-proxy         Use Patiom ACME relay for SSL (default if interactive)"
            echo "  --no-acme-proxy      Use direct Let's Encrypt (requires --email)"
            echo "  --email EMAIL        Email for Let's Encrypt (required with --no-acme-proxy)"
            exit 0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Validate ACME flags
if [[ "$ACME_PROXY" == "false" && -z "$ACME_EMAIL" ]]; then
    echo "❌ --email is required when using --no-acme-proxy"
    exit 1
fi

ufw_check_and_allow() {
    local rule="$1"
    if ! ufw status | grep -q "$rule"; then
        ufw allow "$rule"
    fi
}

echo "🚀 Starting Bare-Metal Micro-PaaS Provisioning..."

# ==========================================
# STEP 1: OS Detection
# ==========================================
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "❌ Cannot detect OS. Only Debian/Ubuntu and RHEL/Alma/Rocky are supported."
    exit 1
fi

echo "🐧 Detected OS: $OS"

# ==========================================
# STEP 2: Package Installation & Firewall
# ==========================================
if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    echo "📦 Installing apt dependencies & configuring UFW..."
    apt-get update -y
    apt-get install -y ufw curl wget unzip jq

    # UFW Setup
    if [[ "$SKIP_FIREWALL" != true ]]; then
        ufw default deny incoming
        ufw default allow outgoing
        ufw_check_and_allow 22/tcp
        ufw_check_and_allow 80/tcp
        ufw_check_and_allow 443/tcp
        ufw_check_and_allow $DAEMON_PORT/tcp
        ufw --force enable
    fi

elif [[ "$OS" == "almalinux" || "$OS" == "rocky" || "$OS" == "centos" || "$OS" == "fedora" || "$OS" == "rhel" ]]; then
    echo "📦 Installing dnf dependencies & configuring Firewalld..."
    dnf install -y curl wget unzip jq firewalld

    # Firewalld Setup
    if [[ "$SKIP_FIREWALL" != true ]]; then
        systemctl enable --now firewalld
        firewall-cmd --permanent --zone=public --add-port=22/tcp
        firewall-cmd --permanent --zone=public --add-port=80/tcp
        firewall-cmd --permanent --zone=public --add-port=443/tcp
        firewall-cmd --permanent --zone=public --add-port=$DAEMON_PORT/tcp
        firewall-cmd --reload
    fi

    # SELinux: Allow Node/rpxy to bind to network ports
    echo "🛡️ Configuring SELinux for web traffic..."
    setsebool -P httpd_can_network_connect 1 || true

else
    echo "❌ Unsupported OS: $OS. Please use Ubuntu, Debian, AlmaLinux, or Rocky Linux."
    exit 1
fi

# ==========================================
# STEP 3: fnm, Node, pnpm, and rpxy
# ==========================================
if ! command -v fnm &>/dev/null; then
    echo "🟩 Installing fnm..."
    curl -fsSL https://fnm.vercel.app/install | bash
fi
export PATH="$HOME/.local/share/fnm:$PATH"
eval "$(fnm env)"

# Install active LTS (Node 24)
fnm install 24
fnm default 24

echo "📦 Enabling pnpm via Corepack..."
corepack enable pnpm

echo "🦀 Detecting architecture and installing rpxy..."
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
    RPXY_PATTERN="x86_64-unknown-linux-gnu"
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    RPXY_PATTERN="aarch64-unknown-linux-gnu"
else
    echo "❌ Unsupported architecture: $ARCH"
    exit 1
fi

echo "🔍 Fetching rpxy latest release for $RPXY_PATTERN..."
RELEASE_JSON=$(curl -sf https://api.github.com/repos/junkurihara/rust-rpxy/releases/latest)

RPXY_TAG=$(printf '%s' "$RELEASE_JSON" | jq -r .tag_name)
if [ -z "$RPXY_TAG" ] || [ "$RPXY_TAG" = "null" ]; then
    echo "❌ Failed to fetch rpxy release info from GitHub API."
    exit 1
fi

RPXY_URL=$(printf '%s' "$RELEASE_JSON" | jq -r --arg pat "$RPXY_PATTERN" '.assets[] | select(.name == "rpxy-\($pat).tar.gz") | .browser_download_url')
RPXY_SHA=$(printf '%s' "$RELEASE_JSON" | jq -r --arg pat "$RPXY_PATTERN" '.assets[] | select(.name == "rpxy-\($pat).tar.gz") | .digest' | sed 's/^sha256://')

if [ -z "$RPXY_URL" ] || [ "$RPXY_URL" = "null" ]; then
    echo "❌ No matching rpxy asset found for pattern: rpxy-${RPXY_PATTERN}.tar.gz"
    exit 1
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "📥 Downloading rpxy $RPXY_TAG..."
curl -sfSL -o "$TMPDIR/rpxy.tar.gz" "$RPXY_URL"

if [ -n "$RPXY_SHA" ] && [ "$RPXY_SHA" != "null" ]; then
    EXPECTED_SHA=$(echo "$RPXY_SHA" | tr -d '[:space:]')
    ACTUAL_SHA=$(sha256sum "$TMPDIR/rpxy.tar.gz" | awk '{print $1}')
    if [ "$EXPECTED_SHA" != "$ACTUAL_SHA" ]; then
        echo "❌ rpxy SHA256 mismatch! Expected $EXPECTED_SHA, got $ACTUAL_SHA"
        exit 1
    fi
    echo "✅ rpxy integrity verified (SHA256)"
else
    echo "⚠️  No SHA256 digest found for this release — skipping integrity check"
fi

tar -xzf "$TMPDIR/rpxy.tar.gz" -C "$TMPDIR"
RPXY_BIN=$(find "$TMPDIR" -name 'rpxy*' -not -name '*.tar.gz' -type f | head -1)
if [ -z "$RPXY_BIN" ]; then
    echo "❌ rpxy binary not found after extraction."
    exit 1
fi
chmod +x "$RPXY_BIN"
mv "$RPXY_BIN" /usr/local/bin/rpxy

mkdir -p /etc/rpxy

# ==========================================
# STEP 3.5: ACME Configuration
# ==========================================
# Determine ACME relay choice
if [[ -z "$ACME_PROXY" ]]; then
    echo ""
    echo "🔐 Use Patiom ACME relay for SSL certificates? (Y/n)"
    echo "   Y = Free SSL for all domains via Patiom's ZeroSSL account"
    echo "   n = Direct Let's Encrypt (no patiom.run subdomains)"
    echo ""
    read -p "> " acme_choice
    if [[ "$acme_choice" =~ ^[Nn] ]]; then
        ACME_PROXY="false"
    else
        ACME_PROXY="true"
    fi
fi

if [[ "$ACME_PROXY" == "false" ]]; then
    if [[ -z "$ACME_EMAIL" ]]; then
        echo ""
        read -p "Enter your email for Let's Encrypt: " ACME_EMAIL
        if [[ -z "$ACME_EMAIL" ]]; then
            echo "❌ Email is required for Let's Encrypt."
            exit 1
        fi
    fi
    echo "⚡ Configuring rpxy for direct Let's Encrypt..."
    cat <<RCFG > /etc/rpxy/config.toml
# Managed by Patiom Node Deploy Daemon

listen_port = 80
listen_port_tls = 443

[experimental.acme]
dir_url = "https://acme-v02.api.letsencrypt.org/directory"
email = "$ACME_EMAIL"
registry_path = "/var/lib/patiom/acme_registry"
RCFG
else
    echo "⚡ Configuring rpxy with Patiom ACME relay..."
    cat <<RCFG > /etc/rpxy/config.toml
# Managed by Patiom Node Deploy Daemon

listen_port = 80
listen_port_tls = 443

[experimental.acme]
dir_url = "https://acme.patiom.dev/directory"
email = "acme@patiom.dev"
registry_path = "/var/lib/patiom/acme_registry"
RCFG
fi

# ==========================================
# STEP 4: Daemonize rpxy via systemd
# ==========================================
echo "⚙️ Creating rpxy systemd service..."
cat <<EOF > /etc/systemd/system/rpxy.service
[Unit]
Description=rpxy Reverse Proxy
After=network.target

[Service]
ExecStart=/usr/local/bin/rpxy --config /etc/rpxy/config.toml
Restart=always
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now rpxy

echo "✅ Server Provisioned Successfully for $OS!"
echo "➡️  Next steps: Deploy the Patiom Daemon to port $DAEMON_PORT."
