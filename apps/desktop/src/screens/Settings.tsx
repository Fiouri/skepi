import { countryList } from '@skepi/emergency-cards';
import { Banner } from '../components/ui';
import { useMessages } from '../lib/i18n';
import { ipc } from '../lib/ipc';
import { useActiveProfile, useApp, type PowerCap } from '../lib/store';

const CAPS: readonly PowerCap[] = ['full', 'balanced', 'low', 'off'];

export function SettingsScreen() {
  const t = useMessages();
  const s = useApp();
  const { profile, model } = useActiveProfile();
  const gpu = s.device?.gpu;
  return (
    <section className="stack" data-testid="settings-screen">
      <h1>{t.desktop.tabs.settings}</h1>
      {s.device && (
        <p data-testid="device-line">
          {t.desktop.device({ ramGb: (s.device.snapshot.totalRamMb / 1024).toFixed(1), gpu: gpu ? `${gpu.description} (${String(Math.round(gpu.vramMb / 1024))} GB)` : null, tier: profile.effectiveTier })}
        </p>
      )}
      {!gpu && <p className="muted">{t.desktop.noGpu}</p>}
      <p className="mono" data-testid="profile-line">
        {t.bench.profile({
          tier: profile.effectiveTier,
          mode: profile.mode,
          model: model?.id ?? '–',
          threads: profile.load.threads,
          contextSize: profile.load.contextSize,
          budget: profile.budgetTier,
          summary: profile.summaryMode,
          backend: profile.load.gpuLayers > 0 ? 'Vulkan' : 'CPU',
        })}
      </p>

      <label className="check">
        <input
          type="checkbox"
          data-testid="blackout-toggle"
          checked={s.blackout}
          onChange={(e) => {
            s.setBlackout(e.target.checked);
          }}
        />
        {t.desktop.blackout}
      </label>

      <h2>{t.desktop.aiPowerCap}</h2>
      <p className="muted">{t.desktop.aiPowerCapHint}</p>
      {CAPS.map((c) => (
        <label key={c} className="check">
          <input
            type="radio"
            name="power-cap"
            data-testid={`power-cap-${c}`}
            checked={s.powerCap === c}
            onChange={() => {
              s.setPowerCap(c);
            }}
          />
          {t.desktop.powerCap[c]}
        </label>
      ))}

      <h2>{t.emergency.title}</h2>
      <select
        data-testid="country-select"
        value={s.country ?? ''}
        onChange={(e) => {
          useApp.setState({ country: e.target.value || null });
          if (e.target.value) void ipc.settingsSet('region.country', e.target.value);
        }}
      >
        <option value="">112</option>
        {countryList('en').map((c) => (
          <option key={c.country} value={c.country}>
            {c.name}
          </option>
        ))}
      </select>

      <h2>{t.bench.developer}</h2>
      <label className="check">
        <input
          type="checkbox"
          data-testid="t1-toggle"
          checked={s.simulateT1}
          onChange={(e) => {
            s.setSimulateT1(e.target.checked);
          }}
        />
        {t.bench.t1Simulation}
      </label>
      <p className="muted">{t.bench.t1SimulationHint}</p>
      <label className="check">
        <input
          type="checkbox"
          data-testid="greek-toggle"
          checked={s.greekUi}
          onChange={(e) => {
            s.setGreekUi(e.target.checked);
          }}
        />
        {t.bench.greekUi}
      </label>
      <p className="muted">{t.bench.greekUiHint}</p>
      <Banner tone="info">
        <strong>{t.onboarding.disclaimerTitle}</strong>
        {t.onboarding.disclaimerBody.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </Banner>
    </section>
  );
}
