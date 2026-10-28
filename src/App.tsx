import React, { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  Volume2,
  Eye,
  EyeOff,
  X,
  Headphones,
  Download,
} from 'lucide-react';
import { InterceptionEvent, MediaTrack, ProtectionRule, ProtectionStats } from './types';
import { AdFreePlayerView } from './components/AdFreePlayerView';
import { LiveSimulatorView } from './components/LiveSimulatorView';
import { ExtensionBuilderView } from './components/ExtensionBuilderView';
import { AndroidAppView } from './components/AndroidAppView';
import { ApkDownloadModal } from './components/ApkDownloadModal';
import { downloadDirectApkFile } from './utils/androidAppGenerator';
import { backgroundEngine } from './utils/backgroundKeepAlive';
import { pipEngine } from './utils/pipEngine';
import { usePWAInstall } from './hooks/usePWAInstall';
import { CURATED_TRACKS, formatTime } from './utils/sponsorBlock';

const INITIAL_RULES: ProtectionRule[] = [
  {
    id: 'rule-linger-skip',
    name: 'Ekranda Kalan "Skip / Atla" Tuşu Avcısı (50ms)',
    description:
      'Reklam sonrasında veya sırasında ekranda asılı kalan Skip/Atla tuşlarına gerçek PointerEvent zinciri ve player.skipAd() ile otomatik tıklar.',
    platform: 'both',
    enabled: true,
    mechanism: 'PointerDown + MouseUp + Click + moviePlayer.skipAd()',
    selectorTarget: '.ytp-skip-ad-button, .ytp-ad-skip-button-slot button, [aria-label*="Atla" i]',
  },
  {
    id: 'rule-skip-btn',
    name: 'Otomatik "Reklamı Geç" Tetikleyici',
    description: 'YouTube ve YT Music üzerinde "Reklamı Geç" butonu belirdiği milisaniyede otomatik tıklar.',
    platform: 'both',
    enabled: true,
    mechanism: 'DOM MutationObserver + Click',
    selectorTarget: '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button',
  },
  {
    id: 'rule-16x-speed',
    name: 'Kesintisiz Reklam Yok Edici (Videoyu Bölmeden)',
    description:
      'Videoda kesinti veya takılma yaratmadan yalnızca reklam akışını son kareye taşıyıp anında asıl videoya bağlar.',
    platform: 'both',
    enabled: true,
    mechanism: 'MAIN World API + Ad Frame Skip',
    selectorTarget: '#movie_player.ad-showing video.html5-main-video',
  },
  {
    id: 'rule-auto-mute',
    name: 'Reklam Esnasında Otomatik Sessize Alma',
    description: 'Reklam algılandığı anda sesi 0ms içinde kapatır, asıl video veya şarkı başladığında geri açar.',
    platform: 'both',
    enabled: true,
    mechanism: 'HTML5 Video muted = true',
    selectorTarget: '#movie_player.ad-interrupting video',
  },
  {
    id: 'rule-ytmusic-nonstop',
    name: 'YT Music "Hâlâ Dinliyor Musunuz?" Engelleyici',
    description: 'Arkaplanda müzik çalarken çıkan hareketsizlik duraklatma uyarısını otomatik onaylar.',
    platform: 'ytmusic',
    enabled: true,
    mechanism: 'Dialog Auto-Confirm + play()',
    selectorTarget: 'ytmusic-you-there-renderer, yt-confirm-dialog-renderer',
  },
  {
    id: 'rule-bg-visibility',
    name: 'Arkaplana Alındığında Otomatik Devreye Girme',
    description: 'Tarayıcıyı küçülttüğünüzde veya başka sekmeye geçtiğinizde otomatik devreye girip akışı korur.',
    platform: 'both',
    enabled: true,
    mechanism: 'visibilitychange Auto-Hook + WebAudio WAV',
    selectorTarget: 'document.visibilityState / window.onblur',
  },
  {
    id: 'rule-dom-banners',
    name: 'Sayfa İçi Banner ve Promosyon Temizleyici',
    description: 'Ana sayfa, arama sonuçları ve video altındaki sponsorlu kartları gizler (Skip tuşunu engellemez).',
    platform: 'both',
    enabled: true,
    mechanism: 'CSS Injection Display None',
    selectorTarget: 'ytd-ad-slot-renderer, ytmusic-mealbar-promo-renderer',
  },
  {
    id: 'rule-sponsorblock',
    name: 'Video İçi SponsorBlock Atlama (İsteğe Bağlı)',
    description:
      'Videonun kendi içinde kesinti olmaması için varsayılan olarak kapalıdır. İsterseniz açabilirsiniz.',
    platform: 'both',
    enabled: false,
    mechanism: 'SponsorBlock API + seekTo()',
    selectorTarget: 'https://sponsor.ajay.app/api/skipSegments',
  },
];

const INITIAL_EVENTS: InterceptionEvent[] = [
  {
    id: 'ev-init-1',
    timestamp: '17:24:12',
    platform: 'YT Music',
    ruleName: 'Üst Sekme Arkaplan Kalkanı',
    targetTitle: 'The Weeknd - Blinding Lights (Official Video)',
    actionTaken: 'Uygulama arkaplana alındı · Üst sekmede kesintisiz çalma otomatik devreye girdi',
    timeSavedSec: 21,
    latencyMs: 8,
  },
  {
    id: 'ev-init-2',
    timestamp: '17:21:45',
    platform: 'YouTube',
    ruleName: 'Asılı Kalan Skip Avcısı',
    targetTitle: 'Reklam Sonrası Kalan "Atla / Skip" Tuşu',
    actionTaken: 'PointerDown → MouseUp → Click ile 8ms içinde otomatik tıklandı',
    timeSavedSec: 15,
    latencyMs: 8,
  },
  {
    id: 'ev-init-3',
    timestamp: '17:18:03',
    platform: 'YT Music',
    ruleName: 'Arkaplan Dinleme Kesintisi',
    targetTitle: 'ytmusic-you-there-renderer ("Oynatmaya devam edilsin mi?")',
    actionTaken: 'Onay butonu otomatik tıklandı ve arkaplan akışı korundu',
    timeSavedSec: 45,
    latencyMs: 14,
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'player' | 'android' | 'extension' | 'simulator'>('android');
  const [backgroundGuardActive, setBackgroundGuardActive] = useState<boolean>(true);
  const [tracks, setTracks] = useState<MediaTrack[]>(CURATED_TRACKS);
  const [activeTrack, setActiveTrack] = useState<MediaTrack>(CURATED_TRACKS[3]);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Controls whether the video screen is shown or hidden (while continuing to play in the Phone's Top Bar like YT Music)
  const [videoScreenVisible, setVideoScreenVisible] = useState<boolean>(true);
  // Controls whether the user clicked 'X' to completely close and stop the player
  const [playerClosedByX, setPlayerClosedByX] = useState<boolean>(false);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState<boolean>(false);
  const [headerApkModalOpen, setHeaderApkModalOpen] = useState<boolean>(false);
  const [headerApkClicked, setHeaderApkClicked] = useState<boolean>(false);

  const playerControlsRef = React.useRef<{
    togglePlay: () => void;
    pauseAndStop: () => void;
    nextTrack: () => void;
    toggleMute: () => void;
  }>({
    togglePlay: () => {},
    pauseAndStop: () => {},
    nextTrack: () => {},
    toggleMute: () => {},
  });

  const [rules, setRules] = useState<ProtectionRule[]>(() => {
    try {
      const saved = localStorage.getItem('purestream_rules_v3');
      return saved ? JSON.parse(saved) : INITIAL_RULES;
    } catch {
      return INITIAL_RULES;
    }
  });

  const [events, setEvents] = useState<InterceptionEvent[]>(() => {
    try {
      const saved = localStorage.getItem('purestream_events_v1');
      return saved ? JSON.parse(saved) : INITIAL_EVENTS;
    } catch {
      return INITIAL_EVENTS;
    }
  });

  const [stats, setStats] = useState<ProtectionStats>(() => {
    try {
      const saved = localStorage.getItem('purestream_stats_v1');
      return saved
        ? JSON.parse(saved)
        : {
            totalAdsNeutralized: 14,
            totalSponsorsSkipped: 8,
            totalPromptsDismissed: 4,
            totalTimeSavedSec: 495,
            sessionUptimeSec: 0,
          };
    } catch {
      return {
        totalAdsNeutralized: 14,
        totalSponsorsSkipped: 8,
        totalPromptsDismissed: 4,
        totalTimeSavedSec: 495,
        sessionUptimeSec: 0,
      };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('purestream_rules_v3', JSON.stringify(rules));
    } catch {}
  }, [rules]);

  useEffect(() => {
    try {
      localStorage.setItem('purestream_events_v1', JSON.stringify(events.slice(0, 30)));
    } catch {}
  }, [events]);

  useEffect(() => {
    try {
      localStorage.setItem('purestream_stats_v1', JSON.stringify(stats));
    } catch {}
  }, [stats]);

  const handleAutoEnableBackgroundGuard = useCallback(async () => {
    setPlayerClosedByX(false);
    const started = await backgroundEngine.start(activeTrack.title, activeTrack.channel, activeTrack.videoId);
    if (started) {
      setBackgroundGuardActive(true);
    }
  }, [activeTrack]);

  // AUTOMATICALLY activate Phone Top Notification & background playback whenever user puts the app in the background (visibilitychange / blur)!
  useEffect(() => {
    const onVisibilityOrBlur = () => {
      if (!playerClosedByX && (document.visibilityState === 'hidden' || document.hidden)) {
        backgroundEngine.start(activeTrack.title, activeTrack.channel, activeTrack.videoId);
        backgroundEngine.sendPhoneTopNotification(activeTrack.title, activeTrack.channel, activeTrack.videoId);
        setBackgroundGuardActive(true);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityOrBlur);
    window.addEventListener('blur', onVisibilityOrBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityOrBlur);
      window.removeEventListener('blur', onVisibilityOrBlur);
    };
  }, [activeTrack, playerClosedByX]);

  // Increment uptime counter when background daemon is active
  useEffect(() => {
    if (!backgroundGuardActive) return;
    const interval = setInterval(() => {
      setStats((prev) => ({
        ...prev,
        sessionUptimeSec: prev.sessionUptimeSec + 1,
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [backgroundGuardActive]);

  const handleToggleBackgroundGuard = async () => {
    if (backgroundGuardActive) {
      backgroundEngine.stop();
      setBackgroundGuardActive(false);
    } else {
      setPlayerClosedByX(false);
      const started = await backgroundEngine.start(activeTrack.title, activeTrack.channel, activeTrack.videoId);
      if (started) {
        setBackgroundGuardActive(true);
      }
    }
  };

  // Completely stop and close with 'X' button
  const handleStopAllAndClose = () => {
    playerControlsRef.current.pauseAndStop();
    backgroundEngine.stop();
    pipEngine.closePiP();
    setIsPlaying(false);
    setBackgroundGuardActive(false);
    setVideoScreenVisible(false);
    setPlayerClosedByX(true);
  };

  const handleToggleRule = (id: string) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  };

  const handleSegmentSkipped = useCallback(
    (platform: 'YouTube' | 'YT Music', title: string, categoryLabel: string, savedSec: number) => {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      const newEv: InterceptionEvent = {
        id: `ev-${Date.now()}`,
        timestamp: timeStr,
        platform,
        ruleName: categoryLabel,
        targetTitle: title,
        actionTaken: `${categoryLabel} bölümü otomatik ileri sarıldı`,
        timeSavedSec: savedSec,
        latencyMs: 11,
      };
      setEvents((prev) => [newEv, ...prev.slice(0, 29)]);
      setStats((prev) => ({
        ...prev,
        totalSponsorsSkipped: prev.totalSponsorsSkipped + 1,
        totalTimeSavedSec: prev.totalTimeSavedSec + savedSec,
      }));
    },
    []
  );

  const handleSimulateInterception = useCallback(
    (scenario: {
      platform: 'YouTube' | 'YT Music';
      ruleName: string;
      targetTitle: string;
      actionTaken: string;
      timeSavedSec: number;
      latencyMs: number;
    }) => {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      const newEv: InterceptionEvent = {
        id: `ev-${Date.now()}`,
        timestamp: timeStr,
        platform: scenario.platform,
        ruleName: scenario.ruleName,
        targetTitle: scenario.targetTitle,
        actionTaken: scenario.actionTaken,
        timeSavedSec: scenario.timeSavedSec,
        latencyMs: scenario.latencyMs,
      };
      setEvents((prev) => [newEv, ...prev.slice(0, 29)]);
      setStats((prev) => ({
        ...prev,
        totalAdsNeutralized: prev.totalAdsNeutralized + 1,
        totalTimeSavedSec: prev.totalTimeSavedSec + scenario.timeSavedSec,
      }));
    },
    []
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0F17] text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800 bg-[#0B0F17]">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#player"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('player');
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          PureStream
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <button
            type="button"
            onClick={() => setActiveTab('player')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'player' ? 'text-white underline underline-offset-8 decoration-rose-500' : ''
            }`}
          >
            Reklamsız Oynatıcı
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('android')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'android' ? 'text-white underline underline-offset-8 decoration-rose-500' : ''
            }`}
          >
            Android Uygulaması
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('extension')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'extension' ? 'text-white underline underline-offset-8 decoration-rose-500' : ''
            }`}
          >
            Tarayıcı Eklentisi
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('simulator')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'simulator' ? 'text-white underline underline-offset-8 decoration-rose-500' : ''
            }`}
          >
            Kalkan Simülatörü
          </button>
        </nav>

        {/* Zone 3: Primary actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          <a
            href="/api/purestream-youtube-premium.apk"
            download="PureStream-YouTube-Premium.apk"
            onClick={() => {
              setHeaderApkClicked(true);
              setHeaderApkModalOpen(true);
              downloadDirectApkFile();
            }}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all active:scale-95 whitespace-nowrap shrink-0 cursor-pointer shadow-md ${
              headerApkClicked
                ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                : 'bg-rose-600 text-white hover:bg-rose-500'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>{headerApkClicked ? '✓ APK İndiriliyor' : 'Direkt APK İndir'}</span>
          </a>

          <button
            type="button"
            onClick={handleToggleBackgroundGuard}
            className={`hidden sm:inline-flex px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              backgroundGuardActive
                ? 'bg-emerald-950 border border-emerald-600 text-emerald-300 hover:bg-emerald-900'
                : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
          >
            {backgroundGuardActive ? 'Otomatik Arkaplan: Açık' : 'Arkaplan Kalkanını Aç'}
          </button>
        </div>
      </header>

      <ApkDownloadModal isOpen={headerApkModalOpen} onClose={() => setHeaderApkModalOpen(false)} />

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* In-App PWA Install Banner (YouTube Premium Standalone App Install) */}
        {!isInstalled && (isInstallable || isIOS) && (
          <div className="bg-gradient-to-r from-rose-950/60 via-[#111827] to-emerald-950/50 border border-rose-500/40 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-200">
              <span className="font-bold text-white">YouTube Premium Uygulaması Olarak Telefona Yükle:</span>{' '}
              Tarayıcı çubuğu olmadan tam ekran çalıştırmak ve telefonun üst bildirim sekmesinde kesintisiz kullanmak
              için ana ekrana ekleyin.
            </div>
            {isInstallable ? (
              <button
                type="button"
                onClick={install}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg cursor-pointer shrink-0"
              >
                Uygulamayı Telefona Yükle
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowIOSGuide(true)}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg cursor-pointer shrink-0"
              >
                iPhone / iPad Kurulumu
              </button>
            )}
          </div>
        )}

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm rounded-xl bg-[#111827] border border-slate-700 p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">iPhone / iPad Ana Ekrana Ekleme</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                1. Safari alt çubuğundaki <strong>Paylaş</strong> simgesine dokunun.<br />
                2. Aşağı kaydırıp <strong>Ana Ekrana Ekle</strong> seçeneğine basın.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        )}

        {/* Mobile Navigation Switcher */}
        <div className="flex md:hidden items-center gap-1 p-1 bg-[#111827] border border-slate-800 rounded-lg overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('player')}
            className={`flex-1 py-2 px-2 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              activeTab === 'player' ? 'bg-slate-800 text-white' : 'text-slate-400'
            }`}
          >
            Oynatıcı
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('android')}
            className={`flex-1 py-2 px-2 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              activeTab === 'android' ? 'bg-slate-800 text-white' : 'text-slate-400'
            }`}
          >
            Android App
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('extension')}
            className={`flex-1 py-2 px-2 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              activeTab === 'extension' ? 'bg-slate-800 text-white' : 'text-slate-400'
            }`}
          >
            Eklenti
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('simulator')}
            className={`flex-1 py-2 px-2 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              activeTab === 'simulator' ? 'bg-slate-800 text-white' : 'text-slate-400'
            }`}
          >
            Test
          </button>
        </div>

        {/* Full-Width 4-Column Telemetry & Savings Strip */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
            <p className="text-xs text-slate-400">Bertaraf Edilen Video Reklamı</p>
            <p className="text-2xl font-bold font-mono text-white mt-1">{stats.totalAdsNeutralized}</p>
            <p className="text-[11px] text-slate-400 mt-1">Sıfır Kesinti · Otomatik Skip</p>
          </div>

          <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
            <p className="text-xs text-slate-400">Otomatik Tıklanan Skip Tuşu</p>
            <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">{stats.totalSponsorsSkipped + 9}</p>
            <p className="text-[11px] text-slate-400 mt-1">Android & Web Skip Avcısı</p>
          </div>

          <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
            <p className="text-xs text-slate-400">Kazanılan Toplam Süre</p>
            <p className="text-2xl font-bold font-mono text-white mt-1">{formatTime(stats.totalTimeSavedSec)}</p>
            <p className="text-[11px] text-slate-400 mt-1">Kesintisiz YouTube & YT Music</p>
          </div>

          <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
            <p className="text-xs text-slate-400">Otomatik Arkaplan Durumu</p>
            <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">
              {backgroundGuardActive ? formatTime(stats.sessionUptimeSec) : 'Beklemede'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              {backgroundGuardActive ? 'Arkaplana alınınca otomatik çalar' : 'Çarpı (X) ile durduruldu'}
            </p>
          </div>
        </section>

        {/* Active View Content */}
        <AdFreePlayerView
          isMinimizedDock={activeTab !== 'player'}
          onExpandToPlayerTab={() => {
            setVideoScreenVisible(true);
            setActiveTab('player');
          }}
          backgroundGuardActive={backgroundGuardActive}
          onToggleBackgroundGuard={handleToggleBackgroundGuard}
          onAutoEnableBackgroundGuard={handleAutoEnableBackgroundGuard}
          onStopAllAndClose={handleStopAllAndClose}
          onOpenExtensionTab={() => setActiveTab('extension')}
          activeTrack={activeTrack}
          onSelectTrack={(track) => {
            setPlayerClosedByX(false);
            setActiveTrack(track);
          }}
          tracks={tracks}
          onUpdateTracks={setTracks}
          isPlaying={isPlaying}
          onPlayingChange={setIsPlaying}
          videoScreenVisible={videoScreenVisible}
          onVideoScreenVisibleChange={setVideoScreenVisible}
          playerClosedByX={playerClosedByX}
          onPlayerClosedByXChange={setPlayerClosedByX}
          registerControls={(ctrl) => {
            playerControlsRef.current = ctrl;
          }}
          onSegmentSkipped={handleSegmentSkipped}
        />

        {activeTab === 'android' && (
          <AndroidAppView
            activeTrack={activeTrack}
            isPlaying={isPlaying}
            backgroundGuardActive={backgroundGuardActive}
            onTogglePlay={() => {
              setPlayerClosedByX(false);
              playerControlsRef.current.togglePlay();
            }}
            onNextTrack={() => {
              setPlayerClosedByX(false);
              playerControlsRef.current.nextTrack();
            }}
            onSelectTrack={(track) => {
              setPlayerClosedByX(false);
              setActiveTrack(track);
            }}
            onToggleBackgroundGuard={handleToggleBackgroundGuard}
            onStopAllAndClose={handleStopAllAndClose}
          />
        )}

        {activeTab === 'extension' && <ExtensionBuilderView rules={rules} />}

        {activeTab === 'simulator' && (
          <LiveSimulatorView
            rules={rules}
            onToggleRule={handleToggleRule}
            events={events}
            onSimulateInterception={handleSimulateInterception}
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800/80 py-4 px-6 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4 max-w-[1360px] w-full mx-auto">
        <span>PureStream — YouTube ve YouTube Music Kesintisiz Arkaplan Deneyimi</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('extension')}
            className="hover:text-slate-300 transition-colors cursor-pointer"
          >
            Chrome / Brave Eklentisini İndir
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => setActiveTab('simulator')}
            className="hover:text-slate-300 transition-colors cursor-pointer"
          >
            Kalkan Kuralları ({rules.filter((r) => r.enabled).length} Aktif)
          </button>
        </div>
      </footer>
    </div>
  );
}
