import { PUBLIC_DOMAIN_US, type CardSource } from './schema';

/**
 * Every source a card step may cite. Public-domain material only (US federal government works);
 * no copyrighted guidelines (ERC, AHA, WHO, Red Cross texts). Each text was checked against the
 * source on the `accessed` date.
 */
const ACCESSED = '2026-10-05';

const source = (id: string, title: string, publisher: string, url: string): CardSource => ({
  id,
  title,
  publisher,
  url,
  licence: PUBLIC_DOMAIN_US,
  accessed: ACCESSED,
});

export const SOURCES: readonly CardSource[] = [
  source(
    'atp-4-02-11',
    'ATP 4-02.11, Casualty Response, Tactical Combat Casualty Care, and First Aid (23 March 2026; approved for public release, distribution unlimited; supersedes TC 4-02.1)',
    'Headquarters, Department of the Army (US)',
    'https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN46159-ATP_4-02.11-000-WEB-1.pdf',
  ),
  source(
    'fema-until-help-arrives',
    'Until Help Arrives, web tutorial, version 1.0',
    'FEMA / Ready.gov (US)',
    'https://www.ready.gov/sites/default/files/2020-07/until-help-arrives-web-tutorial.pdf',
  ),
  source('fema-control-bleeding', 'Steps to Control Bleeding (Until Help Arrives, slide 57)', 'FEMA / Ready.gov (US)', 'https://www.ready.gov/training/steps_to_control_bleeding.pdf'),
  source(
    'usfa-unresponsive',
    'Pictograph: If Someone Is Unresponsive',
    'U.S. Fire Administration (FEMA)',
    'https://www.usfa.fema.gov/gallery/pictographs/pictograph101.html',
  ),
  source('nhlbi-cardiac-arrest', 'Cardiac Arrest: Treatment', 'National Heart, Lung, and Blood Institute (NIH, US)', 'https://www.nhlbi.nih.gov/health/cardiac-arrest/treatment'),
  source('ready-burns', 'Preventing and Treating Burns', 'Ready.gov (FEMA, US)', 'https://www.ready.gov/preventing-and-treating-burns'),
  source('cdc-hypothermia', 'Preventing Hypothermia', 'Centers for Disease Control and Prevention (US)', 'https://www.cdc.gov/winter-weather/prevention/index.html'),
  source('cdc-water-emergency', 'How to Make Water Safe in an Emergency', 'Centers for Disease Control and Prevention (US)', 'https://www.cdc.gov/water-emergency/about/index.html'),
  source(
    'epa-pesticide-first-aid',
    'First Aid in Case of Pesticide Exposure (EPA web snapshot, 19 January 2017)',
    'U.S. Environmental Protection Agency',
    'https://19january2017snapshot.epa.gov/pesticide-incidents/first-aid-case-pesticide-exposure_.html',
  ),
  source('ready-earthquakes', 'Earthquakes', 'Ready.gov (FEMA, US)', 'https://www.ready.gov/earthquakes'),
  source('ready-home-fires', 'Home Fires', 'Ready.gov (FEMA, US)', 'https://www.ready.gov/home-fires'),
  source('ready-floods', 'Floods', 'Ready.gov (FEMA, US)', 'https://www.ready.gov/floods'),
];

/** Source hosts allowed for card text (US federal government). */
export const ALLOWED_SOURCE_HOSTS: readonly RegExp[] = [/\.gov$/, /\.mil$/];
