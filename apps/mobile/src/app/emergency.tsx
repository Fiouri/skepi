import { CARDS } from '@skepi/emergency-cards';
import { ScrollView, Text } from 'react-native';
import { CardLinks, EmergencyNumbers } from '../components/EmergencyCards';
import { useStyles } from '../components/ui';
import { useMessages } from '../lib/i18n';

/** One tap from home: the emergency numbers, then every card. */
export default function EmergencyScreen() {
  const t = useMessages();
  const styles = useStyles();
  return (
    <ScrollView style={styles.fill} contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 48 }} testID="emergency-screen">
      <EmergencyNumbers />
      <Text style={styles.title} accessibilityRole="header">
        {t.emergency.cards}
      </Text>
      <CardLinks cards={CARDS} />
    </ScrollView>
  );
}
