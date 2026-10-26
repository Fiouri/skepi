/**
 * Emergency numbers per country, bundled and never fetched (docs/architecture.md, "Emergency
 * numbers"). The country is chosen at onboarding, not taken from the network. Every entry names the
 * official national (or EU) sources it was checked against, with the retrieval date; tools/
 * cards-source-check proves every number from a verbatim quote of a committed snapshot of those
 * sources, like the card steps (UNCHECKED_NUMBER_COUNTRIES excepted). A country that is not listed
 * gets the default, 112, with a note that the local number should be checked; the app never promises
 * that a call works without a SIM card or network.
 */

export type ServiceKind = 'ambulance' | 'fire' | 'police' | 'coastGuard' | 'poison';

export interface NumberSource {
  title: string;
  url: string;
  /** Retrieval date (YYYY-MM-DD). */
  accessed: string;
  /** How tools/cards-source-check proves the numbers from this source (no network in the check). */
  check?: NumberCheck;
}

/**
 * A checked source, like the card sources: the committed text snapshot
 * (tools/cards-source-check/snapshots/numbers/<id>.txt) of the official page or PDF, pinned by the
 * SHA-256 of the fetched file and of the snapshot text, and the verbatim quotes that state the numbers.
 */
export interface NumberCheck {
  id: string;
  format: 'html' | 'pdf';
  fileSha256: string;
  textSha256: string;
  /** Verbatim passages of the source (whitespace normalised) and the numbers each one states. */
  quotes: readonly { text: string; numbers: readonly string[] }[];
}

export interface CountryNumbers {
  /** ISO 3166-1 alpha-2. */
  country: string;
  name: { en: string; el: string };
  general: string;
  services: Partial<Record<ServiceKind, string>>;
  sources: readonly NumberSource[];
}

const ACCESSED = '2026-10-05';
/** Snapshots of tools/cards-source-check/snapshots/numbers/ (2026-10-23 UTC). */
const CHECKED = '2026-10-23';

const ec112 = (quote: string): NumberSource => ({
  title: 'European Commission: 112, the European emergency number',
  url: 'https://digital-strategy.ec.europa.eu/en/policies/112',
  accessed: CHECKED,
  check: {
    id: 'ec-112',
    format: 'html',
    fileSha256: '67bc971567723c8a91bee574df3676e76d09a723923464b55a9183227b85d408',
    textSha256: '049ca2436cf1d0b80dc82544504f0a1cd7c03f8e4582ceb8db33a5af371dce0d',
    quotes: [{ text: quote, numbers: ['112'] }],
  },
});
/** The EU member states: 112 everywhere in the EU. */
const EC_112 = ec112('112 is the European emergency phone number, available everywhere in the EU, free of charge.');

const EU: readonly [string, string, string][] = [
  ['AT', 'Austria', 'Αυστρία'],
  ['BE', 'Belgium', 'Βέλγιο'],
  ['BG', 'Bulgaria', 'Βουλγαρία'],
  ['HR', 'Croatia', 'Κροατία'],
  ['CY', 'Cyprus', 'Κύπρος'],
  ['CZ', 'Czechia', 'Τσεχία'],
  ['DK', 'Denmark', 'Δανία'],
  ['EE', 'Estonia', 'Εσθονία'],
  ['FI', 'Finland', 'Φινλανδία'],
  ['FR', 'France', 'Γαλλία'],
  ['DE', 'Germany', 'Γερμανία'],
  ['HU', 'Hungary', 'Ουγγαρία'],
  ['IE', 'Ireland', 'Ιρλανδία'],
  ['IT', 'Italy', 'Ιταλία'],
  ['LV', 'Latvia', 'Λετονία'],
  ['LT', 'Lithuania', 'Λιθουανία'],
  ['LU', 'Luxembourg', 'Λουξεμβούργο'],
  ['MT', 'Malta', 'Μάλτα'],
  ['NL', 'Netherlands', 'Ολλανδία'],
  ['PL', 'Poland', 'Πολωνία'],
  ['PT', 'Portugal', 'Πορτογαλία'],
  ['RO', 'Romania', 'Ρουμανία'],
  ['SK', 'Slovakia', 'Σλοβακία'],
  ['SI', 'Slovenia', 'Σλοβενία'],
  ['ES', 'Spain', 'Ισπανία'],
  ['SE', 'Sweden', 'Σουηδία'],
];

export const COUNTRY_NUMBERS: readonly CountryNumbers[] = [
  {
    country: 'GR',
    name: { en: 'Greece', el: 'Ελλάδα' },
    general: '112',
    services: { ambulance: '166', fire: '199', police: '100', coastGuard: '108', poison: '2107793777' },
    sources: [
      EC_112,
      {
        title: 'Region of Attica, Civil Protection: emergency telephone numbers (Τηλεφωνικοί Αριθμοί Έκτακτης Ανάγκης)',
        url: 'https://www.patt.gov.gr/koinonia/politiki_prostasia/odigies_prostasias/tilefonikoi-arithmoi-ektaktis-anagkis/',
        accessed: CHECKED,
        check: {
          id: 'attica-civil-protection',
          format: 'html',
          fileSha256: '91020c2ebe464fa8eef61ea648a4a17daa0b746e033e34f46b78203ccf67e935',
          textSha256: 'cd4f08af092814ee343eddee6980d01d05e357f348c4735fde725328ea4a0732',
          quotes: [
            { text: '100: Ελληνική Αστυνομία', numbers: ['100'] },
            { text: '166: Εθνικό Κέντρο Άμεσης Βοήθειας (ΕΚΑΒ) – για επείγοντα θέματα ιατρικής βοήθειας', numbers: ['166'] },
            { text: '199: Πυροσβεστική Υπηρεσία', numbers: ['199'] },
            { text: '108 : Άμεση Δράση Λιμενικού Σώματος-Ελληνικής Ακτοφυλακής', numbers: ['108'] },
            { text: '210 7793 777: Κέντρο Δηλητηριάσεων', numbers: ['2107793777'] },
            { text: 'Παράλληλα με τα ανωτέρω υπάρχει και ο Ευρωπαϊκός Αριθμός Έκτακτης Ανάγκης 112.', numbers: ['112'] },
          ],
        },
      },
    ],
  },
  ...EU.map(([country, en, el]) => ({ country, name: { en, el }, general: '112', services: {}, sources: [EC_112] })),
  {
    country: 'CH',
    name: { en: 'Switzerland', el: 'Ελβετία' },
    general: '112',
    services: {},
    sources: [ec112('112 is also used in some countries outside the EU - such as Switzerland and South Africa - and is available worldwide on GSM mobile networks.')],
  },
  {
    country: 'GB',
    name: { en: 'United Kingdom', el: 'Ηνωμένο Βασίλειο' },
    general: '999',
    services: {},
    sources: [
      {
        title: "GOV.UK: 999 and 112, the UK's national emergency numbers (112 also works)",
        url: 'https://www.gov.uk/guidance/999-and-112-the-uks-national-emergency-numbers',
        accessed: CHECKED,
        check: {
          id: 'gov-uk-999',
          format: 'html',
          fileSha256: '49442ccbcb4ccffd92aebd2625575cd0bd9df77ecec46ae4662b13d7ecaa2ff4',
          textSha256: '6832eca209cbe47c22c2d5b45cb87ef00aca2fa80b04de25bad519439281b13b',
          quotes: [
            {
              text: '999 and 112 is the national emergency response service in the UK. 112 is the pan-European equivalent to 999 and can be used in the UK.',
              numbers: ['999', '112'],
            },
          ],
        },
      },
    ],
  },
  {
    country: 'US',
    name: { en: 'United States', el: 'Ηνωμένες Πολιτείες' },
    general: '911',
    services: { poison: '18002221222' },
    sources: [
      { title: 'FCC: 911 and E911 Services', url: 'https://www.fcc.gov/general/9-1-1-and-e9-1-1-services', accessed: ACCESSED },
      // fcc.gov refuses automated requests; the 911 check quotes FEMA's Ready.gov (also a card source).
      {
        title: 'Ready.gov (FEMA): Home Fires ("Call 9-1-1 or your fire department")',
        url: 'https://www.ready.gov/home-fires',
        accessed: CHECKED,
        check: {
          id: 'ready-home-fires',
          format: 'html',
          fileSha256: '1da7f6782dc28f65ae6951a26750e6a12b600d9eee5bd06fbb62976d6b96624b',
          textSha256: '341f594f3251611a7f9d8d49339d0878cd61b1049ce2356d83fcdc2422754808',
          quotes: [{ text: 'Call 9-1-1 or your fire department.', numbers: ['911'] }],
        },
      },
      {
        title: 'U.S. EPA: First Aid in Case of Pesticide Exposure (Poison Control (800) 222-1222)',
        url: 'https://19january2017snapshot.epa.gov/pesticide-incidents/first-aid-case-pesticide-exposure_.html',
        accessed: CHECKED,
        check: {
          id: 'epa-pesticide-first-aid',
          format: 'html',
          fileSha256: '479996136bad31bfcc2d004af754f92597fe075c60772a316d2ff87f1dc99fe2',
          textSha256: '08e9cd7ff446663cee473d8af188da7b3323a3008bca462f59109de995a9d2c1',
          quotes: [{ text: 'Call the Poison Control Center at (800) 222-1222 for help with first aid information.', numbers: ['18002221222'] }],
        },
      },
    ],
  },
  {
    country: 'CA',
    name: { en: 'Canada', el: 'Καναδάς' },
    general: '911',
    services: {},
    sources: [{ title: 'CRTC: 9-1-1 services', url: 'https://crtc.gc.ca/eng/phone/911/', accessed: ACCESSED }],
  },
  {
    country: 'AU',
    name: { en: 'Australia', el: 'Αυστραλία' },
    general: '000',
    services: {},
    sources: [{ title: 'Australian Government: Triple Zero (000)', url: 'https://www.triplezero.gov.au/', accessed: ACCESSED }],
  },
  {
    country: 'NZ',
    name: { en: 'New Zealand', el: 'Νέα Ζηλανδία' },
    general: '111',
    services: {},
    sources: [
      {
        title: 'New Zealand Government: 111 emergency service',
        url: 'https://www.govt.nz/browse/law-crime-and-justice/crimes-and-emergencies/111-emergency-service/',
        accessed: CHECKED,
        check: {
          id: 'govt-nz-111',
          format: 'html',
          fileSha256: 'a8fa9c034a6c2b4e21727efc4b158a7ef91541885a5048e7771b5a19f918e8da',
          textSha256: 'b9287c1e7d65762f29e3c94787de987aca8ea079444e1e1e41d77e66d9a9db1c',
          quotes: [
            {
              text: 'If you need help from the police, the fire service, or you need an ambulance, dial 111 and the emergency operator will connect you to the right place.',
              numbers: ['111'],
            },
          ],
        },
      },
    ],
  },
  {
    // No single number: police 110, fire and ambulance 119, coast guard 118. The card's main number is
    // 119 (ambulance and fire); police is listed beside it.
    country: 'JP',
    name: { en: 'Japan', el: 'Ιαπωνία' },
    general: '119',
    services: { ambulance: '119', fire: '119', police: '110', coastGuard: '118' },
    sources: [
      {
        title: 'National Police Agency (NPA): Responding to the Surge of Foreign Visitors to Japan (provisional translation; "110 Emergency Calls")',
        url: 'https://www.npa.go.jp/english/soumu/Responding_to_the_Surge_of_Foreign_Visitors_to_Japan.pdf',
        accessed: CHECKED,
        check: {
          id: 'npa-foreign-visitors',
          format: 'pdf',
          fileSha256: '2c376d148ba51bfa695356900a1d71a9cf3219cf299360205e8bff7d02c45262',
          textSha256: 'b58de1fefa0df2508890ce33decb535682eafa1bbb3f732d5892217588ce6dbc',
          quotes: [{ text: 'respond promptly and appropriately to 110 Emergency Calls from non-Japanese speakers', numbers: ['110'] }],
        },
      },
      {
        title: 'Fire and Disaster Management Agency (FDMA): Guide for Ambulance Services (119)',
        url: 'https://www.fdma.go.jp/publication/portal/items/portal001_pamphiet_english.pdf',
        accessed: CHECKED,
        check: {
          id: 'fdma-ambulance',
          format: 'pdf',
          fileSha256: '8a0d9e8128b3cd095644c7cc9bb86727be914c2f295ef76364d6339c915d8a54',
          textSha256: '9c92908308ee5d12a524a2cf583998ed94d3fab2692908b107fb28a7d412f542',
          quotes: [
            { text: 'Please call 119 when you need an ambulance service', numbers: ['119'] },
            // "119, fire department here. Is it a fire or an emergency (ambulance)?"
            { text: '119、消防です。 火事ですか、 救急ですか？', numbers: ['119'] },
          ],
        },
      },
      {
        title: 'Japan Coast Guard: 海の「事件・事故」は118番 (118 for incidents and accidents at sea)',
        url: 'https://www.kaiho.mlit.go.jp/doc/tel118.html',
        accessed: CHECKED,
        check: {
          id: 'jcg-118',
          format: 'html',
          fileSha256: '5a45051efe84e05f59b78efb763c2e2fb111b875e7707b5c622bc9936902358c',
          textSha256: 'a110da888d91942cbeb8e4394bcb54780f114f0cfb74fe2e35c8ff67027f3c4b',
          // "The Japan Coast Guard operates 118 as the emergency number for incidents and accidents at sea."
          quotes: [{ text: '海上保安庁では、海上における事件・事故の緊急通報用電話番号として「118番」の運用をしています。', numbers: ['118'] }],
        },
      },
    ],
  },
  {
    // Every emergency service (police, gendarmerie, fire, ambulance, AFAD...) answers on 112.
    country: 'TR',
    name: { en: 'Türkiye', el: 'Τουρκία' },
    general: '112',
    services: {},
    sources: [
      {
        title: 'Ministry of Interior, 112 Emergency Call Centres (112 Acil Çağrı Merkezi): 112 ACM Projesi (one number, 112, in all 81 provinces since 2021)',
        url: 'https://www.112.gov.tr/112-acm-projesi',
        accessed: CHECKED,
        check: {
          id: 'tr-112-project',
          format: 'html',
          fileSha256: '947e6a87c15cc2db99a4076e940ec2f463792f4aa584cc4a1cad24b5352f2705',
          textSha256: 'd932ff19d2259431781b51d5429c2f9f3ac3dcd2d6036b9a39b9408c40ad63b8',
          // "As of 2021 the single-number 112 system for emergencies is in service in all 81 provinces."
          quotes: [{ text: '2021 itibariyle 81 ilimizde acil durumda tek numara 112 sistemi devreye alınmıştır.', numbers: ['112'] }],
        },
      },
    ],
  },
];

/**
 * Countries whose official sources could not be snapshotted (the pages refuse automated requests:
 * crtc.gc.ca answers with a bot challenge, the Australian government sites close the connection from
 * outside Australia); every other country's numbers are checked by tools/cards-source-check.
 */
export const UNCHECKED_NUMBER_COUNTRIES: readonly string[] = ['AU', 'CA'];

export const DEFAULT_EMERGENCY_NUMBER = '112';

export interface ResolvedNumbers {
  country: string | null;
  general: string;
  services: Partial<Record<ServiceKind, string>>;
  /** False when the country is not in the dataset: 112 is a default, the local number may differ. */
  known: boolean;
  sources: readonly NumberSource[];
}

const BY_COUNTRY = new Map(COUNTRY_NUMBERS.map((c) => [c.country, c]));

export function numbersFor(country: string | null): ResolvedNumbers {
  const entry = country ? BY_COUNTRY.get(country.toUpperCase()) : undefined;
  if (!entry) return { country: country?.toUpperCase() ?? null, general: DEFAULT_EMERGENCY_NUMBER, services: {}, known: false, sources: [EC_112] };
  return { country: entry.country, general: entry.general, services: entry.services, known: true, sources: entry.sources };
}

/** Countries for the onboarding picker, sorted by name in the UI language. */
export function countryList(locale: 'en' | 'el'): { country: string; name: string }[] {
  return COUNTRY_NUMBERS.map((c) => ({ country: c.country, name: c.name[locale] })).sort((a, b) => a.name.localeCompare(b.name, locale));
}

/** Readable form of a stored number (digits only in the dataset): "210 779 3777", "1-800-222-1222". */
export function formatNumber(number: string): string {
  if (/^\d{10}$/.test(number) && number.startsWith('2')) return `${number.slice(0, 3)} ${number.slice(3, 6)} ${number.slice(6)}`;
  if (/^1800\d{7}$/.test(number)) return `1-800-${number.slice(4, 7)}-${number.slice(7)}`;
  return number;
}
