export const config = {
  port: parseInt(process.env.PORT ?? '2567', 10),
  rpcUrl: process.env.RPC_URL ?? 'https://testnet-rpc.monad.xyz',
  hermesUrl: process.env.HERMES_URL ?? 'https://hermes.pyth.network',
  claimSignerKey: process.env.CLAIM_SIGNER_PRIVATE_KEY ?? '',
};
