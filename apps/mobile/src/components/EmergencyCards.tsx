import type { EmergencyTopic } from '@skepi/core';
import {
  CARD_DISPLAY_LOCALE,
  cardsForQuestion,
  countryList,
  formatNumber,
  localizeCard,
  numbersFor,
  type EmergencyCard,
  type LocalizedCard,
  type ServiceKind,
} from '@skepi/emergency-cards';
import * as Speech from 'expo-speech';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useLanguage, useMessages } from '../lib/i18n';
import { usePrefs } from '../lib/prefs';
import { Button, useStyles } from './ui';

const SERVICE_ORDER: readonly ServiceKind[] = ['ambulance', 'fire', 'police', 'coastGuard', 'poison'];

/** Emergency numbers for the country chosen at onboarding (112 default when unknown). */
export function useEmergencyNumbers() {
  const country = usePrefs((s) => s.country);
  return numbersFor(country);
}

function dial(number: string): void {
  // Opens the dialler with the number filled in; the user presses call. Never dials automatically.
  void Linking.openURL(`tel:${number}`).catch(() => undefined);
}

/** The general emergency number first, then the country's services, each opening the dialler. */
export function EmergencyNumbers({ compact = false }: { compact?: boolean }) {
  const t = useMessages();
  const styles = useStyles();
  const lang = useLanguage();
  const numbers = useEmergencyNumbers();
  const name = countryList(lang).find((c) => c.country === numbers.country)?.name ?? null;
  const services = SERVICE_ORDER.flatMap((kind) => {
    const n = numbers.services[kind];
    return n ? [{ kind, number: n }] : [];
  });
  return (
    <View style={styles.banner} testID="emergency-numbers">
      <Text style={styles.bannerText} accessibilityRole="header">
        {t.ask.emergencyCall(numbers.general)}
      </Text>
      <Button testID="call-general" label={t.emergency.call(numbers.general)} tone="danger" onPress={() => { dial(numbers.general); }} />
      {services.length > 0 && (
        <Text style={styles.bannerBody} testID="emergency-services">
          {t.ask.emergencyServices(services.map((s) => `${t.emergency.services[s.kind]} ${formatNumber(s.number)}`).join(' · '))}
        </Text>
      )}
      {!compact &&
        services.map((s) => (
          <Button
            key={s.kind}
            testID={`call-${s.kind}`}
            label={`${t.emergency.services[s.kind]}: ${formatNumber(s.number)}`}
            tone="danger"
            onPress={() => { dial(s.number); }}
          />
        ))}
      {!numbers.known && <Text style={styles.bannerBody}>{t.emergency.defaultNumber}</Text>}
      {!compact && name && <Text style={styles.bannerBody}>{t.emergency.country(name)}</Text>}
      {!compact && <Text style={styles.bannerBody}>{t.emergency.noGuarantee}</Text>}
    </View>
  );
}

/** The first line of every card: call the emergency number first, with a button to the dialler. */
function CallFirst() {
  const t = useMessages();
  const styles = useStyles();
  const numbers = useEmergencyNumbers();
  return (
    <View style={styles.banner} testID="card-call-first" accessibilityRole="alert">
      <Text style={styles.bannerText} accessibilityRole="header">
        {t.cards.callFirst(numbers.general)}
      </Text>
      <Button testID="card-call" label={t.emergency.call(numbers.general)} tone="danger" onPress={() => { dial(numbers.general); }} />
    </View>
  );
}

/** "Source: IFRC … 2025, "<section>", p. <page>." under the steps (verbatim excerpts, cited). */
function Citation({ card }: { card: LocalizedCard }) {
  const styles = useStyles();
  return (
    <Text style={styles.muted} selectable testID="card-citation">
      {card.citation}
    </Text>
  );
}

function speakable(card: LocalizedCard, stepWord: (n: number) => string): string {
  return [card.title, ...card.steps.map((s, i) => `${stepWord(i + 1)}. ${s.text}`)].join('\n');
}

/** Reads the card aloud with the OS text-to-speech (offline voices permitting). */
function ReadAloud({ card }: { card: LocalizedCard }) {
  const t = useMessages();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => {
    void Speech.stop();
  }, []);
  const toggle = (): void => {
    if (speaking) {
      void Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    // The steps are English IFRC text in every locale.
    Speech.speak(speakable(card, t.cards.step), {
      language: 'en-US',
      rate: 0.9,
      onDone: () => { setSpeaking(false); },
      onStopped: () => { setSpeaking(false); },
      onError: () => { setSpeaking(false); },
    });
  };
  return <Button testID="card-read-aloud" label={speaking ? t.cards.stopReading : t.cards.readAloud} onPress={toggle} />;
}

/** A whole card: "Call <number> first", numbered IFRC steps, the citation, read aloud. */
export function CardView({ card }: { card: EmergencyCard }) {
  const t = useMessages();
  const styles = useStyles();
  const c = localizeCard(card, CARD_DISPLAY_LOCALE);
  return (
    <View style={{ gap: 12 }} testID={`card-${card.id}`}>
      <Text style={styles.heading} accessibilityRole="header">
        {c.title}
      </Text>
      <CallFirst />
      <ReadAloud card={c} />
      <Text style={styles.title} accessibilityRole="header">
        {t.cards.steps}
      </Text>
      {c.steps.map((s, i) => (
        <View key={i} style={styles.step} accessible accessibilityLabel={`${t.cards.step(i + 1)}. ${s.text}`} testID={`card-step-${String(i + 1)}`}>
          <Text style={styles.stepNumber}>{i + 1}.</Text>
          <Text style={styles.stepText}>{s.text}</Text>
        </View>
      ))}
      <Citation card={c} />
    </View>
  );
}

/** Compact card for the Ask intercept: title, steps, citation, and a link to the full card. */
function InlineCard({ card }: { card: EmergencyCard }) {
  const t = useMessages();
  const styles = useStyles();
  const router = useRouter();
  const c = localizeCard(card, CARD_DISPLAY_LOCALE);
  return (
    <View style={styles.card} testID={`inline-card-${card.id}`}>
      <Text style={styles.title} accessibilityRole="header">
        {c.title}
      </Text>
      {c.steps.map((s, i) => (
        <View key={i} style={styles.step}>
          <Text style={styles.stepNumber}>{i + 1}.</Text>
          <Text style={styles.stepText}>{s.text}</Text>
        </View>
      ))}
      <Citation card={c} />
      <Pressable
        accessibilityRole="link"
        testID={`open-card-${card.id}`}
        onPress={() => {
          router.push({ pathname: '/card/[id]', params: { id: card.id } });
        }}
      >
        <Text style={styles.link}>{t.cards.open}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Where curated emergency cards render on the Ask screen: right under the emergency number and before
 * Layer 1. Cards come from the intercept topics and the cards' own keywords.
 */
export function EmergencyCardSlot({ question, topics }: { question: string; topics: readonly EmergencyTopic[] }) {
  const cards = cardsForQuestion(question, topics);
  if (cards.length === 0) return null;
  return (
    <View testID="emergency-card-slot" style={{ gap: 8 }}>
      {cards.map((c) => (
        <InlineCard key={c.id} card={c} />
      ))}
    </View>
  );
}

/** Card titles as links (Emergency screen, Tools tab, home search). */
export function CardLinks({ cards }: { cards: readonly EmergencyCard[] }) {
  const styles = useStyles();
  const router = useRouter();
  return (
    <View>
      {cards.map((card) => {
        const c = localizeCard(card, CARD_DISPLAY_LOCALE);
        return (
          <Pressable
            key={card.id}
            accessibilityRole="link"
            accessibilityLabel={c.title}
            testID={`card-link-${card.id}`}
            style={styles.item}
            onPress={() => {
              router.push({ pathname: '/card/[id]', params: { id: card.id } });
            }}
          >
            <Text style={styles.title}>{c.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
