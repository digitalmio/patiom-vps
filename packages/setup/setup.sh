#!/bin/bash
set -e

if [ "$(id -u)" -ne 0 ]; then
    echo "❌ This script must be run as root. Try: sudo $0"
    exit 1
fi

echo "🚀 Patiom Server Bootstrap"
echo ""

if [ -z "$EMAIL" ]; then
    echo "❌ Email is required for Let's Encrypt certificates."
    echo "   Usage: curl -sSL https://... | sudo EMAIL=you@example.com bash"
    exit 1
fi

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
    dnf install -y curl wget unzip jq
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
DAEMON_VERSION=$(curl -s https://registry.npmjs.org/@patiom/daemon/latest | jq -r .version)
echo "   Latest version: $DAEMON_VERSION"
pnpm config set global-bin-dir /usr/local/bin
pnpm remove -g @patiom/daemon 2>/dev/null || true
pnpm install -g "https://registry.npmjs.org/@patiom/daemon/-/daemon-${DAEMON_VERSION}.tgz"

# ==========================================
# STEP 6: Hand off to Node setup
# ==========================================
echo ""
echo "🚀 Launching setup..."
echo ""

exec patiom-server setup --email "$EMAIL"
