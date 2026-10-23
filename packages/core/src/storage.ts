import type { CatalogTier } from './catalog';
import { RESERVE_BYTES } from './prepare';

/**
 * Storage check before a user-initiated download of one or more packs (a country's map parts and
 * places pack together). The hard rule is ContentStore's: size + 10% + 1 GB must be free. T0/T1 phones
 * (4–6 GB RAM, usually 32–64 GB of storage) also get a warning before a large download or one that
 * leaves little room for the OS and photos; the user can still go on.
 */
export const LARGE_DOWNLOAD_BYTES = 1024 ** 3;
export const LOW_SPACE_AFTER_BYTES = 4 * 1024 ** 3;

export type StorageWarning = 'large-download' | 'low-space-after';

export interface StorageCheck {
  /** Enough free space by ContentStore's rule (size + 10% + 1 GB). */
  ok: boolean;
  requiredBytes: number;
  freeBytes: number;
  /** Free space left after the download. */
  remainingBytes: number;
  warnings: StorageWarning[];
}

/** ContentStore's rule, byte for byte (Android ContentRules.requiredFreeBytes, desktop content.rs). */
export function requiredFreeBytes(sizeBytes: number): number {
  return sizeBytes + Math.floor(sizeBytes / 10) + RESERVE_BYTES;
}

export function checkStorage(input: { sizeBytes: number; freeBytes: number; tier: CatalogTier | null }): StorageCheck {
  const requiredBytes = requiredFreeBytes(input.sizeBytes);
  const remainingBytes = Math.max(0, input.freeBytes - input.sizeBytes);
  const warnings: StorageWarning[] = [];
  const small = input.tier === 'T0' || input.tier === 'T1';
  if (small && input.sizeBytes >= LARGE_DOWNLOAD_BYTES) warnings.push('large-download');
  if (small && remainingBytes < LOW_SPACE_AFTER_BYTES) warnings.push('low-space-after');
  return { ok: input.freeBytes >= requiredBytes, requiredBytes, freeBytes: input.freeBytes, remainingBytes, warnings };
}
