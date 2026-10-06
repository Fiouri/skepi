import type { InstalledPack } from '@skepi/contracts';
import {
  buildManifest,
  classifyOffers,
  encodePairing,
  evaluateHostCatalog,
  fromBase64,
  NO_SEQUENCE,
  parseManifest,
  parsePairing,
  receiveChunks,
  toBase64,
  TRANSFER_IDLE_MS,
  TransferError,
  verifiedPrefix,
  type CatalogPack,
  type HostCatalogDecision,
  type OfferDecision,
  type PairingPayload,
  type ReceiveEvent,
  type ReceiveSummary,
  type TransferManifest,
} from '@skepi/core';
import { getSetting } from '@skepi/db';
import { hashFile } from 'expo-hash';
import { ExpoTransfer, QrScanner, type HostSession, type HostStatus, type TransferCapabilities } from 'expo-transfer';
import { contentStore, currentCatalog, useContent } from './content';
import { readAcceptedCatalog, readEmbeddedCatalog } from './contentStore';
import { appDb } from './db';

/**
 * P2P sharing (docs/architecture.md, "P2P content sharing"): the only code that drives
 * modules/expo-transfer. The host serves exactly the packs the user selected; the receiver trusts a
 * host's catalog only with a valid signature and a higher sequence, checks every chunk against the
 * signed catalog as it arrives, and installs through ContentStore (same atomic install as downloads).
 */
export { QrScanner };
export type { HostSession, HostStatus, TransferCapabilities };

export function capabilities(): TransferCapabilities {
  return ExpoTransfer.capabilities();
}

// ---- host ----

/** Debug builds only (E2E): what the host's manifest carries as its catalog. */
export type CatalogFault = 'none' | 'bad-signature' | 'embedded';

export interface ShareOptions {
  packIds: readonly string[];
  mode: 'lan' | 'hotspot';
  shareApp: boolean;
  catalogFault?: CatalogFault;
}

export interface Sharing {
  session: HostSession;
  pairing: PairingPayload;
  pairingText: string;
  qr: string;
  apkQr: string | null;
  packs: InstalledPack[];
}

async function hostCatalog(fault: CatalogFault): Promise<{ bytes: Uint8Array; signature: string } | null> {
  if (fault === 'embedded') {
    const e = await readEmbeddedCatalog();
    return e ? { bytes: fromBase64(e.catalog), signature: e.signature } : null;
  }
  const stored = await readAcceptedCatalog();
  if (!stored) return null;
  const c = { bytes: fromBase64(stored.catalog), signature: stored.signature };
  // A valid base64 signature that is not the catalog's: the receiver must reject it.
  return fault === 'bad-signature' ? { ...c, signature: toBase64(new Uint8Array(64).fill(7)) } : c;
}

export async function startSharing(opts: ShareOptions): Promise<Sharing> {
  const fault = opts.catalogFault ?? 'none';
  if (fault !== 'none' && !capabilities().faultInjection) throw new Error('catalog faults exist only in debug builds');
  const installed = useContent.getState().packs;
  const selected = installed.filter((p) => opts.packIds.includes(p.id));
  const manifest = buildManifest(selected, await hostCatalog(fault), toBase64);
  const offered = new Set(manifest.packs.map((p) => p.id));
  const files = selected.filter((p) => offered.has(p.id)).map((p) => ({ packId: p.id, path: p.path }));
  const session = await ExpoTransfer.startHost({
    files,
    manifest: JSON.stringify(manifest),
    mode: opts.mode,
    idleTimeoutMs: TRANSFER_IDLE_MS,
    shareApp: opts.shareApp,
  });
  const pairing: PairingPayload = {
    v: 1,
    ...(session.ssid && session.psk ? { ssid: session.ssid, psk: session.psk } : {}),
    host: session.host,
    port: session.port,
    token: session.token,
    certSha256: session.certSha256,
  };
  const pairingText = encodePairing(pairing);
  if (capabilities().faultInjection) await ExpoTransfer.writePairingForTests(pairingText);
  return {
    session,
    pairing,
    pairingText,
    qr: await ExpoTransfer.encodeQr(pairingText, 640),
    apkQr: session.apkUrl ? await ExpoTransfer.encodeQr(session.apkUrl, 480) : null,
    packs: selected.filter((p) => offered.has(p.id)),
  };
}

export function stopSharing(): void {
  ExpoTransfer.stopHost();
}

export function hostStatus(): HostStatus {
  return ExpoTransfer.hostStatus();
}

export function onHostStopped(listener: (reason: string) => void): () => void {
  const sub = ExpoTransfer.addListener('onHostStopped', (e) => {
    listener(e.reason);
  });
  return () => {
    sub.remove();
  };
}

/** Debug builds only: host-side faults for the E2E (a corrupted chunk, a tampering host, a dropped connection). */
export function setHostFaults(faults: Parameters<typeof ExpoTransfer.setFaults>[0]): void {
  ExpoTransfer.setFaults(faults);
}

// ---- receiver ----

export interface Connection {
  sessionId: string;
  pairing: PairingPayload;
  manifest: TransferManifest;
  catalog: HostCatalogDecision;
  /** True when the host's newer catalog was verified and adopted on this device. */
  adopted: boolean;
  offers: OfferDecision[];
}

/** Pairs with a host (QR text), fetches its manifest, propagates a newer signed catalog, classifies the packs. */
export async function connect(pairingText: string): Promise<Connection> {
  const pairing = parsePairing(pairingText);
  const sessionId = await ExpoTransfer.connect({
    host: pairing.host,
    port: pairing.port,
    token: pairing.token,
    certSha256: pairing.certSha256,
    ...(pairing.ssid && pairing.psk ? { ssid: pairing.ssid, psk: pairing.psk } : {}),
  });
  try {
    const manifest = parseManifest(await ExpoTransfer.fetchManifest(sessionId));
    const db = await appDb();
    const state = (await getSetting(db, 'catalog.accepted')) ?? NO_SEQUENCE;
    const trusted = useContent.getState().catalog?.trusted ?? [];
    const decision = evaluateHostCatalog(manifest.catalog, trusted, state);
    let adopted = false;
    if (decision.kind === 'adopt') {
      // adoptCatalog verifies again (signature, sequence) before storing it.
      const rejection = await useContent.getState().adoptCatalog({ origin: 'update', bytes: decision.bytes, signature: decision.signature });
      adopted = rejection === null;
    }
    const installed = useContent.getState().packs;
    return { sessionId, pairing, manifest, catalog: decision, adopted, offers: classifyOffers(manifest, currentCatalog(), installed) };
  } catch (e) {
    ExpoTransfer.disconnect(sessionId);
    throw e;
  }
}

export function disconnect(sessionId: string): void {
  ExpoTransfer.disconnect(sessionId);
}

export type ReceivePhase = 'resuming' | 'receiving' | 'verifying' | 'installing' | 'done';

export interface ReceiveProgress {
  packId: string;
  phase: ReceivePhase;
  chunk: number;
  chunks: number;
  bytes: number;
  totalBytes: number;
  rerequested: number;
  resumedFrom: number;
}

let jobCounter = 0;

/**
 * Receives one verified pack: resumes from the verified prefix of an earlier partial file, checks
 * every chunk against the signed catalog, re-requests bad chunks alone, then the whole-file hash and
 * the atomic install. A tampered pack is deleted; an interruption keeps the verified chunks.
 */
export async function receiveVerified(
  sessionId: string,
  entry: CatalogPack,
  onProgress: (p: ReceiveProgress) => void,
  signal: AbortSignal,
): Promise<ReceiveSummary> {
  const partial = contentStore.p2pPartial(entry.file);
  let start = 0;
  const progress: ReceiveProgress = {
    packId: entry.id,
    phase: 'resuming',
    chunk: 0,
    chunks: entry.chunkSha256.length,
    bytes: 0,
    totalBytes: entry.sizeBytes,
    rerequested: 0,
    resumedFrom: 0,
  };
  if (partial.exists && partial.sizeBytes > 0) {
    onProgress(progress);
    const onDisk = await hashFile(partial.path, { chunkSize: entry.chunkSize, signal });
    start = verifiedPrefix(entry, onDisk.chunkSha256, onDisk.sizeBytes);
  }
  await ExpoTransfer.truncatePartial(partial.path, start * entry.chunkSize);
  const jobId = `p2p-${String((jobCounter += 1))}`;
  const onAbort = (): void => {
    ExpoTransfer.cancel(jobId);
  };
  signal.addEventListener('abort', onAbort);
  try {
    const summary = await receiveChunks(entry, (_index, offset, length) => ExpoTransfer.fetchChunk(sessionId, jobId, entry.id, offset, length, partial.path), {
      startChunk: start,
      signal,
      onEvent: (e: ReceiveEvent) => {
        if (e.type === 'resumed') progress.resumedFrom = e.fromChunk;
        if (e.type === 'chunk') Object.assign(progress, { phase: 'receiving', chunk: e.index + 1, bytes: e.bytes });
        if (e.type === 'chunk-rejected') progress.rerequested += 1;
        onProgress({ ...progress });
      },
    });
    onProgress({ ...progress, phase: 'verifying' });
    await contentStore.installReceived(entry, partial.relative, (hashed) => {
      onProgress({ ...progress, phase: 'verifying', bytes: hashed });
    });
    onProgress({ ...progress, phase: 'done', bytes: entry.sizeBytes });
    return summary;
  } catch (e) {
    // A tampering host: nothing of this file is kept. An interruption keeps the verified prefix.
    if (e instanceof TransferError && e.code === 'tampered') await contentStore.deleteRelative(partial.relative);
    throw e;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

const UNVERIFIED_CHUNK = 16 * 1024 * 1024;

/** An unverified ZIM the user chose explicitly: received whole, registered unverified (labelled, consent to open). */
export async function receiveUnverified(sessionId: string, offer: OfferDecision['offer'], onProgress: (bytes: number) => void, signal: AbortSignal): Promise<InstalledPack> {
  if (offer.kind !== 'zim') throw new TransferError('not_verified', 'only ZIM files can be received unverified');
  const partial = contentStore.p2pPartial(`unverified-${offer.sha256.slice(0, 16)}.zim`);
  await ExpoTransfer.truncatePartial(partial.path, 0);
  const jobId = `p2p-${String((jobCounter += 1))}`;
  for (let offset = 0; offset < offer.sizeBytes; offset += UNVERIFIED_CHUNK) {
    if (signal.aborted) throw new TransferError('cancelled', 'cancelled');
    const length = Math.min(UNVERIFIED_CHUNK, offer.sizeBytes - offset);
    await ExpoTransfer.fetchChunk(sessionId, jobId, offer.id, offset, length, partial.path);
    onProgress(offset + length);
  }
  return contentStore.installReceivedUnverified(offer.title || offer.id, partial.relative);
}

export async function refreshContent(): Promise<void> {
  await useContent.getState().refresh();
}
