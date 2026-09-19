#!/usr/bin/env bash
# Deploys PokeStonks to Monad testnet (chain 10143) and wires the server.
#
#   1. put your key in contracts/.env   (see .env.example — gitignored, chmod 600)
#   2. ./contracts/deploy-testnet.sh
#
# The key is read from the file by this script; it is never printed or passed on a command line.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.foundry/bin:$PATH"

[ -f .env ] || { echo "✗ contracts/.env not found. Copy .env.example to .env and set PRIVATE_KEY."; exit 1; }
chmod 600 .env
set -a; . ./.env; set +a
: "${PRIVATE_KEY:?PRIVATE_KEY is empty in contracts/.env}"
RPC="${RPC_URL:-https://testnet-rpc.monad.xyz}"

[ "$(cast chain-id --rpc-url "$RPC")" = "10143" ] || { echo "✗ RPC is not Monad testnet (10143)"; exit 1; }
DEPLOYER="$(cast wallet address --private-key "$PRIVATE_KEY")"
BAL="$(cast balance "$DEPLOYER" --rpc-url "$RPC" --ether)"
echo "Deployer: $DEPLOYER"
echo "Balance : $BAL MON"
awk "BEGIN{exit !($BAL >= 5)}" || { echo "✗ Need at least ~5 MON for deployment gas. Faucet: https://faucet.monad.xyz"; exit 1; }

echo "→ tests"; forge test -q
echo "→ deploying (12 tokens + NFT + arena; sequential)"
forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --slow --gas-estimate-multiplier 115 -vv

OUT="deployments/10143.json"
[ -f "$OUT" ] || { echo "✗ $OUT missing — deployment did not complete"; exit 1; }
node script/export-abi.mjs
ARENA="$(node -e "console.log(JSON.parse(require('fs').readFileSync('$OUT','utf8')).arena)")"
echo "✓ BattleArena: $ARENA"

# Wire the game server: same key acts as voucher signer + gas relayer on testnet.
SERVER_ENV="../apps/server/.env"
SIGNER_KEY="${SERVER_SIGNER_KEY:-$PRIVATE_KEY}"
umask 077
cat > "$SERVER_ENV" <<ENVEOF
ARENA_ADDRESS=$ARENA
CLAIM_SIGNER_PRIVATE_KEY=$SIGNER_KEY
RELAYER_PRIVATE_KEY=$PRIVATE_KEY
RPC_URL=$RPC
ENVEOF
echo "✓ wrote apps/server/.env (gitignored). Rewards are now ON for the local server."
echo
echo "Explorer: https://testnet.monadvision.com/address/$ARENA"
echo "NOTE: the voucher signer must equal the key that signs on the server. If you set VOUCHER_SIGNER"
echo "      in .env, export SERVER_SIGNER_KEY=<that key> before running this script."
