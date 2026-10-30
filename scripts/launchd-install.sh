#!/usr/bin/env bash
# 把需求排期台注册成 macOS 用户级 LaunchAgent：登录自启、崩溃重拉。
# 用法：
#   bash scripts/launchd-install.sh            # 安装/重装并启动
#   bash scripts/launchd-install.sh uninstall  # 卸载
set -euo pipefail

LABEL="com.local.demand-scheduler"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/demand-scheduler.log"
NODE_BIN="$(command -v node || true)"

if [ "${1:-install}" = "uninstall" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "已卸载 $LABEL"
  exit 0
fi

if [ -z "$NODE_BIN" ]; then
  echo "找不到 node，请先安装 Node.js 18 以上版本" >&2
  exit 1
fi

if [ ! -d "$PROJECT_DIR/dist" ]; then
  echo "还没有构建产物，先执行：cd $PROJECT_DIR && npm run build" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"

cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$PROJECT_DIR/server/index.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$PROJECT_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>4173</string>
    <key>HOST</key>
    <string>127.0.0.1</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG</string>
  <key>StandardErrorPath</key>
  <string>$LOG</string>
</dict>
</plist>
PLIST_EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"

sleep 1
if curl -fsS http://127.0.0.1:4173/api/health >/dev/null 2>&1; then
  echo "已启动：http://127.0.0.1:4173"
else
  echo "已注册，但健康检查没通过，看日志：$LOG" >&2
fi

echo "配置：$PLIST"
echo "日志：$LOG"
echo "卸载：bash scripts/launchd-install.sh uninstall"
