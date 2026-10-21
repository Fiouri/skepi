import { CARD_DISPLAY_LOCALE, cardById } from '@skepi/emergency-cards';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { CardView } from '../../components/EmergencyCards';
import { useStyles } from '../../components/ui';

/** One emergency card ("Call <number> first" heads it). Bundled: works with no pack installed. */
export default function CardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const card = cardById(id);
  if (!card) {
    return <Text style={styles.error}>{id}</Text>;
  }
  return (
    <ScrollView style={styles.fill} contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 48 }} testID="card-screen">
      <Stack.Screen options={{ title: card.labels[CARD_DISPLAY_LOCALE].title }} />
      <CardView card={card} />
    </ScrollView>
  );
}
