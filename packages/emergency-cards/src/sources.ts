import type { CardSource } from './schema';

/**
 * The only source of card text: the latest edition of the IFRC guidelines (2025, published by the IFRC
 * Global First Aid Reference Centre in March 2026). The PDF is never committed; tools/cards-source-check
 * downloads it from `url`, checks `sha256` and extracts its text.
 */
export const IFRC_GUIDELINES: CardSource = {
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
