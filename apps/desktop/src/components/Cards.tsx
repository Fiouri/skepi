import type { EmergencyTopic } from '@skepi/core';
import {
  CARD_DISPLAY_LOCALE,
  CARDS,
  cardsForQuestion,
  countryList,
  formatNumber,
  localizeCard,
  numbersFor,
  type EmergencyCard,
  type ServiceKind,
} from '@skepi/emergency-cards';
import { useMessages } from '../lib/i18n';
import { useApp } from '../lib/store';
import { Banner } from './ui';

const SERVICE_ORDER: readonly ServiceKind[] = ['ambulance', 'fire', 'police', 'coastGuard', 'poison'];

export function useEmergencyNumbers() {
  return numbersFor(useApp((s) => s.country));
}

/** The general number first, then the country's services (a computer cannot dial: numbers only). */
export function EmergencyNumbers({ compact = false }: { compact?: boolean }) {
  const t = useMessages();
  const numbers = useEmergencyNumbers();
  const name = countryList('en').find((c) => c.country === numbers.country)?.name ?? null;
  const services = SERVICE_ORDER.flatMap((kind) => {
    const n = numbers.services[kind];
    return n ? [{ kind, number: n }] : [];
  });
  return (
    <Banner tone="danger" testId="emergency-numbers" role="alert">
      <strong>{t.ask.emergencyCall(numbers.general)}</strong>
      {services.length > 0 && (
        <div data-testid="emergency-services">
          {services.map((s) => `${t.emergency.services[s.kind]} ${formatNumber(s.number)}`).join(' · ')}
        </div>
      )}
      {!numbers.known && <div>{t.emergency.defaultNumber}</div>}
      {!compact && name && <div>{t.emergency.country(name)}</div>}
      {!compact && <div>{t.emergency.noGuarantee}</div>}
    </Banner>
  );
}

/** One card: numbered steps, when to call, sources; drafts carry the permanent banner. */
export function CardView({ card }: { card: EmergencyCard }) {
  const t = useMessages();
  const c = localizeCard(card, CARD_DISPLAY_LOCALE);
  return (
    <article className="stack" data-testid={`card-${c.id}`}>
      <h1>{c.title}</h1>
      {c.draft && (
        <Banner tone="warning" testId="card-draft-banner" role="alert">
          {t.cards.draftBanner}
        </Banner>
      )}
      <EmergencyNumbers compact />
      <h2>{t.cards.steps}</h2>
      <ol>
        {c.steps.map((s, i) => (
          <li key={i} style={{ fontSize: 18, marginBottom: 8 }}>
            {s.text}
          </li>
        ))}
      </ol>
      <h2>{t.cards.whenToCall}</h2>
      <p>{c.whenToCallForHelp.text}</p>
      <h2>{t.cards.sources}</h2>
      <ul className="muted">
        {[...new Map(c.steps.flatMap((s) => s.refs).map((r) => [`${r.source}|${r.locator}`, r])).values()].map((r) => (
          <li key={`${r.source}|${r.locator}`}>{t.cards.source({ title: r.title, locator: r.locator })}</li>
        ))}
      </ul>
    </article>
  );
}

export function CardLinks({ cards, onOpen }: { cards: readonly EmergencyCard[]; onOpen: (id: string) => void }) {
  return (
    <div className="row" data-testid="card-links">
      {cards.map((card) => {
        const c = localizeCard(card, CARD_DISPLAY_LOCALE);
        return (
          <button key={c.id} type="button" className="chip" data-testid={`card-link-${c.id}`} onClick={() => { onOpen(c.id); }}>
            {c.title}
          </button>
        );
      })}
    </div>
  );
}

/** The cards matching a question or emergency topics (shown before any AI output). */
export function EmergencyCardSlot({ question, topics, onOpen }: { question: string; topics: readonly EmergencyTopic[]; onOpen: (id: string) => void }) {
  const cards = cardsForQuestion(question, topics);
  if (cards.length === 0) return null;
  return <CardLinks cards={cards} onOpen={onOpen} />;
}

export const ALL_CARDS = CARDS;
