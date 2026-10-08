import { PMTiles, Protocol, type Source } from 'pmtiles';

/**
 * PMTiles bytes come from the app's own `maps` protocol (src-tauri/src/protocols.rs): HTTP Range reads
 * of a verified map pack on disk, named by pack id. No tile server, no network: WebView2 serves the
 * scheme as http://maps.localhost, which the main window's CSP allows for connections.
 */
export const MAPS_ORIGIN = import.meta.env.MODE === 'e2e' ? '/e2e-maps' : 'http://maps.localhost';

class PackSource implements Source {
  constructor(private readonly packId: string) {}

  getKey(): string {
    return `skepi-map-${this.packId}`;
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<{ data: ArrayBuffer }> {
    // eslint-disable-next-line no-restricted-globals -- local custom protocol only (verified pack bytes from disk)
    const res = await fetch(`${MAPS_ORIGIN}/${encodeURIComponent(this.packId)}`, {
      headers: { Range: `bytes=${String(offset)}-${String(offset + length - 1)}` },
      ...(signal ? { signal } : {}),
    });
    if (res.status !== 206 && res.status !== 200) throw new Error(`map pack read failed (${String(res.status)})`);
    return { data: await res.arrayBuffer() };
  }
}

let protocol: Protocol | null = null;

/** Registers the pmtiles protocol once and returns the style URL of a map pack. */
export function pmtilesUrl(packId: string, addProtocol: (name: string, handler: Protocol['tile']) => void): string {
  if (!protocol) {
    protocol = new Protocol();
    addProtocol('pmtiles', protocol.tile);
  }
  const archive = new PMTiles(new PackSource(packId));
  protocol.add(archive);
  return `pmtiles://${archive.source.getKey()}`;
}
