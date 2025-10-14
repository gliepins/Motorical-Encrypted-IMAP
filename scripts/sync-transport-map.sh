#!/bin/bash
# Sync Postfix transport map with vaultbox database
# Ensures adapter message mapping is always correct

set -euo pipefail

echo "🔄 Synchronizing transport map with vaultbox database..."

# Generate transport entries from database
TRANSPORT_ENTRIES=$(sudo -u encimap psql -d motorical_encrypted_imap -t -c "
SELECT v.alias||'@'||v.domain||E'\t'||'encimap-pipe:'||v.id 
FROM vaultboxes v 
ORDER BY v.created_at;
")

# Backup current transport map
sudo cp /etc/postfix/transport /etc/postfix/transport.backup.$(date +%Y%m%d_%H%M%S)

# Create new transport map with only valid vaultboxes
(
  # Keep non-vaultbox entries
  sudo grep -v "encimap-pipe:" /etc/postfix/transport || true
  # Add current vaultbox entries
  echo "$TRANSPORT_ENTRIES"
) | sudo tee /etc/postfix/transport > /dev/null

# Rebuild and reload
sudo postmap /etc/postfix/transport
sudo systemctl reload postfix

echo "✅ Transport map synchronized successfully!"
echo "📊 Current vaultbox routing:"
sudo grep "encimap-pipe:" /etc/postfix/transport | cat

