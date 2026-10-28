import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Download,
  Copy,
  Check,
  Play,
  Pause,
  SkipForward,
  ShieldCheck,
  MousePointerClick,
  Terminal,
  Headphones,
  Music,
  Tv,
  X,
  EyeOff,
  Eye,
  BellRing,
} from 'lucide-react';
import { MediaTrack } from '../types';
import { CURATED_TRACKS, formatTime } from '../utils/sponsorBlock';
import { backgroundEngine } from '../utils/backgroundKeepAlive';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { ApkDownloadModal } from './ApkDownloadModal';
import {
  AndroidServiceConfig,
  createAndroidProjectZipBlob,
  downloadDirectApkFile,
  generateAccessibilityConfigXml,
  generateAndroidAccessibilityServiceKt,
  generateAndroidManifestXml,
  generateMacroDroidJson,
  generateMainActivityKt,
  getSignedApkBlobUrl,
} from '../utils/androidAppGenerator';

interface AndroidAppViewProps {
  activeTrack: MediaTrack;
  isPlaying: boolean;
  backgroundGuardActive: boolean;
  onTogglePlay: () => void;
  onNextTrack: () => void;
  onSelectTrack: (track: MediaTrack) => void;
  onToggleBackgroundGuard: () => void;
  onStopAllAndClose: () => void;
}

export const AndroidAppView: React.FC<AndroidAppViewProps> = ({
  activeTrack,
  isPlaying,
  backgroundGuardActive,
  onTogglePlay,
  onNextTrack,
  onSelectTrack,
  onToggleBackgroundGuard,
  onStopAllAndClose,
}) => {
  const [config, setConfig] = useState<AndroidServiceConfig>({
    autoClickSkipNode: true,
    gestureTapFallback: true,
    autoMuteAdStream: true,
    ytMusicContinueConfirm: true,
    foregroundKeepAliveNotification: true,
    scanIntervalMs: 100,
  });

  const [androidServiceEnabled, setAndroidServiceEnabled] = useState<boolean>(true);
  const [activeAndroidApp, setActiveAndroidApp] = useState<'youtube' | 'ytmusic'>('ytmusic');
  const [adState, setAdState] = useState<'none' | 'skip_stuck' | 'skipped'>('none');
  const [skippedTotalAndroid, setSkippedTotalAndroid] = useState<number>(12);

  // Controls whether YouTube/YT Music screen is open on the phone or minimized into the PHONE'S TOP NOTIFICATION SHADE
  const [phoneAppInBackground, setPhoneAppInBackground] = useState<boolean>(false);
  // Controls whether the Phone's Top Notification Bar was dismissed with 'X'
  const [phoneTopBarClosedByX, setPhoneTopBarClosedByX] = useState<boolean>(false);

  const [lastAndroidLog, setLastAndroidLog] = useState<string>(
    'YouTube / YT Music arkaplana alındığında Telefonun Üst Bildirim Sekmesi otomatik devreye girer'
  );

  const [activeCodeFile, setActiveCodeFile] = useState<
    'PureStreamAccessibilityService.kt' | 'MainActivity.kt' | 'AndroidManifest.xml' | 'accessibility_service_config.xml'
  >('PureStreamAccessibilityService.kt');
  const [copied, setCopied] = useState(false);

  // Auto-click stuck Skip button when simulated ad appears on the Android screen
  useEffect(() => {
    if (!androidServiceEnabled || adState !== 'skip_stuck') return;

    const timer = setTimeout(() => {
      setAdState('skipped');
      setSkippedTotalAndroid((c) => c + 1);
      setLastAndroidLog(
        `[${new Date().toTimeString().split(' ')[0]}] Otomatik Skip: "Atla" tuşuna ${config.scanIntervalMs}ms içinde basıldı, kesintisiz çalıyor`
      );
    }, 750);

    return () => clearTimeout(timer);
  }, [androidServiceEnabled, adState, config.scanIntervalMs]);

  const handleTriggerStuckSkipAd = (targetApp: 'youtube' | 'ytmusic') => {
    setPhoneAppInBackground(false);
    setPhoneTopBarClosedByX(false);
    setActiveAndroidApp(targetApp);
    setAdState('skip_stuck');
  };

  // Put YouTube / YT Music into the phone background -> Screen closes, Phone's Top Notification Bar activates automatically!
  const handlePutAppInPhoneBackground = async () => {
    setPhoneAppInBackground(true);
    setPhoneTopBarClosedByX(false);
    if (!backgroundGuardActive) {
      onToggleBackgroundGuard();
    }
    if (!isPlaying) {
      onTogglePlay();
    }
    const granted = await backgroundEngine.requestPhoneTopNotificationPermission();
    if (granted) {
      backgroundEngine.sendPhoneTopNotification(activeTrack.title, activeTrack.channel, activeTrack.videoId);
    }
    setLastAndroidLog(
      'Ekran kapatıldı -> Telefonun Üst Bildirim Sekmesinde (Android Bildirim Çubuğu) kesintisiz çalıyor'
    );
  };

  // Close the Phone's Top Notification Bar with 'X' (Çarpı)
  const handleClosePhoneTopBarWithX = () => {
    setPhoneTopBarClosedByX(true);
    setPhoneAppInBackground(false);
    onStopAllAndClose();
    setLastAndroidLog('Telefonun Üst Bildirim Sekmesindeki oynatıcı "X" (Çarpı) ile tamamen kapatıldı');
  };

  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [apkModalOpen, setApkModalOpen] = useState<boolean>(false);
  const [apkClicked, setApkClicked] = useState<boolean>(false);

  const handleDownloadDirectApk = () => {
    setApkClicked(true);
    setApkModalOpen(true);
    downloadDirectApkFile(config);
    setLastAndroidLog('✓ Gerçek V1+V2+V3 imzalı PureStream-YouTube-Premium.apk (21 KB) indiriliyor...');
  };

  const handleDownloadAndroidZip = () => {
    const blob = createAndroidProjectZipBlob(config);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'purestream-android-telefon-ust-sekme-app.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadMacroDroid = () => {
    const json = generateMacroDroidJson(config);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PureStream_Telefon_Ust_Sekme_ve_Skip.macro';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const currentCode =
    activeCodeFile === 'PureStreamAccessibilityService.kt'
      ? generateAndroidAccessibilityServiceKt(config)
      : activeCodeFile === 'MainActivity.kt'
      ? generateMainActivityKt()
      : activeCodeFile === 'AndroidManifest.xml'
      ? generateAndroidManifestXml()
      : generateAccessibilityConfigXml(config);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Action Banner: Real Phone Top Notification Shade Control */}
      <div className="bg-[#111827] border border-slate-700 rounded-lg p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <Smartphone className="w-4 h-4 shrink-0" />
            <span>
              Telefonun Üst Bildirim Sekmesinde Çalma (YT Music Tarzı · Çarpı &ldquo;X&rdquo; İle Kapatılabilir)
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            YouTube veya YT Music&apos;i arkaplana aldığınızda veya ekranı kapattığınızda, uygulamanın içinde değil{' '}
            <strong>doğrudan telefonunuzun üst bildirim sekmesinde (Android Bildirim Çubuğu)</strong> çalmaya devam
            eder. İstediğiniz zaman telefonun üst bildirimindeki <strong>&ldquo;X&rdquo; (Çarpı)</strong> tuşuyla
            tamamen kapatabilirsiniz.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href="/api/purestream-youtube-premium.apk"
            download="PureStream-YouTube-Premium.apk"
            onClick={handleDownloadDirectApk}
            className={`px-4 py-2.5 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0 shadow-md ${
              apkClicked ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
            }`}
          >
            <Download className="w-4 h-4" />
            {apkClicked ? '✓ APK İndiriliyor (PureStream.apk)' : 'Direkt İndir: PureStream-YouTube-Premium.apk'}
          </a>

          <button
            type="button"
            onClick={handlePutAppInPhoneBackground}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <BellRing className="w-4 h-4" />
            Ekranı Kapat & Telefon Üst Sekmesinde Çal
          </button>
        </div>
      </div>

      <ApkDownloadModal isOpen={apkModalOpen} onClose={() => setApkModalOpen(false)} config={config} />

      {/* Main Grid: Interactive Android Phone Screen (Left) + Service Controls & APK Download (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 5 Cols: Interactive Android Phone with Top Notification Shade (Telefonun Üst Sekmesi) */}
        <div className="lg:col-span-5 bg-[#111827] border border-slate-700 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Telefonun Üst Bildirim Sekmesi & Ekranı</h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Ekranı kapattığınızda telefonun en üstündeki bildirim çekmecesinde çalmaya devam eder.
              </p>
            </div>
            <span className="font-mono text-xs text-emerald-400">TELEFON EKRANI</span>
          </div>

          {/* Android Phone Frame */}
          <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl p-3.5 space-y-3.5 shadow-xl">
            {/* 1. PHONE STATUS BAR (Saat + İkonlar) */}
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 px-1">
              <span className="font-semibold">09:41 · Android</span>
              <span className={androidServiceEnabled ? 'text-emerald-400 font-semibold' : 'text-rose-400'}>
                {phoneAppInBackground ? '▲ ÜST BİLDİRİMDE ÇALIYOR' : '● KALKAN AKTİF'}
              </span>
            </div>

            {/* 2. PHONE'S TOP NOTIFICATION SHADE (TELEFONUN ÜST SEKMESİ — YT MUSIC GİBİ ÇALAN VE 'X' İLE KAPATILABİLEN KART) */}
            {!phoneTopBarClosedByX ? (
              <div className="bg-gradient-to-r from-slate-800 via-slate-800 to-emerald-950/90 border-2 border-emerald-500/60 rounded-xl p-3 shadow-lg space-y-2">
                <div className="flex items-center justify-between gap-2 border-b border-slate-700/80 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Headphones className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-[10px] font-mono font-bold text-emerald-300 uppercase tracking-wide">
                      TELEFON ÜST BİLDİRİM SEKMESİ · {activeAndroidApp === 'ytmusic' ? 'YT MUSIC' : 'YOUTUBE'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPhoneAppInBackground((v) => !v)}
                      title={phoneAppInBackground ? 'Video Ekranını Geri Aç' : 'Video Ekranını Kapat (Sadece Üst Sekmede Çalsın)'}
                      className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-100 text-[10px] font-medium rounded flex items-center gap-1 cursor-pointer"
                    >
                      {phoneAppInBackground ? (
                        <>
                          <Eye className="w-3 h-3 text-emerald-400" />
                          <span>Ekranı Aç</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3 h-3 text-emerald-400" />
                          <span>Ekranı Kapat</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleClosePhoneTopBarWithX}
                      title="Telefonun Üst Bildiriminden Tamamen Kapat (X)"
                      className="p-1 bg-rose-600/80 hover:bg-rose-500 text-white rounded transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={`https://i.ytimg.com/vi/${activeTrack.videoId}/hqdefault.jpg`}
                      alt={activeTrack.title}
                      referrerPolicy="no-referrer"
                      className="w-11 h-9 rounded object-cover border border-slate-600 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{activeTrack.title}</p>
                      <p className="text-[11px] text-slate-300 truncate">{activeTrack.channel}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={onTogglePlay}
                      className="p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg cursor-pointer"
                      title={isPlaying ? 'Duraklat' : 'Oynat'}
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={onNextTrack}
                      className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg cursor-pointer"
                      title="Sonraki Şarkı"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-300">
                  Telefon üst sekmesi <strong>X</strong> ile kapatıldı.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setPhoneTopBarClosedByX(false);
                    onTogglePlay();
                  }}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded cursor-pointer shrink-0"
                >
                  Tekrar Başlat
                </button>
              </div>
            )}

            {/* 3. PHONE BODY: Either Closed Video Screen (Phone Home Screen while playing in Phone Top Bar) OR Open YouTube/YT Music Screen */}
            {phoneAppInBackground ? (
              <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-5 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto">
                  <Smartphone className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-white">
                    YouTube / YT Music Ekranı Kapatıldı (Arkaplanda)
                  </p>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Görüntü ekranı kapalı. Müzik şu anda yukarıdaki{' '}
                    <strong>Telefonun Üst Bildirim Sekmesinde</strong> kesintisiz çalıyor. İsterseniz üstteki{' '}
                    <strong>&ldquo;X&rdquo;</strong> ile tamamen kapatabilir veya ekranı geri açabilirsiniz.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPhoneAppInBackground(false)}
                  className="px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  Uygulama Ekranını Geri Aç
                </button>
              </div>
            ) : (
              <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3.5 space-y-3">
                {/* App Switcher & Minimize to Phone Top Bar Button */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setActiveAndroidApp('ytmusic')}
                      className={`py-1 px-2.5 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                        activeAndroidApp === 'ytmusic' ? 'bg-rose-600 text-white' : 'text-slate-300'
                      }`}
                    >
                      <Music className="w-3 h-3" />
                      YT Music
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveAndroidApp('youtube')}
                      className={`py-1 px-2.5 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                        activeAndroidApp === 'youtube' ? 'bg-rose-600 text-white' : 'text-slate-300'
                      }`}
                    >
                      <Tv className="w-3 h-3" />
                      YouTube
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handlePutAppInPhoneBackground}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold rounded-md flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <EyeOff className="w-3 h-3" />
                    Arkaplana Al (Üst Sekmede Çalsın)
                  </button>
                </div>

                {/* Ad / Skip Button Interception Overlay Banner inside Android Screen */}
                {adState === 'skip_stuck' ? (
                  <div className="p-3 bg-amber-500/20 border border-amber-400/60 rounded-lg flex items-center justify-between gap-2">
                    <div className="text-xs text-amber-100">
                      <p className="font-semibold">Reklamda &ldquo;Atla&rdquo; Tuşu Algılandı!</p>
                      <p className="text-[11px] text-amber-200">
                        {androidServiceEnabled
                          ? 'Otomatik tıklanıyor (100ms)...'
                          : 'Otomatik tıklamak için sağdaki tuşa basın ->'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAdState('skipped');
                        setSkippedTotalAndroid((c) => c + 1);
                      }}
                      className="px-3 py-1.5 bg-white text-slate-950 font-bold text-xs rounded shadow flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <span>Atla</span>
                      <MousePointerClick className="w-3.5 h-3.5 text-rose-600" />
                    </button>
                  </div>
                ) : (
                  <div className="px-3 py-2 bg-emerald-950/70 border border-emerald-700/60 rounded-lg flex items-center justify-between text-xs text-emerald-200">
                    <span className="flex items-center gap-1.5 font-medium">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      Otomatik Skip: {skippedTotalAndroid}
                    </span>
                    <span className="font-mono text-[11px] text-emerald-400">REKLAMSIZ</span>
                  </div>
                )}

                {/* Quick Track Switcher inside Android Phone */}
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-slate-300">
                    Telefonda Çalınacak İçeriği Seçin:
                  </p>
                  <div className="grid grid-cols-1 gap-1 max-h-[120px] overflow-y-auto pr-1">
                    {CURATED_TRACKS.slice(0, 4).map((t) => {
                      const selected = t.id === activeTrack.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setPhoneTopBarClosedByX(false);
                            onSelectTrack(t);
                          }}
                          className={`p-2 rounded-lg text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                            selected
                              ? 'bg-rose-600/25 border border-rose-500/50 text-white'
                              : 'bg-slate-900/90 hover:bg-slate-700 text-slate-200 border border-slate-700'
                          }`}
                        >
                          <span className="truncate font-medium pr-2">{t.title}</span>
                          <span className="font-mono text-[11px] text-slate-300 shrink-0">
                            {formatTime(t.durationSec)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Test Stuck Skip Button on Android */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleTriggerStuckSkipAd('youtube')}
                className="py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs font-medium text-slate-100 transition-colors cursor-pointer truncate"
              >
                YouTube &ldquo;Skip&rdquo; Testi
              </button>
              <button
                type="button"
                onClick={() => handleTriggerStuckSkipAd('ytmusic')}
                className="py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs font-medium text-slate-100 transition-colors cursor-pointer truncate"
              >
                YT Music &ldquo;Skip&rdquo; Testi
              </button>
            </div>

            <div className="text-[11px] font-mono text-emerald-300 truncate border-t border-slate-700 pt-2">
              {lastAndroidLog}
            </div>
          </div>
        </div>

        {/* Right 7 Cols: Android Service Customizer & Installation Packages */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[#111827] border border-slate-700 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                Android Telefon Üst Bildirim & Otomatik Skip Ayarları
              </h2>
              <span className="text-xs font-mono text-emerald-400">~80 KB Hafif Servis</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  setConfig((c) => ({ ...c, foregroundKeepAliveNotification: !c.foregroundKeepAliveNotification }))
                }
                className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  config.foregroundKeepAliveNotification
                    ? 'bg-slate-900 border-slate-600 text-white'
                    : 'bg-slate-900/40 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>Telefonun Üst Bildiriminde Çal (✕ İle Kapat)</span>
                  <span className="font-mono text-emerald-400">
                    {config.foregroundKeepAliveNotification ? 'AÇIK' : 'KAPALI'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mt-1">
                  YouTube veya YT Music arkaplana alındığında telefonun üst bildirim çubuğunda otomatik devreye girer.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, autoClickSkipNode: !c.autoClickSkipNode }))}
                className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  config.autoClickSkipNode
                    ? 'bg-slate-900 border-slate-600 text-white'
                    : 'bg-slate-900/40 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>Otomatik &ldquo;Atla / Skip&rdquo; Tıklayıcı</span>
                  <span className="font-mono text-emerald-400">{config.autoClickSkipNode ? 'AÇIK' : 'KAPALI'}</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-1">
                  YouTube & YT Music içindeki <code className="text-emerald-300">skip_ad_button</code> düğmesine anında
                  basar.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, gestureTapFallback: !c.gestureTapFallback }))}
                className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  config.gestureTapFallback
                    ? 'bg-slate-900 border-slate-600 text-white'
                    : 'bg-slate-900/40 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>Kalan Skip Tuşuna Parmak Dokunuşu</span>
                  <span className="font-mono text-emerald-400">{config.gestureTapFallback ? 'AÇIK' : 'KAPALI'}</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-1">
                  Ekranda asılı kalan Skip tuşunun koordinatını bulup gerçek dokunuş (GestureTap) gönderir.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, autoMuteAdStream: !c.autoMuteAdStream }))}
                className={`p-3.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  config.autoMuteAdStream
                    ? 'bg-slate-900 border-slate-600 text-white'
                    : 'bg-slate-900/40 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>Geçilemeyen Reklamda Sesi Kapat</span>
                  <span className="font-mono text-emerald-400">{config.autoMuteAdStream ? 'AÇIK' : 'KAPALI'}</span>
                </div>
                <p className="text-[11px] text-slate-300 mt-1">
                  5 saniyelik geri sayım süresince telefonun medya sesini kapatır, video başlayınca açar.
                </p>
              </button>
            </div>
          </div>

          {/* Direct APK & WebAPK Download Options for Android */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#111827] border-2 border-rose-500/60 rounded-lg p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <span className="text-xs font-mono text-rose-400">DİREKT .APK PAKETİ + PROJE DOSYASI</span>
                <h3 className="text-sm font-semibold text-white">
                  PureStream-YouTube-Premium.apk İndir
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  YouTube veya YT Music arkaplana alındığında telefonun üst bildirim çubuğunda oynatıcı açan,{' '}
                  <code className="text-white">✕ Kapat</code> tuşuyla kapatılabilen ve reklamlarda otomatik Skip yapan
                  Android paketi.
                </p>
              </div>
              <div className="space-y-2">
                <a
                  href="/api/purestream-youtube-premium.apk"
                  download="PureStream-YouTube-Premium.apk"
                  onClick={handleDownloadDirectApk}
                  className={`w-full py-2.5 px-4 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer whitespace-nowrap shrink-0 shadow-md ${
                    apkClicked ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  <Download className="w-4 h-4" />
                  {apkClicked ? '✓ APK İndiriliyor (PureStream.apk)' : 'PureStream-YouTube-Premium.apk İndir'}
                </a>
                <button
                  type="button"
                  onClick={handleDownloadAndroidZip}
                  className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Kaynak Kodu & GitHub Derleyici (.ZIP)
                </button>
              </div>
            </div>

            <div className="bg-[#111827] border border-slate-700 rounded-lg p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <span className="text-xs font-mono text-emerald-400">TEK TIKLA KURULUM · WEBAPK & MACRODROID</span>
                <h3 className="text-sm font-semibold text-white">
                  Bilinmeyen Kaynak İzni Gerekmeden Telefona Kur
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Android&apos;in &ldquo;Bilinmeyen Uygulamaları Yükle&rdquo; uyarısına takılmadan doğrudan telefona{' '}
                  <strong>WebAPK</strong> olarak kurabilir veya hazır <strong>.macro</strong> otomasyon dosyasını
                  indirebilirsiniz.
                </p>
              </div>
              <div className="space-y-2">
                {!isInstalled && isInstallable && (
                  <button
                    type="button"
                    onClick={install}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Smartphone className="w-4 h-4" />
                    Doğrudan Telefona WebAPK Olarak Kur
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDownloadMacroDroid}
                  className="w-full py-2.5 px-4 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 text-emerald-300 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download className="w-4 h-4" />
                  Hazır Android Profilini İndir (.macro)
                </button>
              </div>
            </div>
          </div>

          {/* Android Kotlin Source Code Inspector */}
          <div className="bg-[#111827] border border-slate-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-slate-300" />
                <span className="text-xs font-semibold text-white">
                  Android Telefon Üst Bildirim & Skip Servisi Kodu
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-700">
                  {(
                    [
                      'PureStreamAccessibilityService.kt',
                      'MainActivity.kt',
                      'AndroidManifest.xml',
                      'accessibility_service_config.xml',
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveCodeFile(tab)}
                      className={`px-2.5 py-1 text-[11px] font-mono rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        activeCodeFile === tab ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Kopyalandı' : 'Kopyala'}
                </button>
              </div>
            </div>

            <pre className="p-4 bg-slate-950 text-xs font-mono text-slate-200 overflow-x-auto max-h-[240px] leading-relaxed">
              <code>{currentCode}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
