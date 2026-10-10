import { parseManifest } from '@skepi/core';
import { expect, test, type Page } from '@playwright/test';

/**
 * Desktop UI flows against the mocked native commands (src/lib/mock.ts): search, sealed viewer
 * requests, Layer 1 + AI summary with verified citations, medical and emergency rules, cards with the
 * draft banner, map with POIs, Library downloads/consent, Station mode, external links as text.
 */

interface Recorded {
  calls: { command: string; args: Record<string, unknown> }[];
  viewer: { archiveId: string; path: string; anchor: string | null }[];
  station: { manifest: string; packIds: string[] } | null;
  report: string | null;
}

async function record(page: Page): Promise<Recorded> {
  return page.evaluate(() => {
    const m = (window as unknown as { __skepiMock: Recorded }).__skepiMock;
    return { calls: m.calls, viewer: m.viewer, station: m.station, report: m.report };
  });
}

test.beforeEach(async ({ page }) => {
  // Zero egress from the UI: any request outside the dev server fails the test.
  await page.route(/^(?!http:\/\/127\.0\.0\.1:1420).*/, (route) => route.abort());
  await page.goto('/');
  await expect(page.getByTestId('search-screen')).toBeVisible();
});

test('search: suggestions, full-text, cards and places; articles open in the sealed viewer', async ({ page }) => {
  await page.getByTestId('search-input').fill('canber');
  await page.getByTestId('hit-Canberra').click();
  await expect.poll(async () => (await record(page)).viewer.at(-1)?.path).toBe('Canberra');

  await page.getByTestId('search-input').fill('capital');
  await page.getByTestId('search-input').press('Enter');
  await expect(page.getByTestId('hit-Canberra')).toBeVisible();
  await expect(page.getByTestId('search-timing')).toContainText('fulltext');

  await page.getByTestId('search-input').fill('bleeding');
  await expect(page.getByTestId('card-link-bleeding')).toBeVisible();

  await page.getByTestId('search-input').fill('patras');
  await page.getByTestId('place-1').click();
  await expect(page.getByTestId('map-screen')).toBeVisible();
  await expect(page.getByTestId('map-focus')).toHaveText('Patras');
});

test('ask: Layer 1 then the AI summary with a verified citation (T3, automatic)', async ({ page }) => {
  await page.getByTestId('tab-ask').click();
  await page.getByTestId('ask-input').fill('What is the capital of Australia?');
  await page.getByTestId('ask-submit').click();
  await expect(page.getByTestId('layer1')).toBeVisible();
  await expect(page.getByTestId('layer1')).toContainText('Source excerpts — not verified advice');
  await expect(page.getByTestId('layer1-source-S1')).toContainText('Canberra');
  await expect(page.getByTestId('ai-label')).toHaveText('AI summary — check the source');
  await expect(page.getByTestId('answer-sentence-0')).toContainText('Canberra is the capital city of Australia.');
  await page.getByTestId('citation-S1').click();
  await expect.poll(async () => (await record(page)).viewer.at(-1)?.path).toBe('Canberra');
  await expect(page.getByTestId('ask-metrics')).toContainText('tier=T3');
  const calls = (await record(page)).calls.map((c) => c.command);
  expect(calls).toContain('llm_load');
  expect(calls).toContain('llm_generate');
});

test('ask: no source means no generation', async ({ page }) => {
  await page.getByTestId('tab-ask').click();
  await page.getByTestId('ask-input').fill('lattice chromodynamics gluon');
  await page.getByTestId('ask-submit').click();
  await expect(page.getByTestId('no-source')).toBeVisible();
  expect((await record(page)).calls.some((c) => c.command === 'llm_generate' && (c.args.request as { maxTokens: number }).maxTokens > 1)).toBe(false);
});

test('ask: medical intent shows the number first and the AI summary only on request', async ({ page }) => {
  await page.getByTestId('tab-ask').click();
  await page.getByTestId('ask-input').fill('How long should I boil water to kill disease?');
  await page.getByTestId('ask-submit').click();
  await expect(page.getByTestId('layer1')).toBeVisible();
  await expect(page.getByTestId('medical-notice')).toBeVisible();
  await expect(page.getByTestId('ai-summary')).toHaveCount(0);
  await page.getByTestId('ask-summarise').click();
  await expect(page.getByTestId('ai-label')).toHaveText('Unverified AI summary — check the source');
});

test('emergency: numbers and draft cards without any pack', async ({ page }) => {
  await page.getByTestId('emergency-button').click();
  await expect(page.getByTestId('emergency-numbers')).toContainText('112');
  await page.getByTestId('card-open-cpr').click();
  await expect(page.getByTestId('card-draft-banner')).toBeVisible();
});

test('map: offline PMTiles through the maps protocol, emergency POIs and filters', async ({ page }) => {
  await page.getByTestId('tab-map').click();
  await expect(page.getByTestId('map-status')).toContainText('offline PMTiles', { timeout: 30_000 });
  await expect(page.getByTestId('poi-count')).toContainText('2 emergency points');
  await page.getByTestId('poi-filter-hospital').uncheck();
  await expect(page.getByTestId('map-attribution')).toContainText('OpenStreetMap');
});

test('library: download with progress, consent for an unverified pack, catalog update', async ({ page }) => {
  await page.getByTestId('tab-library').click();
  await expect(page.getByTestId('catalog-line')).toContainText('Signed catalog 3');
  await page.getByTestId('download-wikipedia_en_medicine_mini').click();
  await expect(page.getByTestId('installed-wikipedia_en_medicine_mini')).toBeVisible();
  await page.getByTestId('consent-local-0123456789ab').click();
  await expect(page.getByTestId('consent-dialog')).toContainText('does not match any signed catalog entry');
  await page.getByTestId('consent-accept').click();
  await expect(page.getByTestId('consent-local-0123456789ab')).toHaveCount(0);
  await page.getByTestId('check-update').click();
  await expect(page.getByTestId('library-message')).toContainText('Catalog updated to 4');
});

test('station: only the selected packs in the manifest, QR pairing, stop', async ({ page }) => {
  await page.getByTestId('tab-station').click();
  await expect(page.getByTestId('firewall-note')).toContainText('private networks');
  await page.getByTestId('station-pack-test-smoke-en').check();
  await page.getByTestId('station-start').click();
  await expect(page.getByTestId('station-qr')).toBeVisible();
  await expect(page.getByTestId('station-code')).toContainText('"certSha256"');
  const station = (await record(page)).station;
  expect(station?.packIds).toEqual(['test-smoke-en']);
  const manifest = parseManifest(station?.manifest ?? '');
  expect(manifest.packs.map((p) => p.id)).toEqual(['test-smoke-en']);
  await page.getByTestId('station-stop').click();
  await expect(page.getByTestId('station-start')).toBeVisible();
});

test('viewer external links are shown as text, never opened', async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as { __skepiMock: { emit: (e: string, p: string) => void } }).__skepiMock.emit('viewer-external', 'https://example.invalid/');
  });
  await expect(page.getByTestId('external-links')).toContainText('External link (not opened): https://example.invalid/');
});

test('settings: blackout theme and AI power cap off (library only)', async ({ page }) => {
  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('device-line')).toContainText('tier T3');
  await page.getByTestId('blackout-toggle').check();
  await expect(page.locator('.app')).toHaveAttribute('data-theme', 'blackout');
  await page.getByTestId('power-cap-off').check();
  await page.getByTestId('tab-ask').click();
  await expect(page.getByText('No GGUF model found: source search only.')).toBeVisible();
});

test('report a problem: question, shown answer, sources and version only; copy and save, nothing sent', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByTestId('tab-ask').click();
  await page.getByTestId('ask-input').fill('What is the capital of Australia?');
  await page.getByTestId('ask-submit').click();
  await expect(page.getByTestId('answer-sentence-0')).toBeVisible();
  await page.getByTestId('ask-report').click();
  const text = await page.getByTestId('report-text').inputValue();
  expect(text).toContain('What is the capital of Australia?');
  expect(text).toContain('Canberra is the capital city of Australia. [S1]');
  expect(text).toMatch(/App version: SKEPI \d+\.\d+\.\d+(-preview)? \(Windows\)/);
  expect(text).toContain('Cited sources:');
  expect(text).not.toMatch(/archive|\d{4}-\d{2}-\d{2}|tier=|gpu/i);
  await page.getByTestId('report-copy').click();
  await expect(page.getByTestId('report-status')).toHaveText('Copied');
  // The Windows clipboard returns CRLF line breaks.
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(text);
  await page.getByTestId('report-save').click();
  await expect(page.getByTestId('report-status')).toContainText('Saved: ');
  expect((await record(page)).report).toBe(text);
  const commands = (await record(page)).calls.map((c) => c.command);
  expect(commands.filter((c) => c.startsWith('content_download') || c.startsWith('content_check_update'))).toEqual([]);
});

test('about: licence, content licences, signing, privacy and the generated third-party notices', async ({ page }) => {
  await page.getByTestId('tab-about').click();
  await expect(page.getByTestId('about-licence')).toContainText('GPL-3.0-or-later');
  await expect(page.getByTestId('about-content')).toContainText('CC BY-SA 4.0');
  await expect(page.getByTestId('about-content')).toContainText('ODbL');
  await expect(page.getByTestId('about-content')).toContainText('Apache License 2.0');
  await expect(page.getByTestId('about-signing')).toContainText('7d61c38241b178f84b12dd9a67af6b60b56159b1a0ff067fe672db45dd45447e');
  await expect(page.getByTestId('about-privacy')).toContainText('no accounts, analytics, ads or telemetry');
  await expect(page.getByTestId('about-notices')).toContainText(/\d+ components: \d+ JavaScript, \d+ Rust/);
  await page.getByTestId('about-notices-toggle').click();
  await page.getByTestId('about-notices-filter').fill('tauri');
  await expect(page.getByTestId('about-notices-list').locator('li').first()).toContainText('tauri');
});

test('emergency question: the country number is shown before any Layer 1 excerpt', async ({ page }) => {
  await page.getByTestId('tab-ask').click();
  await page.getByTestId('ask-input').fill('Earthquake shaking: what is an earthquake?');
  await page.getByTestId('ask-submit').click();
  // At the moment Layer 1 first appears, the number banner is already there and above it.
  const order = await page.waitForFunction(() => {
    const layer1 = document.querySelector('[data-testid="layer1"]');
    if (!layer1) return null;
    const banner = document.querySelector('[data-testid="emergency-banner"]');
    return { banner: banner?.textContent ?? null, before: banner ? Boolean(banner.compareDocumentPosition(layer1) & Node.DOCUMENT_POSITION_FOLLOWING) : false };
  });
  const v = (await order.jsonValue()) as { banner: string | null; before: boolean };
  expect(v.banner).toContain('Call 112');
  expect(v.before).toBe(true);
});
