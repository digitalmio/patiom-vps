#!/bin/bash
set -e

if [ "$(id -u)" -ne 0 ]; then
    echo "❌ This script must be run as root. Try: sudo $0"
    exit 1
fi

echo "🚀 Patiom Server Bootstrap"
echo ""

# ==========================================
# STEP 1: OS Detection
# ==========================================
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "❌ Cannot detect OS."
    exit 1
fi

echo "🐧 Detected OS: $OS"

# ==========================================
# STEP 2: Package Installation
# ==========================================
if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    echo "📦 Installing apt dependencies..."
    apt-get update -y
    apt-get install -y curl wget unzip jq
elif [[ "$OS" == "almalinux" || "$OS" == "rocky" || "$OS" == "centos" || "$OS" == "fedora" || "$OS" == "rhel" ]]; then
    echo "📦 Installing dnf dependencies..."
    dnf install -y curl wget unzip jq firewalld
else
    echo "❌ Unsupported OS: $OS"
    exit 1
fi

# ==========================================
# STEP 3: fnm, Node, pnpm
# ==========================================
export FNM_DIR="/opt/fnm"
if ! command -v fnm &>/dev/null; then
    echo "🟩 Installing fnm to /opt/fnm..."
    curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir "$FNM_DIR" --skip-shell
fi
export PATH="$FNM_DIR:$PATH"
eval "$(fnm env)"

fnm install 24
fnm default 24

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
echo "📦 Enabling pnpm via Corepack..."
corepack enable pnpm

# ==========================================
# STEP 4: rpxy Binary
# ==========================================
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

echo "🔍 Fetching rpxy latest release..."
RELEASE_JSON=$(curl -sf https://api.github.com/repos/junkurihara/rust-rpxy/releases/latest)

RPXY_TAG=$(printf '%s' "$RELEASE_JSON" | jq -r .tag_name)
if [ -z "$RPXY_TAG" ] || [ "$RPXY_TAG" = "null" ]; then
    echo "❌ Failed to fetch rpxy release info."
    exit 1
fi

RPXY_URL=$(printf '%s' "$RELEASE_JSON" | jq -r --arg pat "$RPXY_PATTERN" '.assets[] | select(.name == "rpxy-\($pat).tar.gz") | .browser_download_url')
RPXY_SHA=$(printf '%s' "$RELEASE_JSON" | jq -r --arg pat "$RPXY_PATTERN" '.assets[] | select(.name == "rpxy-\($pat).tar.gz") | .digest' | sed 's/^sha256://')

if [ -z "$RPXY_URL" ] || [ "$RPXY_URL" = "null" ]; then
    echo "❌ No matching rpxy asset found."
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
        echo "❌ rpxy SHA256 mismatch!"
        exit 1
    fi
    echo "✅ rpxy integrity verified"
fi

tar -xzf "$TMPDIR/rpxy.tar.gz" -C "$TMPDIR"
RPXY_BIN=$(find "$TMPDIR" -name 'rpxy*' -not -name '*.tar.gz' -type f | head -1)
if [ -z "$RPXY_BIN" ]; then
    echo "❌ rpxy binary not found."
    exit 1
fi
chmod +x "$RPXY_BIN"
mv "$RPXY_BIN" /usr/local/bin/rpxy

mkdir -p /etc/rpxy

# ==========================================
# STEP 5: Install Patiom Daemon
# ==========================================
echo "📦 Installing Patiom daemon..."

DAEMON_DIR="/opt/patiom/daemon"
mkdir -p "$DAEMON_DIR"

# Download daemon from npm (or copy from local if deploying from monorepo)
# For production: npm pack @patiom/daemon and extract
# For development: copy from monorepo

if [ -f "./daemon.tgz" ]; then
    echo "📦 Installing from local daemon.tgz..."
    tar -xzf daemon.tgz -C "$DAEMON_DIR" --strip-components=1
    cd "$DAEMON_DIR"
    pnpm install --prod
else
    echo "📦 Downloading daemon from npm..."
    cd "$DAEMON_DIR"
    echo '{"name":"patiom-daemon-install","private":true}' > package.json
    pnpm pack @patiom/daemon
    tar -xzf patiom-daemon-*.tgz --strip-components=1
    rm patiom-daemon-*.tgz
    pnpm install --prod
fi

# Make setup script executable
chmod +x "$DAEMON_DIR/dist/setup.js"

# ==========================================
# STEP 6: Hand off to Node setup
# ==========================================
echo ""
echo "🚀 Launching interactive setup..."
echo ""

exec node "$DAEMON_DIR/dist/setup.js"
