'use client';

import { useSyncExternalStore } from 'react';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Address } from './format';

/**
 * Guest wallet: a throwaway testnet account generated in this browser. The private key lives only in
 * this tab's localStorage (or memory when storage is blocked). It is never rendered, logged or sent
 * anywhere: the game only ever receives the public address, and the battle server relays all claims.
 */

const KEY_SLOT = 'pokestonks.guest.key';
const ACTIVE_SLOT = 'pokestonks.guest.active';
const KEY_RE = /^0x[0-9a-fA-F]{64}$/;

let memoryKey: `0x${string}` | null = null;
let memoryActive = false;
let derived: { key: string; address: Address } | null = null;
const listeners = new Set<() => void>();

function readSlot(slot: string): string | null {
  try {
    return window.localStorage.getItem(slot);
  } catch {
    return null;
  }
}

function writeSlot(slot: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(slot);
    else window.localStorage.setItem(slot, value);
  } catch {
    /* storage blocked: memory fallback below keeps the session working */
  }
}

function currentKey(): `0x${string}` | null {
  const stored = readSlot(KEY_SLOT);
  if (stored && KEY_RE.test(stored)) return stored as `0x${string}`;
  return memoryKey;
}

function isActive(): boolean {
  const stored = readSlot(ACTIVE_SLOT);
  return stored === null ? memoryActive : stored === '1';
}

function addressOf(key: `0x${string}`): Address {
  if (derived?.key !== key) derived = { key, address: privateKeyToAccount(key).address };
  return derived.address;
}

/** '' when no guest session is active, otherwise the guest's public address. Primitive for useSyncExternalStore. */
function snapshot(): string {
  if (typeof window === 'undefined') return '';
  const key = currentKey();
  if (!key || !isActive()) return '';
  try {
    return addressOf(key);
  } catch {
    return '';
  }
}

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY_SLOT || e.key === ACTIVE_SLOT || e.key === null) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

/** Reactive guest address ('' = no active guest session). Server snapshot is '' so hydration matches. */
export function useGuestAddress(): Address | null {
  const a = useSyncExternalStore(subscribe, snapshot, () => '');
  return a ? (a as Address) : null;
}

const noopSubscribe = () => () => {};

/** False during SSR and hydration, true afterwards, so client-only state never flashes a wrong first frame. */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** Start (or resume) the guest session on this device. Creates the wallet the first time. */
export function activateGuest(): Address | null {
  let key = currentKey();
  if (!key) {
    key = generatePrivateKey();
    memoryKey = key;
    writeSlot(KEY_SLOT, key);
  }
  memoryActive = true;
  writeSlot(ACTIVE_SLOT, '1');
  notify();
  return addressOf(key);
}

/** End the guest session. The wallet stays on this device so "Play as guest" resumes the same one. */
export function deactivateGuest() {
  memoryActive = false;
  writeSlot(ACTIVE_SLOT, '0');
  notify();
}
