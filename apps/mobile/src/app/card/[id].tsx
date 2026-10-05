import { cardById } from '@skepi/emergency-cards';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text } from 'react-native';
import { CardView, EmergencyNumbers } from '../../components/EmergencyCards';
import { useStyles } from '../../components/ui';
import { useLanguage } from '../../lib/i18n';

/** One emergency card, with the emergency number first. Bundled: works with no pack installed. */
export default function CardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const lang = useLanguage();
  const card = cardById(id);
  if (!card) {
    return <Text style={styles.error}>{id}</Text>;
  }
  return (
    <ScrollView style={styles.fill} contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 48 }} testID="card-screen">
      <Stack.Screen options={{ title: card.locales[lang].title }} />
      <EmergencyNumbers compact />
      <CardView card={card} />
    </ScrollView>
  );
}
