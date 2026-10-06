import { NativeModule, requireNativeModule, requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

export interface TransferCapabilities {
  apiLevel: number;
  /** LocalOnlyHotspot (Android 8+). */
  hotspot: boolean;
  /** Joining a hotspot from the app (WifiNetworkSpecifier, Android 10+). */
  joinHotspot: boolean;
  /** Debug builds only: host-side faults for the E2E. */
  faultInjection: boolean;
}

export interface HostOptions {
  files: { packId: string; path: string }[];
  manifest: string;
  mode: 'lan' | 'hotspot';
  idleTimeoutMs: number;
  shareApp: boolean;
}

export interface HostSession {
  host: string;
  port: number;
  token: string;
  certSha256: string;
  ssid: string | null;
  psk: string | null;
  apkUrl: string | null;
  apkCertSha256: string | null;
}

export interface HostLogEntry {
  method: string;
  path: string;
  status: number;
  atMs: number;
}

export interface HostStatus {
  running: boolean;
  requests?: number;
  bytesServed?: number;
  lastActivityAtMs?: number;
  stopReason?: string | null;
  log?: HostLogEntry[];
}

export interface PairingInput {
  host: string;
  port: number;
  token: string;
  certSha256: string;
  ssid?: string;
  psk?: string;
}

export interface FaultsInput {
  corruptOncePack?: string;
  corruptOnceOffset?: number;
  corruptAlwaysPack?: string;
  dropOncePack?: string;
  dropOnceOffset?: number;
}

type TransferEvents = { onHostStopped: (e: { reason: string }) => void };

declare class ExpoTransferNativeModule extends NativeModule<TransferEvents> {
  capabilities(): TransferCapabilities;
  startHost(options: HostOptions): Promise<HostSession>;
  stopHost(): void;
  hostStatus(): HostStatus;
  setFaults(faults: FaultsInput): void;
  writePairingForTests(text: string): Promise<void>;
  readPairingForTests(): Promise<string | null>;
  connect(pairing: PairingInput): Promise<string>;
  fetchManifest(sessionId: string): Promise<string>;
  fetchChunk(sessionId: string, jobId: string, packId: string, offset: number, length: number, partialPath: string): Promise<{ sha256: string; bytes: number }>;
  truncatePartial(partialPath: string, size: number): Promise<number>;
  cancel(jobId: string): void;
  disconnect(sessionId: string): void;
  encodeQr(text: string, size: number): Promise<string>;
  isLocalAddress(host: string): boolean;
}

export default requireNativeModule<ExpoTransferNativeModule>('ExpoTransfer');

export interface QrScannerProps extends ViewProps {
  onScanned: (e: { nativeEvent: { data: string } }) => void;
  onError?: (e: { nativeEvent: { message: string } }) => void;
}

/** Camera preview that reads one QR code (needs the CAMERA permission). */
export const QrScanner: ComponentType<QrScannerProps> = requireNativeView<QrScannerProps>('ExpoTransfer');
