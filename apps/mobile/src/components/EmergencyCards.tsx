import type { EmergencyTopic } from '@skepi/core';
import { View } from 'react-native';

/**
 * Where curated emergency cards render on the Ask screen: right under the emergency number and
 * before Layer 1. The cards themselves (packages/emergency-cards, human-reviewed, bundled) arrive in
 * Phase 1d; until then the slot is an empty, zero-height view that marks the position.
 */
export function EmergencyCardSlot({ topics }: { topics: readonly EmergencyTopic[] }) {
  return <View testID="emergency-card-slot" accessibilityLabel={topics.join(', ')} />;
}
