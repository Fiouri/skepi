import { CARD_DISPLAY_LOCALE, cardById, localizeCard } from '@skepi/emergency-cards';
import { useNav } from '../App';
import { ALL_CARDS, CardView, EmergencyNumbers } from '../components/Cards';
import { Button } from '../components/ui';
import { useMessages } from '../lib/i18n';

/** Emergency numbers first, then the bundled cards (no pack needed; drafts carry a banner). */
export function CardsScreen() {
  const t = useMessages();
  const cardId = useNav((s) => s.cardId);
  const openCard = useNav((s) => s.openCard);
  const card = cardId ? cardById(cardId) : null;
  if (card) {
    return (
      <section className="stack" data-testid="card-screen">
        <div>
          <Button
            testId="cards-back"
            tone="plain"
            label={t.emergency.cards}
            onClick={() => {
              openCard(null);
            }}
          />
        </div>
        <CardView card={card} />
      </section>
    );
  }
  return (
    <section className="stack" data-testid="cards-screen">
      <h1>{t.emergency.title}</h1>
      <EmergencyNumbers />
      <h2>{t.emergency.cards}</h2>
      <div className="stack">
        {ALL_CARDS.map((c) => {
          const l = localizeCard(c, CARD_DISPLAY_LOCALE);
          return (
            <button
              key={l.id}
              type="button"
              className="hit"
              data-testid={`card-open-${l.id}`}
              onClick={() => {
                openCard(l.id);
              }}
            >
              {l.title} {l.draft && <span className="unverified">{t.readiness.cardsDraft}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
