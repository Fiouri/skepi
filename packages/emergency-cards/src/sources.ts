import type { CardSource, PdfSource, SourceId, WebSource } from './schema';

/**
 * First aid card text: the latest edition of the IFRC guidelines (2025, published by the IFRC Global
 * First Aid Reference Centre in March 2026). The PDF is never committed; tools/cards-source-check
 * downloads it from `url`, checks `sha256` and extracts its text.
 */
export const IFRC_GUIDELINES: PdfSource = {
  kind: 'pdf',
  id: 'ifrc-2025',
  title: 'International First Aid, Resuscitation and Education Guidelines',
  edition: '2025',
  publisher: 'International Federation of Red Cross and Red Crescent Societies (IFRC), Geneva, 2025',
  url: 'https://www.ifrc.org/sites/default/files/2026-03/IFRC%20International%20First%20Aid,%20Resuscitation%20and%20Education%20Guidelines%202025.pdf',
  sha256: 'eed67bdff38ca8a7628c7b01be5bcd23796601e0d85bb021dc301ec3f9ff8f1f',
  licence: 'Copies of all or part of this study may be made for non-commercial use, providing the source is acknowledged.',
  accessed: '2026-10-21',
};

/** Attribution shown with the cards and in About (third-party notices). */
export const IFRC_ATTRIBUTION = `© International Federation of Red Cross and Red Crescent Societies, Geneva, 2025. ${IFRC_GUIDELINES.title} ${IFRC_GUIDELINES.edition}. ${IFRC_GUIDELINES.licence}`;

const CDC_TERMS = 'https://www.cdc.gov/other/agencymaterials.html';
const READY_TERMS = 'https://www.ready.gov/publications';

/**
 * The no-endorsement statements the reuse terms require, shown on every card from these sources and in
 * About. CDC (agencymaterials.html): attribution, a prominent disclaimer, no change to substantive
 * content, and a statement that the material is available on the agency website for no charge. FEMA
 * (Ready.gov reprint terms): content not altered, no implied FEMA or U.S. Government endorsement.
 */
export const CDC_DISCLAIMER =
  'Materials developed by CDC. Their use here, including any links to the CDC website, does not imply endorsement by CDC, HHS or the United States Government of S.K.E.P.I. The material is otherwise available on the CDC website for no charge.';
export const FEMA_DISCLAIMER =
  'Material from Ready.gov (FEMA), not altered. Its use here does not imply that the Federal Emergency Management Agency or the U.S. Government endorses S.K.E.P.I.';

/**
 * Water, earthquake, fire and flood cards (decision 2026-10-21): US federal public-domain pages, quoted
 * verbatim with their retrieval date. The hashes pin the committed snapshots
 * (tools/cards-source-check/snapshots/<id>.txt); a new snapshot means re-running the source check.
 */
export const CDC_WATER: WebSource = {
  kind: 'html',
  id: 'cdc-water',
  title: 'How to Make Water Safe in an Emergency',
  publisher: 'Centers for Disease Control and Prevention (CDC), U.S. Department of Health and Human Services',
  attribution: 'Source: CDC',
  url: 'https://www.cdc.gov/water-emergency/about/index.html',
  accessed: '2026-10-21',
  htmlSha256: '403a9acc422568c7bc9cbf0feea9cb3f9aacf30ddc325f8bfc0ecd48b6e53f38',
  textSha256: '74920f9cb0218627b91b2791ed0fbc7f1712e7ef328a553a61d95aaf08da1b6e',
  termsUrl: CDC_TERMS,
  disclaimer: CDC_DISCLAIMER,
};

const ready = (id: SourceId, title: string, path: string, htmlSha256: string, textSha256: string): WebSource => ({
  kind: 'html',
  id,
  title,
  publisher: 'Federal Emergency Management Agency (FEMA), U.S. Department of Homeland Security (Ready.gov)',
  attribution: 'Source: FEMA, Ready.gov',
  url: `https://www.ready.gov/${path}`,
  accessed: '2026-10-21',
  htmlSha256,
  textSha256,
  termsUrl: READY_TERMS,
  disclaimer: FEMA_DISCLAIMER,
});

export const READY_EARTHQUAKES = ready(
  'ready-earthquakes',
  'Earthquakes',
  'earthquakes',
  'c84feec802d36a9c426e34373682863dea0940d969c722e073f2977fb49d4d44',
  'be42ecf651b2844685322383886982f8d09d7f189e16dc04803f103620181776',
);
export const READY_HOME_FIRES = ready(
  'ready-home-fires',
  'Home Fires',
  'home-fires',
  '7ced011c281f0f6f495d3187d1895b736251ee8ad4e7e67c358f215f1b14f4ef',
  '341f594f3251611a7f9d8d49339d0878cd61b1049ce2356d83fcdc2422754808',
);
export const READY_WILDFIRES = ready(
  'ready-wildfires',
  'Wildfires',
  'wildfires',
  'eb966702dd7d2feea350a7787d42e5ada068b755fb5e267636fa3d0ec7414eb9',
  '317e1b8a71d54e368fe02cc50d1aadcf015f6ec7f149f33579c9194deeb9c4bf',
);
export const READY_FLOODS = ready(
  'ready-floods',
  'Floods',
  'floods',
  '9fc8d730e2d3d067503597f98a47ff943dcd2ec75be92cfb2c20d2a98e10132a',
  '4b65986d83ab059b25a13d76327d60f1eb8182fec2452b1fb644f208f616ef92',
);

export const SOURCES: Readonly<Record<SourceId, CardSource>> = {
  'ifrc-2025': IFRC_GUIDELINES,
  'cdc-water': CDC_WATER,
  'ready-earthquakes': READY_EARTHQUAKES,
  'ready-home-fires': READY_HOME_FIRES,
  'ready-wildfires': READY_WILDFIRES,
  'ready-floods': READY_FLOODS,
};

export const WEB_SOURCES: readonly WebSource[] = [CDC_WATER, READY_EARTHQUAKES, READY_HOME_FIRES, READY_WILDFIRES, READY_FLOODS];
