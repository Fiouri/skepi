import { CARD_DISPLAY_LOCALE, cardById } from '@skepi/emergency-cards';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { CardView, EmergencyNumbers } from '../../components/EmergencyCards';
import { useStyles } from '../../components/ui';

/** One emergency card, with the emergency number first. Bundled: works with no pack installed. */
export default function CardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const card = cardById(id);
  if (!card) {
    return <Text style={styles.error}>{id}</Text>;
  }
  return (
    <ScrollView style={styles.fill} contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 48 }} testID="card-screen">
      <Stack.Screen options={{ title: card.locales[CARD_DISPLAY_LOCALE].title }} />
      <EmergencyNumbers compact />
      <CardView card={card} />
    </ScrollView>
  );
}
