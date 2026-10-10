import { latinDetectionText } from './normalize';
import { foldText } from './text';

/**
 * Phone numbers in source text (post-preview hardening). On emergency intent Layer 1 flags every
 * sentence that contains one: the number the reader should call is the bundled one shown first, never
 * a number from a source. Generic shapes only, no list of numbers:
 *
 * - a dialling form: a leading `+`, an area code in brackets, or digit groups joined by spaces, dots or
 *   hyphens with at least 6 digits in total (`555-0199`, `(210) 555 0100`, `+30 210 5550100`); dates
 *   (`10.10.2026`), year ranges (`1990-2000`), thousands (`1 000 000`) and decimals are not;
 * - any digit run of 2–15 digits right after a calling verb or noun ("call 911", "dial 0800 …",
 *   "hotline 1234", "καλέστε στο 1555").
 *
 * The apps leave out the numbers of the user's country (`unbundledNumbers`): those are the ones shown
 * first, from the bundle.
 */

const DIALLING = new RegExp(
  String.raw`(?<![\p{L}\p{N}.,])(?:\+\s?\d[\d\s().-]{4,22}\d|\(\d{1,5}\)[\s.-]?\d[\d\s.-]{2,18}\d|\d{1,5}(?:[\s.-]\d{2,5}){1,4})(?![\p{N}]|[.,]\d)`,
  'gu',
);
const CALL_CUE_EN = String.raw`(?:call|calling|dial|dials|dialing|dialling|phone|phoning|telephone|tel\.?|text|texting|sms|hotline|helpline)`;
const CALL_CUE_EL = String.raw`(?:καλεστε|καλεσε|καλειτε|καλουν|τηλεφωνηστε|τηλεφωνησε|τηλεφωνο|τηλεφωνου|τηλ\.?|σχηματιστε|σχηματισε)`;
/**
 * Up to three words between the cue and the number ("call the hut warden on …", "text the rescue line
 * …"), none of them a preposition of time, origin or quantity ("phone lines were down for 12 days").
 */
const NOT_BEFORE_NUMBER = String.raw`(?:of|in|since|for|during|from|by|until|after|before|about|over|under|per|than|απο|για|μεχρι|κατα|μετα|πριν|εωσ)`;
const AFTER_CUE = String.raw`(?:\s+(?!${NOT_BEFORE_NUMBER}(?!\p{L}))[\p{L}'’-]+){0,3}[\s:]*`;
const NUMBER = String.raw`(\+?\d[\d\s().-]{0,20}\d|\d{2,15})(?![\p{N}]|[.,]\d)`;
const AFTER_CALL = new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${CALL_CUE_EN}|${CALL_CUE_EL})${AFTER_CUE}${NUMBER}`, 'giu');
/** Further numbers of the same list: "call 555-0100 or 555-0101", "καλέστε 1555 ή 1556". */
const NEXT_NUMBER = new RegExp(String.raw`^\s*(?:,|/|or|and|ή|η|και)\s*${NUMBER}`, 'iu');

const DATE = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/u;
const YEAR_RANGE = /^(1\d{3}|20\d{2})\s?[-–]\s?(1\d{3}|20\d{2})$/u;
/** Thousands written with spaces or dots ("1 000 000", "2.500.000"): a quantity, not a number to dial. */
const THOUSANDS = /^\d{1,3}(?:[ .]\d{3})+$/u;

const digitsOf = (s: string): string => s.replace(/\D/gu, '');

function isDialling(candidate: string): boolean {
  const s = candidate.trim();
  if (DATE.test(s) || YEAR_RANGE.test(s) || THOUSANDS.test(s)) return false;
  const digits = digitsOf(s).length;
  return digits >= 6 && digits <= 15;
}

/** Phone numbers in the sentence, as written (in the detection form, see normalize.ts). */
export function findPhoneNumbers(sentence: string): string[] {
  const text = latinDetectionText(sentence);
  const folded = foldText(text);
  const found: string[] = [];
  const add = (raw: string): void => {
    const number = raw.trim();
    const digits = digitsOf(number);
    if (digits.length < 2 || found.some((f) => digitsOf(f) === digits)) return;
    found.push(number);
  };
  const addListed = (number: string | undefined): void => {
    if (number && !DATE.test(number.trim()) && digitsOf(number).length <= 15) add(number);
  };
  /** The numbers listed after a phone number ("555-0100 or 112"). */
  const addFollowing = (rest: string): void => {
    for (let next = NEXT_NUMBER.exec(rest); next; next = NEXT_NUMBER.exec(rest)) {
      addListed(next[1]);
      rest = rest.slice(next[0].length);
    }
  };
  for (const m of text.matchAll(DIALLING)) {
    if (!isDialling(m[0])) continue;
    add(m[0]);
    addFollowing(text.slice(m.index + m[0].length));
  }
  // The Greek cues are folded words: match on folded text.
  for (const m of folded.matchAll(AFTER_CALL)) {
    addListed(m[1]);
    addFollowing(folded.slice(m.index + m[0].length));
  }
  return found;
}

/** The numbers that are not one of the bundled numbers of the user's country (digits compared). */
export function unbundledNumbers(found: readonly string[], bundled: readonly string[]): string[] {
  const own = new Set(bundled.map(digitsOf));
  return found.filter((n) => !own.has(digitsOf(n)));
}
