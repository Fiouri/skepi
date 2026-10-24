/**
 * One map style over every installed country (global maps, decision 2026-10-23): the bundled
 * Protomaps style has one vector source (`protomaps`); each installed map pack becomes a source of its
 * own and every layer that reads the source is repeated once per pack, in the style's order (all
 * countries' water under all countries' roads under all labels). Where packs overlap (the border
 * strip of each region), the same feature is drawn twice in the same place; label collision keeps one.
 * With one pack the style is the bundled one with only the tiles URL set.
 *
 * Structural types only: core does not depend on MapLibre.
 */
export interface StyleSourceLike {
  type: string;
  url?: string;
  attribution?: string;
  [key: string]: unknown;
}

export interface StyleLayerLike {
  id: string;
  type: string;
  source?: string;
  [key: string]: unknown;
}

export interface StyleLike {
  sources: Record<string, StyleSourceLike>;
  layers: StyleLayerLike[];
  [key: string]: unknown;
}

export interface MapSource {
  /** Pack id: names the source and the layer copies (stable across renders). */
  id: string;
  /** Tiles URL, e.g. `pmtiles://file:///…/map-gr-20261022.pmtiles`. */
  url: string;
}

export const BASE_SOURCE = 'protomaps';

/** Source key of the n-th pack (the first keeps the bundled key, so one pack gives the bundled style). */
export function sourceKey(index: number, packId: string): string {
  return index === 0 ? BASE_SOURCE : `${BASE_SOURCE}:${packId}`;
}

function layerId(id: string, index: number, packId: string): string {
  return index === 0 ? id : `${id}:${packId}`;
}

/**
 * The style for the given map packs (verified packs only, in a stable order). Null without a pack.
 * Throws when the base style has no `protomaps` vector source.
 */
export function multiSourceStyle<S extends StyleLike>(base: S, packs: readonly MapSource[]): S | null {
  if (packs.length === 0) return null;
  const source = base.sources[BASE_SOURCE];
  if (source?.type !== 'vector') throw new Error(`style: ${BASE_SOURCE} vector source missing`);
  const style = JSON.parse(JSON.stringify(base)) as S;
  const sources: Record<string, StyleSourceLike> = {};
  for (const [key, value] of Object.entries(style.sources)) if (key !== BASE_SOURCE) sources[key] = value;
  packs.forEach((p, i) => {
    const copy: StyleSourceLike = { ...source, url: p.url };
    // One attribution line is enough (every pack is the same OpenStreetMap / Protomaps data).
    if (i > 0) delete copy.attribution;
    sources[sourceKey(i, p.id)] = copy;
  });
  style.sources = sources;
  style.layers = style.layers.flatMap((layer) =>
    layer.source === BASE_SOURCE ? packs.map((p, i) => ({ ...layer, id: layerId(layer.id, i, p.id), source: sourceKey(i, p.id) })) : [layer],
  );
  return style;
}
