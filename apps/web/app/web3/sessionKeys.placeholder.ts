/**
 * Session key placeholder — scoped to BattleArena methods.
 * Time limit + spend cap. Privy session signers.
 *
 * Skipped per V4 §5.2 stretch goal. Implement when:
 * - BattleRoom sends 'authorizeSessionKey' after login
 * - Key scoped to BattleArena.claim/settleAndClaim + BattleArena.stake
 * - 30 min TTL + 5 MON spend cap
 * - On expiry, re-authorize (still no popup if within Privy session)
 */
export {};
