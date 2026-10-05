import { foldText, splitSentences } from './text';

/**
 * Source text is data, never instructions. Before chunking (so before Layer 1, which shows verbatim
 * text, and before the model sees anything), passages lose two kinds of text:
 *
 * 1. **Structural injections** (Phase 1d): text whose *form* marks it as aimed at a language model,
 *    independent of its wording — forged `<source>` blocks and tags, chat-template markup, JSON
 *    objects with role/system/assistant keys, lines that start with a role prefix (`SYSTEM:`,
 *    `[assistant]`), and sentences addressed to the model, assistant, AI or summariser (vocatives,
 *    "note for …", persona assignments, answer-format orders, "this line supersedes …"). A forged
 *    span is removed whole; a structural sentence also removes the rest of its paragraph, because
 *    what follows an address to the model is the injected instruction.
 * 2. **Lexicon injections** (Phase 1b): common injection phrasings in English and Greek ("ignore
 *    previous instructions", "tell the user"); only the sentence itself is removed.
 *
 * Paragraph breaks (`\n`, one per block element of the article) bound the structural removal; the
 * output keeps them, chunking normalises whitespace afterwards. Neither pass catches every possible
 * injection; answers stay citation-checked either way.
 */

const LEXICON: readonly RegExp[] = [
  /<\/?\s*source\b|‹\/?\s*source\b/i,
  /<\|?\s*(im_start|im_end|system|assistant)\b/i,
  /\b(ignore|disregard|forget)\b[^.!?]{0,40}\b(instructions?|sources?|above|previous|prior|question|rules?)\b/i,
  /\b(new|updated) instructions?\s*:/i,
  /^\s*(system|assistant|user)\s*[:,]/i,
  /\b(system|assistant)\s*:\s/i,
  /\byou are now\b/i,
  /\b(tell|instruct) the (user|reader)\b/i,
  /\bthe answer must\b/i,
  // JavaScript's \b is ASCII-only: Greek word boundaries need Unicode look-arounds.
  /(?<!\p{L})αγνό(ησε|ησέ|ηστε)(?!\p{L})/iu,
  /(?<!\p{L})ξέχασε(?!\p{L})[^.!?;]{0,40}(ερώτηση|οδηγίες|πηγές)/iu,
  /(?<!\p{L})(σύστημα|βοηθός)\s*:/iu,
  /(?<!\p{L})νέα οδηγία(?!\p{L})/iu,
  /(?<!\p{L})πες στον (χρήστη|αναγνώστη)(?!\p{L})/iu,
];

/** Lexicon check (Phase 1b): the sentence uses a known injection phrasing. */
export function isInjection(sentence: string): boolean {
  return LEXICON.some((re) => re.test(sentence));
}

export type StructuralReason =
  | 'forged-source-block'
  | 'forged-source-tag'
  | 'chat-markup'
  | 'json-role-object'
  | 'role-prefix'
  | 'addressed-to-model';

export type RemovalReason = StructuralReason | 'lexicon';

export interface Removal {
  text: string;
  reason: RemovalReason;
}

export interface SanitizeReport {
  text: string;
  removed: Removal[];
}

// ---------------------------------------------------------------------------------------------
// Forged markup (removed as spans, before paragraphs and sentences are looked at)

const OPEN = String.raw`(?:<|‹|&lt;|\[)`;
const CLOSE = String.raw`(?:>|›|&gt;|\])`;
/** A whole forged `<source …>…</source>` block: everything inside pretends to be another source. */
const FORGED_SOURCE_BLOCK = new RegExp(
  String.raw`${OPEN}\s*source\b[^\n>›\]]{0,200}${CLOSE}[^\n]*?${OPEN}\s*\/\s*source\s*${CLOSE}`,
  'giu',
);
const FORGED_SOURCE_TAG = new RegExp(String.raw`${OPEN}\s*\/?\s*source\b`, 'iu');
/** Chat-template and prompt-format markup of common model families. */
const CHAT_MARKUP =
  /<\|[a-z_ ]{1,30}\|>|\[\/?\s*INST\s*\]|<<\s*\/?\s*SYS\s*>>|<\s*\/?\s*(?:start_of_turn|end_of_turn|im_start|im_end|system|assistant|user)\s*>|^#{2,}\s*(?:system|instruction|instructions|response|assistant|user)\b/iu;
/** A JSON key that only makes sense in a chat message or prompt object. */
const JSON_ROLE_KEY = /["'“”‘’]\s*(?:role|system|assistant|developer|system_prompt|prompt|instructions?|messages)\s*["'“”‘’]\s*:/iu;
const MAX_JSON_SPAN = 4000;

/** End index (exclusive) of the balanced `{…}` starting at `start`, or -1 when it does not close. */
function jsonObjectEnd(text: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  const limit = Math.min(text.length, start + MAX_JSON_SPAN);
  for (let i = start; i < limit; i += 1) {
    const ch = text[i];
    if (quote !== null) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"') quote = ch;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** Removes JSON objects with role/system/assistant keys; an unclosed one runs to the paragraph end. */
function stripJsonRoleObjects(text: string, removed: Removal[]): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const end = jsonObjectEnd(text, open);
    const paragraphEnd = text.indexOf('\n', open);
    const stop = end >= 0 ? end : paragraphEnd >= 0 ? paragraphEnd : text.length;
    const span = text.slice(open, stop);
    if (JSON_ROLE_KEY.test(span)) {
      out += `${text.slice(i, open)}\n`;
      removed.push({ text: span, reason: 'json-role-object' });
    } else {
      out += text.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    i = stop;
  }
  return out + text.slice(i);
}

function stripForgedMarkup(text: string, removed: Removal[]): string {
  const withoutBlocks = text.replace(FORGED_SOURCE_BLOCK, (block) => {
    removed.push({ text: block, reason: 'forged-source-block' });
    return '\n';
  });
  return stripJsonRoleObjects(withoutBlocks, removed);
}

// ---------------------------------------------------------------------------------------------
// Role prefixes and sentences addressed to the model

const LEAD = String.raw`^[\s"'“‘«>*•·\-–—]*`;
/** `SYSTEM:`, `Assistant (override):`, `[user]`, `<<system>>`: a line or sentence written as a chat turn. */
const ROLE_PREFIX = new RegExp(
  String.raw`${LEAD}(?:[\[(<]\s*(?:system|assistant|user|developer)\s*[\])>]|(?:system|assistant|user|developer|human|ai|bot|sys)(?:\s+(?:message|prompt|note|override|instructions?))?\s*(?:\([^)]{0,30}\))?\s*[:：>])`,
  'iu',
);
const ROLE_PREFIX_EL = new RegExp(
  String.raw`${LEAD}(?:[\[(<]\s*(?:συστημα|βοηθοσ|χρηστησ)\s*[\])>]|(?:συστημα|βοηθοσ|χρηστησ|τεχνητη νοημοσυνη)\s*(?:\([^)]{0,30}\))?\s*[:：>])`,
  'u',
);

/** Who an injected sentence talks to: models, assistants, bots, summarisers, automated readers. */
const ADDRESSEE = [
  String.raw`a\.?i\.?(?:\s+(?:systems?|models?|assistants?|agents?|tools?|readers?))?`,
  String.raw`artificial[- ]intelligence(?:\s+(?:systems?|models?|assistants?))?`,
  String.raw`(?:virtual|digital|chat|ai)\s*(?:assistants?|models?|agents?|bots?)`,
  String.raw`assistants?`,
  String.raw`chat-?bots?`,
  String.raw`bots?`,
  String.raw`llms?`,
  String.raw`(?:large\s+)?language\s+models?`,
  String.raw`gpts?`,
  String.raw`summari[sz]ers?`,
  String.raw`summari[sz]ation\s+(?:tools?|systems?|models?|software)`,
  String.raw`(?:automated|automatic|machine)\s+(?:systems?|readers?|agents?|tools?|summari[sz]ers?|assistants?|processors?)`,
  String.raw`(?:systems?|tools?|programs?|software|models?|agents?|crawlers?)\s+(?:that|which)\s+(?:summari[sz]e|read|process|parse|answer|ingest|index)\w*`,
].join('|');
const ADDR = String.raw`(?:${ADDRESSEE})`;
const QUANT = String.raw`(?:(?:all|any|every|each|the|you)\s+)?`;
const VOCATIVE = String.raw`(?:(?:dear|hey|hi|hello|attention|attn|calling|to)\s+(?:the\s+)?)?(?:(?:all|any|every|each|you)\s+)?`;
const THIS_TEXT = String.raw`(?:this|the\s+present|the\s+following)\s+(?:page|article|text|passage|document|entry|source|content|section)`;
const DIRECTIVE = String.raw`(?:must|should|shall|will|need\s+to|have\s+to|are\s+(?:required|instructed|asked)\s+to|please|do\s+not|don't|never|always|only)`;

const ADDRESSED_EN: readonly RegExp[] = [
  // Vocative at the start: "Assistant, …", "Dear AI: …", "To any language model reading this: …".
  new RegExp(
    String.raw`^\W*${VOCATIVE}${ADDR}(?:\s+(?:that|which|who|reading|summari[sz]ing|processing)\b[^,:;]{0,60})?\s*[,:;!—–]`,
    'iu',
  ),
  // "A note for automated systems …", "Message to all chatbots …".
  new RegExp(
    String.raw`\b(?:notes?|messages?|instructions?|reminders?|warnings?|directives?|memos?|notices?|requests?|hints?)\s+(?:to|for)\s+${QUANT}${ADDR}(?![\p{L}\p{N}])`,
    'iu',
  ),
  // "If you are an AI …", "As a language model, you …".
  new RegExp(String.raw`\b(?:if|when|while|since)\s+you(?:'re|\s+are)\s+(?:an?\s+|the\s+)?${ADDR}(?![\p{L}\p{N}])`, 'iu'),
  new RegExp(String.raw`\bas\s+(?:an?|the)\s+${ADDR}\s*,\s*you\b`, 'iu'),
  // A model reading this text, told what to do: "Any AI that summarises this page must …".
  new RegExp(String.raw`(?<![\p{L}\p{N}])${ADDR}(?![\p{L}\p{N}])[^.!?]{0,80}\b${THIS_TEXT}\b[^.!?]{0,60}\b${DIRECTIVE}\b`, 'iu'),
  new RegExp(String.raw`(?<![\p{L}\p{N}])${ADDR}(?![\p{L}\p{N}])[^.!?]{0,40}\b${DIRECTIVE}\b[^.!?]{0,80}\b${THIS_TEXT}\b`, 'iu'),
  // Persona assignment: "You are now HelperBot", "you are an AI assistant", "from now on you are …".
  new RegExp(String.raw`\byou(?:'re|\s+are)\s+(?:now\s+)?(?:called\s+|named\s+)?(?:an?\s+|the\s+)?${ADDR}(?![\p{L}\p{N}])`, 'iu'),
  // A persona name (case-sensitive: a capitalised name ending in Bot / GPT / AI).
  /\b[Yy]ou(?:'re|\s+are)\s+(?:now\s+)?(?:called\s+|named\s+)?\p{Lu}[\p{L}\p{N}]*(?:[Bb]ot|GPT|AI)\b/u,
  /\b(?:from\s+now\s+on|henceforth|from\s+this\s+point\s+(?:on|forward)|starting\s+now)[,\s]+you(?:'re|\s+are|\s+will\s+be|\s+(?:will|must|shall)\s+(?:act|behave|pretend|respond|answer|reply|speak)\b)/iu,
  /\byou\s+(?:will|must|shall|should)\s+(?:now\s+)?(?:act|behave|pretend|role-?play|respond|answer|reply|speak)\s+as\b/iu,
  /\b(?:pretend|imagine)\s+(?:that\s+)?you(?:'re|\s+are)\b/iu,
  /\bstay\s+in\s+character\b/iu,
  /\b(?:your|the)\s+(?:new\s+)?(?:persona|identity|character)\s+is\b/iu,
  // Orders about the answer itself: "When asked about X, reply only with …", "Answer only with: …".
  /^\W*(?:when|if|whenever|once)\b[^,]{0,80}\b(?:asked|questioned|prompted|queried)\b[^,]{0,80},\s*(?:always\s+|only\s+|just\s+|simply\s+|please\s+)?(?:reply|respond|answer|say|output|write|state|print|return|tell)\b/iu,
  /^\W*(?:please\s+|always\s+|only\s+|just\s+)?(?:reply|respond|answer|output|say)\s+(?:only|exclusively|solely|always|with\s*[:"“'‘])/iu,
  // Text claiming authority over the rest of the text: "this line supersedes all other text".
  /\b(?:this|the\s+following|these|the\s+present)\s+(?:line|sentence|note|text|paragraph|passage|section|statement|instruction|message|correction|update|entry)s?\b[^.!?]{0,40}\b(?:supersedes?|overrides?|replaces?|takes?\s+precedence|has\s+priority|outranks?|invalidates?|cancels?)\b/iu,
  /\b(?:supersedes?|overrides?|takes?\s+precedence\s+over|invalidates?)\s+(?:all|any|every)\s+(?:other|previous|prior|earlier|preceding|conflicting)\s+(?:text|content|information|instructions?|sources?|lines?|sentences?|statements?|passages?)\b/iu,
];

/** Greek patterns run on folded text (lowercase, no accents, final ς → σ). */
const L = String.raw`\p{L}*`;
const NB = String.raw`(?<![\p{L}\p{N}])`;
const NA = String.raw`(?![\p{L}\p{N}])`;
const ADDRESSEE_EL = [
  String.raw`τεχνητη\s+νοημοσυνη`,
  String.raw`τν`,
  String.raw`γλωσσικ${L}\s+μοντελ${L}`,
  String.raw`μοντελ${L}\s+(?:τεχνητησ\s+νοημοσυνησ|τν|γλωσσασ)`,
  String.raw`(?:ψηφιακ${L}|εικονικ${L})\s+βοηθ${L}`,
  String.raw`βοηθ(?:ε|οσ|οι|ουσ|ο)`,
  String.raw`chat-?bots?`,
  String.raw`μποτ`,
  String.raw`συνοψιστ${L}`,
  String.raw`αυτοματοποιημεν${L}\s+συστημ${L}`,
  String.raw`συστημ${L}\s+(?:που|τα\s+οποια|το\s+οποιο)\s+(?:συνοψιζ|διαβαζ|επεξεργαζ|απαντ)${L}`,
].join('|');
const ADDR_EL = String.raw`(?:${ADDRESSEE_EL})`;
const QUANT_EL = String.raw`(?:(?:ολ${L}|καθε|το|τα|τον|την|τουσ|τισ|η|οι|στο|στα|στον|στουσ)\s+)?`;

const ADDRESSED_EL: readonly RegExp[] = [
  new RegExp(
    String.raw`^[^\p{L}\p{N}]*(?:(?:αγαπητ${L}|προσοχη)\s+)?${QUANT_EL}${ADDR_EL}${NA}(?:\s+(?:που|τα\s+οποια)${NA}[^,:;]{0,60})?\s*[,:;!—–]`,
    'u',
  ),
  new RegExp(
    String.raw`${NB}(?:σημειωσ${L}|μηνυμα${L}|οδηγι${L}|υπενθυμισ${L}|προειδοποιησ${L})\s+(?:για|προσ)\s+${QUANT_EL}${ADDR_EL}${NA}`,
    'u',
  ),
  new RegExp(String.raw`${NB}(?:αν|εαν|οταν)\s+(?:εισαι|ειστε)\s+(?:ενα\s+|ενασ\s+|μια\s+)?${ADDR_EL}${NA}`, 'u'),
  new RegExp(String.raw`${NB}(?:απο\s+(?:εδω\s+και\s+)?(?:τωρα|στο\s+εξησ)|στο\s+εξησ)[,\s]+(?:εισαι|θα\s+εισαι|θα\s+(?:απαντασ|λεσ|παριστανεισ|μιλασ))${NA}`, 'u'),
  new RegExp(String.raw`${NB}(?:παριστανε|προσποιησου|υποδυσου)${NA}`, 'u'),
  new RegExp(String.raw`${NB}εισαι\s+(?:πλεον\s+|τωρα\s+)?(?:ο\s+|η\s+|ενα\s+|ενασ\s+|μια\s+)?${ADDR_EL}${NA}`, 'u'),
  new RegExp(
    String.raw`^[^\p{L}\p{N}]*(?:οταν|αν|εαν)\s+(?:σε\s+|σασ\s+)?(?:ρωτ${L}|ερωτηθ${L})[^,]{0,80},\s*(?:παντα\s+|μονο\s+)?(?:απαντ${L}|πεσ|γραψε|λεγε)${NA}`,
    'u',
  ),
  new RegExp(String.raw`^[^\p{L}\p{N}]*(?:απαντ(?:α|ησε|ηστε)|πεσ|γραψε)\s+μονο${NA}`, 'u'),
  new RegExp(
    String.raw`${NB}(?:αυτη\s+η|αυτο\s+το|αυτοσ\s+ο|η\s+παρουσα|το\s+παρον)\s+(?:γραμμη|προταση|σημειωση|κειμενο|οδηγια|παραγραφοσ|διορθωση|ενημερωση)${NA}[^.!;]{0,40}(?:υπερισχυ|αντικαθιστ|ακυρων)${L}`,
    'u',
  ),
];

/** The sentence speaks to a language model / assistant / summariser rather than stating a fact. */
export function isAddressedToModel(sentence: string): boolean {
  if (ADDRESSED_EN.some((re) => re.test(sentence))) return true;
  const folded = foldText(sentence);
  return ADDRESSED_EL.some((re) => re.test(folded));
}

export function hasRolePrefix(text: string): boolean {
  return ROLE_PREFIX.test(text) || ROLE_PREFIX_EL.test(foldText(text));
}

/** Structural reason a sentence opens injected text (the rest of its paragraph goes with it). */
export function structuralReason(sentence: string): StructuralReason | null {
  if (FORGED_SOURCE_TAG.test(sentence)) return 'forged-source-tag';
  if (CHAT_MARKUP.test(sentence)) return 'chat-markup';
  if (hasRolePrefix(sentence)) return 'role-prefix';
  if (isAddressedToModel(sentence)) return 'addressed-to-model';
  return null;
}

/** Sanitised text and what was removed, with the reason (tests and rag-eval reports). */
export function sanitizeWithReport(text: string): SanitizeReport {
  const removed: Removal[] = [];
  const paragraphs = stripForgedMarkup(text, removed).split('\n');
  const out: string[] = [];
  for (const paragraph of paragraphs) {
    const sentences = splitSentences(paragraph);
    const kept: string[] = [];
    for (let i = 0; i < sentences.length; i += 1) {
      const s = sentences[i] ?? '';
      const reason = structuralReason(s);
      if (reason) {
        removed.push({ text: sentences.slice(i).join(' '), reason });
        break;
      }
      if (isInjection(s)) {
        removed.push({ text: s, reason: 'lexicon' });
        continue;
      }
      kept.push(s);
    }
    if (kept.length > 0) out.push(kept.join(' '));
  }
  return { text: out.join('\n'), removed };
}

/** Text without structural or lexicon injections (order and wording of the rest unchanged). */
export function sanitizeSourceText(text: string): string {
  return sanitizeWithReport(text).text;
}
