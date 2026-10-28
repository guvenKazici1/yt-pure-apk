import React, { useState, useEffect } from 'react';
import { ShieldCheck, Zap, VolumeX, FastForward, Play, CheckCircle2, Sliders } from 'lucide-react';
import { InterceptionEvent, ProtectionRule } from '../types';

interface LiveSimulatorViewProps {
  rules: ProtectionRule[];
  onToggleRule: (id: string) => void;
  events: InterceptionEvent[];
  onSimulateInterception: (scenario: {
    platform: 'YouTube' | 'YT Music';
    ruleName: string;
    targetTitle: string;
    actionTaken: string;
    timeSavedSec: number;
    latencyMs: number;
  }) => void;
}

interface SimScenario {
  id: string;
  title: string;
  platform: 'YouTube' | 'YT Music';
  adTypeLabel: string;
  adDurationSec: number;
  domTarget: string;
  ruleId: string;
  actionSummary: string;
}

const SCENARIOS: SimScenario[] = [
  {
    id: 'sim-1',
    title: 'Reklam Sonrası Ekranda Asılı Kalan "Skip / Atla" Tuşu',
    platform: 'YouTube',
    adTypeLabel: 'Asılı Kalan Skip Butonu',
    adDurationSec: 15,
    domTarget: '.ytp-ad-skip-button-slot button, .ytp-skip-ad-button',
    ruleId: 'rule-linger-skip',
    actionSummary:
      'Görünürlük zorlandı · PointerDown → MouseDown → MouseUp → Click + moviePlayer.skipAd() ile 8ms içinde tıklandı',
  },
  {
    id: 'sim-2',
    title: 'Videoyu Kesmeden Geçilemeyen Reklamı Yok Etme',
    platform: 'YouTube',
    adTypeLabel: 'Sıfır Kesinti Reklam Yok Edici',
    adDurationSec: 30,
    domTarget: '#movie_player.ad-showing video.html5-main-video',
    ruleId: 'rule-16x-speed',
    actionSummary: 'Ana videoda takılma yapmadan reklam akışı son kareye taşındı ve moviePlayer.skipAd() çağrıldı',
  },
  {
    id: 'sim-3',
    title: 'YT Music "Hâlâ Dinliyor Musunuz?" Oturum Duraklatması',
    platform: 'YT Music',
    adTypeLabel: 'Arkaplan Dinleme Kesintisi',
    adDurationSec: 60,
    domTarget: 'ytmusic-you-there-renderer #confirm-button button',
    ruleId: 'rule-ytmusic-nonstop',
    actionSummary: 'Diyalog penceresi otomatik onaylandı ve müzik kesintisiz devam ettirildi',
  },
  {
    id: 'sim-4',
    title: '5 Saniye Geri Sayımlı "Reklamı Geç" Katmanı',
    platform: 'YouTube',
    adTypeLabel: 'Atlanabilir Akış İçi Reklam',
    adDurationSec: 15,
    domTarget: 'button.ytp-ad-skip-button-modern, [aria-label*="Atla" i]',
    ruleId: 'rule-skip-btn',
    actionSummary: '50ms tarayıcı ve MutationObserver butonu yakalayıp anında gerçek fare tıklaması gönderdi',
  },
];

export const LiveSimulatorView: React.FC<LiveSimulatorViewProps> = ({
  rules,
  onToggleRule,
  events,
  onSimulateInterception,
}) => {
  const [activeSimulation, setActiveSimulation] = useState<{
    scenario: SimScenario;
    phase: 'detecting' | 'accelerating' | 'resolved';
    progress: number;
  } | null>(null);

  useEffect(() => {
    if (!activeSimulation) return;

    if (activeSimulation.phase === 'detecting') {
      const t1 = setTimeout(() => {
        setActiveSimulation((prev) => (prev ? { ...prev, phase: 'accelerating', progress: 65 } : null));
      }, 280);
      return () => clearTimeout(t1);
    }

    if (activeSimulation.phase === 'accelerating') {
      const t2 = setTimeout(() => {
        const sc = activeSimulation.scenario;
        onSimulateInterception({
          platform: sc.platform,
          ruleName: sc.adTypeLabel,
          targetTitle: sc.title,
          actionTaken: sc.actionSummary,
          timeSavedSec: sc.adDurationSec,
          latencyMs: 14,
        });
        setActiveSimulation((prev) => (prev ? { ...prev, phase: 'resolved', progress: 100 } : null));
      }, 380);
      return () => clearTimeout(t2);
    }
  }, [activeSimulation, onSimulateInterception]);

  const triggerScenario = (sc: SimScenario) => {
    setActiveSimulation({
      scenario: sc,
      phase: 'detecting',
      progress: 20,
    });
  };

  return (
    <div className="space-y-6">
      {/* Interactive Simulator Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Canlı Reklam Yakalama & Bertaraf Simülatörü
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                YouTube veya YT Music üzerinde karşılaşılan reklam türlerini tetikleyerek kalkanın tepkisini test edin.
              </p>
            </div>
          </div>

          {/* Simulated Player Box */}
          <div className="bg-[#0B0F17] border border-slate-800 rounded-lg p-5 min-h-[210px] flex flex-col justify-between">
            {!activeSimulation ? (
              <div className="my-auto text-center space-y-2 py-6">
                <ShieldCheck className="w-10 h-10 text-emerald-400 mx-auto" />
                <p className="text-sm font-medium text-slate-200">
                  MutationObserver & Video Hızlandırıcı Kalkan Nöbette
                </p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Aşağıdaki 4 gerçek YouTube / YT Music reklam senaryosundan birine tıklayarak arkaplan motorunun
                  reklamı nasıl atladığını canlı görün.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">
                    {activeSimulation.scenario.platform} · {activeSimulation.scenario.title}
                  </span>
                  <span className="font-mono text-emerald-400">
                    {activeSimulation.phase === 'detecting' && 'DOM YAKALANIYOR...'}
                    {activeSimulation.phase === 'accelerating' && '16x HIZLANDIRMA & SESSİZE ALMA...'}
                    {activeSimulation.phase === 'resolved' &&
                      `BERTARAF EDİLDİ (+${activeSimulation.scenario.adDurationSec} sn kazanıldı)`}
                  </span>
                </div>

                <div className="p-3 bg-[#111827] border border-slate-800 rounded font-mono text-xs text-slate-300 space-y-1.5">
                  <div>Hedef Seçici: {activeSimulation.scenario.domTarget}</div>
                  <div className="text-emerald-400">İşlem: {activeSimulation.scenario.actionSummary}</div>
                </div>

                <div className="space-y-1">
                  <div className="h-2 w-full bg-slate-800 rounded overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${activeSimulation.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] font-mono text-slate-400">
                    <span>Tepki Süresi: 14ms</span>
                    <span>Normal Reklam Süresi: {activeSimulation.scenario.adDurationSec} sn → 0.0 sn</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 4 Scenario Trigger Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SCENARIOS.map((sc) => (
              <button
                key={sc.id}
                type="button"
                onClick={() => triggerScenario(sc)}
                className="p-3.5 bg-[#0B0F17] hover:bg-slate-800/70 border border-slate-800 rounded-lg text-left transition-colors cursor-pointer space-y-1"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-rose-400">{sc.platform} Senaryosu</span>
                  <span className="font-mono text-slate-400">+{sc.adDurationSec} sn kazanç</span>
                </div>
                <p className="text-xs font-medium text-slate-100">{sc.title}</p>
                <p className="text-[11px] text-slate-400 truncate">Test Etmek İçin Tıklayın →</p>
              </button>
            ))}
          </div>
        </div>

        {/* Right 5 Cols: Active Protection Rules Configuration */}
        <div className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-100">Aktif Arkaplan Kalkan Kuralları</h2>
            <span className="text-xs font-mono text-slate-400">
              {rules.filter((r) => r.enabled).length}/{rules.length} Aktif
            </span>
          </div>

          <div className="divide-y divide-slate-800/80">
            {rules.map((rule) => (
              <div key={rule.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-100">{rule.name}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{rule.description}</p>
                  <p className="text-[11px] font-mono text-slate-500 mt-1 truncate">{rule.selectorTarget}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleRule(rule.id)}
                  className={`px-3 py-1.5 rounded text-xs font-mono font-medium shrink-0 transition-colors cursor-pointer ${
                    rule.enabled
                      ? 'bg-emerald-950/80 border border-emerald-700/70 text-emerald-300'
                      : 'bg-slate-800 border border-slate-700 text-slate-400'
                  }`}
                >
                  {rule.enabled ? 'AÇIK' : 'KAPALI'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Interception Log Table */}
      <div className="bg-[#111827] border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">
            Yakalanan ve Atlanan Reklam Kayıtları (Canlı Günlük)
          </h3>
          <span className="text-xs font-mono text-slate-400">{events.length} işlem kaydedildi</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-semibold text-slate-400 bg-[#0B0F17]/60">
                <th className="py-2.5 px-4">Saat</th>
                <th className="py-2.5 px-4">Platform</th>
                <th className="py-2.5 px-4">Engellenen Kesinti</th>
                <th className="py-2.5 px-4">Uygulanan Mekanizma</th>
                <th className="py-2.5 px-4 text-right">Tepki Süresi</th>
                <th className="py-2.5 px-4 text-right">Kazanılan Süre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {events.map((ev) => (
                <tr key={ev.id} className="hover:bg-slate-800/30">
                  <td className="py-2.5 px-4 font-mono text-slate-400 whitespace-nowrap">{ev.timestamp}</td>
                  <td className="py-2.5 px-4 font-medium text-slate-200 whitespace-nowrap">{ev.platform}</td>
                  <td className="py-2.5 px-4 text-slate-200">{ev.targetTitle}</td>
                  <td className="py-2.5 px-4 text-slate-400">{ev.actionTaken}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-slate-400 whitespace-nowrap">
                    {ev.latencyMs} ms
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-emerald-400 whitespace-nowrap">
                    +{ev.timeSavedSec} sn
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
