/**
 * Emergency numbers per country, bundled and never fetched (docs/architecture.md, "Emergency
 * numbers"). The country is chosen at onboarding, not taken from the network. Every entry names the
 * official page it was checked against. A country that is not listed gets the default, 112, with a
 * note that the local number should be checked; the app never promises that a call works without
 * a SIM card or network.
 */

export type ServiceKind = 'ambulance' | 'fire' | 'police' | 'coastGuard' | 'poison';

export interface NumberSource {
  title: string;
  url: string;
  accessed: string;
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
const EC_112: NumberSource = {
  title: 'European Commission: 112, the European emergency number',
  url: 'https://digital-strategy.ec.europa.eu/en/policies/112',
  accessed: ACCESSED,
};

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
        accessed: ACCESSED,
      },
    ],
  },
  ...EU.map(([country, en, el]) => ({ country, name: { en, el }, general: '112', services: {}, sources: [EC_112] })),
  {
    country: 'CH',
    name: { en: 'Switzerland', el: 'Ελβετία' },
    general: '112',
    services: {},
    sources: [EC_112],
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
        accessed: ACCESSED,
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
      {
        title: 'U.S. EPA: First Aid in Case of Pesticide Exposure (Poison Control (800) 222-1222)',
        url: 'https://19january2017snapshot.epa.gov/pesticide-incidents/first-aid-case-pesticide-exposure_.html',
        accessed: ACCESSED,
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
        accessed: ACCESSED,
      },
    ],
  },
];

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
