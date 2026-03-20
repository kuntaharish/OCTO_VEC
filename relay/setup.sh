#!/bin/bash
# ── OCTO VEC Relay Server Setup (Oracle Cloud Free Tier) ──────────────────
# Run this on your VPS after SSH-ing in

# 1. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Create relay directory
sudo mkdir -p /opt/octo-relay
sudo chown $USER:$USER /opt/octo-relay

# 3. Copy files (run from your local machine):
#    scp relay/package.json relay/server.js user@your-vps:/opt/octo-relay/

# 4. Install dependencies
cd /opt/octo-relay
npm install

# 5. Generate a strong secret
echo "Your relay secret: $(openssl rand -hex 32)"

# 6. Create systemd service
sudo tee /etc/systemd/system/octo-relay.service > /dev/null << 'EOF'
[Unit]
Description=OCTO VEC Relay Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/octo-relay
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=PORT=8080
Environment=RELAY_SECRET=PASTE_YOUR_SECRET_HERE

[Install]
WantedBy=multi-user.target
EOF

# 7. Start
sudo systemctl daemon-reload
sudo systemctl enable octo-relay
sudo systemctl start octo-relay

echo "Done! Open port 8080 in Oracle Cloud security list."
echo ""
echo "On your PC .env file, add:"
echo "  VEC_RELAY_URL=http://YOUR_VPS_IP:8080"
echo "  VEC_RELAY_SECRET=YOUR_SECRET"
echo ""
echo "On mobile app, choose 'Remote Access' and enter:"
echo "  Relay URL: http://YOUR_VPS_IP:8080"
echo "  Relay Secret: YOUR_SECRET"
