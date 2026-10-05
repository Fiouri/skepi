import { compassPoint, formatDecimal, formatDms, osmLink, SOS_TIMELINE } from '@skepi/core';
import { CARDS } from '@skepi/emergency-cards';
import { ExpoEmergencyTools, type GnssFix } from 'expo-emergency-tools';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, PermissionsAndroid, ScrollView, Text, View } from 'react-native';
import { PowerTips } from '../../components/Blackout';
import { CardLinks } from '../../components/EmergencyCards';
import { Button, useStyles } from '../../components/ui';
import { energyTier, useActiveProfile } from '../../lib/content';
import { measureEnergy, startPerMinuteMeasurement, useEnergyCost } from '../../lib/energy';
import { useMessages } from '../../lib/i18n';
import { usePrefs } from '../../lib/prefs';

const KEEP_AWAKE_TAG = 'skepi-sos';
const FIX_TIMEOUT_MS = 180_000;
const FIX_MAX_AGE_MS = 30_000;

type LocationState =
  | { kind: 'idle' }
  | { kind: 'locating'; visible: number; used: number }
  | { kind: 'fix'; fix: GnssFix; declination: number | null }
  | { kind: 'error'; code: 'permission' | 'gps-off' | 'timeout' | 'other'; message: string };

function errorCode(e: unknown): string {
  return typeof e === 'object' && e !== null && 'code' in e && typeof e.code === 'string' ? e.code : '';
}

/** Tools that work with no pack and no network: cards, SOS light, coordinates, compass. */
export default function ToolsScreen() {
  const t = useMessages();
  const styles = useStyles();
  const router = useRouter();
  const blackout = usePrefs((s) => s.blackout);
  const tier = energyTier(useActiveProfile().profile);
  const gpsCost = useEnergyCost('gps-fix', tier);
  const sosCost = useEnergyCost('sos-light-minute', tier);

  // --- SOS torch -----------------------------------------------------------------------------
  const [torchOn, setTorchOn] = useState(false);
  const [torchError, setTorchError] = useState<string | null>(null);
  const torchAvailable = useRef(ExpoEmergencyTools.torchAvailable()).current;
  const stopMeasure = useRef<(() => void) | null>(null);

  const stopTorch = useCallback(() => {
    ExpoEmergencyTools.stopMorse();
    void deactivateKeepAwake(KEEP_AWAKE_TAG);
    stopMeasure.current?.();
    stopMeasure.current = null;
    setTorchOn(false);
  }, []);

  const startTorch = (): void => {
    setTorchError(null);
    try {
      ExpoEmergencyTools.startMorse([...SOS_TIMELINE], true);
      setTorchOn(true);
      void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      void startPerMinuteMeasurement('sos-light-minute', tier).then((stop) => {
        stopMeasure.current = stop;
      });
    } catch (e) {
      setTorchError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    const sub = ExpoEmergencyTools.addListener('onTorchError', (e) => {
      setTorchError(e.message);
      stopTorch();
    });
    return () => {
      sub.remove();
      stopTorch();
    };
  }, [stopTorch]);

  // --- Location (GPS on tap only) --------------------------------------------------------------
  const [location, setLocation] = useState<LocationState>({ kind: 'idle' });
  const [smsError, setSmsError] = useState(false);

  useEffect(() => {
    const sub = ExpoEmergencyTools.addListener('onGnssStatus', (s) => {
      setLocation((prev) => (prev.kind === 'locating' ? { kind: 'locating', visible: s.visible, used: s.used } : prev));
    });
    return () => {
      sub.remove();
      ExpoEmergencyTools.cancelFix();
    };
  }, []);

  const locate = async (): Promise<void> => {
    setSmsError(false);
    if (!ExpoEmergencyTools.locationPermissionGranted()) {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        setLocation({ kind: 'error', code: 'permission', message: t.tools.permissionDenied });
        return;
      }
    }
    setLocation({ kind: 'locating', visible: 0, used: 0 });
    try {
      const fix = await measureEnergy('gps-fix', tier, () => ExpoEmergencyTools.getFix(FIX_TIMEOUT_MS, FIX_MAX_AGE_MS));
      let declination: number | null = null;
      try {
        declination = ExpoEmergencyTools.declination(fix.latitude, fix.longitude, fix.altitudeM ?? 0);
      } catch {
        declination = null;
      }
      setLocation({ kind: 'fix', fix, declination });
    } catch (e) {
      const code = errorCode(e);
      if (code === 'ERR_GNSS_CANCELLED') setLocation({ kind: 'idle' });
      else if (code === 'ERR_GPS_DISABLED') setLocation({ kind: 'error', code: 'gps-off', message: t.tools.gpsOff });
      else if (code === 'ERR_GNSS_TIMEOUT') setLocation({ kind: 'error', code: 'timeout', message: t.tools.timeout });
      else if (code === 'ERR_LOCATION_PERMISSION') setLocation({ kind: 'error', code: 'permission', message: t.tools.permissionDenied });
      else setLocation({ kind: 'error', code: 'other', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const sendSms = (fix: GnssFix): void => {
    const body = t.tools.smsBody({
      decimal: formatDecimal(fix.latitude, fix.longitude),
      dms: formatDms(fix.latitude, fix.longitude),
      accuracy: fix.accuracyM !== null ? fix.accuracyM.toFixed(0) : '?',
      link: osmLink(fix.latitude, fix.longitude),
    });
    // Opens the SMS app with the text filled in; the user picks the recipient and sends. Never automatic.
    Linking.openURL(`sms:?body=${encodeURIComponent(body)}`).catch(() => {
      setSmsError(true);
    });
  };

  // --- Compass ------------------------------------------------------------------------------------
  const compassAvailable = useRef(ExpoEmergencyTools.compassAvailable()).current;
  const [compassOn, setCompassOn] = useState(false);
  const [heading, setHeading] = useState<{ heading: number; accuracy: number } | null>(null);

  useEffect(() => {
    if (!compassOn) return undefined;
    const sub = ExpoEmergencyTools.addListener('onHeading', (e) => {
      setHeading(e);
    });
    ExpoEmergencyTools.startCompass();
    return () => {
      sub.remove();
      ExpoEmergencyTools.stopCompass();
    };
  }, [compassOn]);

  // Leaving the tab stops every sensor: nothing keeps running in the background.
  useFocusEffect(
    useCallback(
      () => () => {
        setCompassOn(false);
        ExpoEmergencyTools.cancelFix();
      },
      [],
    ),
  );

  return (
    <ScrollView style={styles.fill} contentContainerStyle={{ padding: 12, gap: 16, paddingBottom: 48 }} testID="tools-screen">
      {blackout && <PowerTips />}

      <View style={{ gap: 8 }}>
        <Text style={styles.heading} accessibilityRole="header">
          {t.tools.sosTitle}
        </Text>
        <Text style={styles.muted}>{t.tools.sosHint}</Text>
        {torchAvailable ? (
          torchOn ? (
            <Button testID="sos-torch-stop" tone="danger" label={t.tools.torchStop} onPress={stopTorch} />
          ) : (
            <Button testID="sos-torch-start" label={t.tools.torchStart} cost={sosCost} onPress={startTorch} />
          )
        ) : (
          <Text style={styles.muted}>{t.tools.torchUnavailable}</Text>
        )}
        {torchOn && (
          <Text style={styles.ok} testID="sos-torch-running">
            ··· ——— ···
          </Text>
        )}
        {torchError && <Text style={styles.error}>{t.tools.torchError(torchError)}</Text>}
        <View style={styles.row}>
          <Button testID="sos-screen-white" label={t.tools.screenWhite} onPress={() => { stopTorch(); router.push({ pathname: '/sos-screen', params: { color: 'white' } }); }} />
          <Button testID="sos-screen-red" label={t.tools.screenRed} onPress={() => { stopTorch(); router.push({ pathname: '/sos-screen', params: { color: 'red' } }); }} />
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={styles.heading} accessibilityRole="header">
          {t.tools.locationTitle}
        </Text>
        {location.kind === 'locating' ? (
          <>
            <Text style={styles.text} testID="location-locating" accessibilityLiveRegion="polite">
              {t.tools.locating({ visible: location.visible, used: location.used })}
            </Text>
            <Button testID="location-cancel" tone="danger" label={t.tools.cancel} onPress={() => { ExpoEmergencyTools.cancelFix(); }} />
          </>
        ) : (
          <Button testID="location-locate" label={t.tools.locate} cost={gpsCost} onPress={() => void locate()} />
        )}
        {location.kind === 'fix' && (
          <View style={styles.card} testID="location-fix">
            <Text style={styles.muted}>{t.tools.decimal}</Text>
            <Text style={styles.title} selectable testID="location-decimal">
              {formatDecimal(location.fix.latitude, location.fix.longitude)}
            </Text>
            <Text style={styles.muted}>{t.tools.dms}</Text>
            <Text style={styles.title} selectable testID="location-dms">
              {formatDms(location.fix.latitude, location.fix.longitude)}
            </Text>
            {location.fix.accuracyM !== null && <Text style={styles.text}>{t.tools.accuracy(location.fix.accuracyM.toFixed(0))}</Text>}
            <Text style={styles.muted}>{t.tools.age((location.fix.ageMs / 1000).toFixed(0))}</Text>
            <Button testID="location-sms" label={t.tools.sendSms} onPress={() => { sendSms(location.fix); }} />
            {smsError && <Text style={styles.error}>{t.tools.smsUnavailable}</Text>}
          </View>
        )}
        {location.kind === 'error' && (
          <View style={{ gap: 6 }}>
            <Text style={styles.error} testID={`location-error-${location.code}`}>
              {location.message}
            </Text>
            {(location.code === 'gps-off' || location.code === 'permission') && (
              <Button
                testID="location-settings"
                label={t.tools.openSettings}
                onPress={() => {
                  if (location.code === 'gps-off') void Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => undefined);
                  else void Linking.openSettings();
                }}
              />
            )}
          </View>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={styles.heading} accessibilityRole="header">
          {t.tools.compassTitle}
        </Text>
        {!compassAvailable ? (
          <Text style={styles.muted}>{t.tools.compassUnavailable}</Text>
        ) : (
          <>
            <Button
              testID={compassOn ? 'compass-stop' : 'compass-start'}
              label={compassOn ? t.tools.compassStop : t.tools.compassStart}
              onPress={() => {
                setCompassOn((on) => !on);
                setHeading(null);
              }}
            />
            {compassOn && heading && (
              <Text style={styles.heading} testID="compass-heading" accessibilityLiveRegion="polite">
                {t.tools.heading({ degrees: heading.heading.toFixed(0), point: t.tools.points[compassPoint(heading.heading)] })}
              </Text>
            )}
            {compassOn && heading && heading.accuracy <= 1 && <Text style={styles.muted}>{t.tools.compassCalibrate}</Text>}
            {location.kind === 'fix' && location.declination !== null && (
              <Text style={styles.muted}>{t.tools.trueNorth(location.declination.toFixed(1))}</Text>
            )}
          </>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={styles.heading} accessibilityRole="header">
          {t.emergency.cards}
        </Text>
        <CardLinks cards={CARDS} />
      </View>
    </ScrollView>
  );
}
