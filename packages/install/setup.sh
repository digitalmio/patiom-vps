#!/bin/bash
set -e

if [ "$(id -u)" -ne 0 ]; then
    echo "❌ This script must be run as root. Try: sudo $0"
    exit 1
fi

echo "🚀 Patiom Server Bootstrap"
echo ""

if [ -z "$EMAIL" ]; then
    read -p "📧 Email for Let's Encrypt certificates: " EMAIL < /dev/tty
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
# STEP 3: fnm, Node, npm
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

echo "🟩 Creating symlinks in /usr/local/bin..."
NODE_BIN_DIR=$(dirname "$(readlink -f "$(which node)")")
ln -sf "$NODE_BIN_DIR/node" /usr/local/bin/node
ln -sf "$NODE_BIN_DIR/npm" /usr/local/bin/npm
ln -sf "$NODE_BIN_DIR/npx" /usr/local/bin/npx

echo "🟩 Setting up fnm in /etc/profile.d/fnm.sh..."
cat > /etc/profile.d/fnm.sh << 'EOF'
export FNM_DIR="/opt/fnm"
export PATH="$FNM_DIR:$PATH"
eval "$(fnm env)" 2>/dev/null
EOF

# npm ships with Node, no separate installation needed

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

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "📥 Downloading rpxy latest..."
curl -sfL --retry 3 --retry-delay 2 -o "$TMPDIR/rpxy.tar.gz" \
  "https://github.com/junkurihara/rust-rpxy/releases/latest/download/rpxy-${RPXY_PATTERN}.tar.gz"

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
npm uninstall -g @patiom/daemon 2>/dev/null || true
npm install -g @patiom/daemon@latest
ln -sf "$(npm root -g)/../bin/patiom-server" /usr/local/bin/patiom-server

# ==========================================
# STEP 6: Hand off to Node setup
# ==========================================
echo ""
echo "🚀 Launching setup..."
echo ""

exec patiom-server setup --email "$EMAIL"
