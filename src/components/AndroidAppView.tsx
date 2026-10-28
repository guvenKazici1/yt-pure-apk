import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Download,
  Copy,
  Check,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ShieldCheck,
  MousePointerClick,
  Terminal,
  Headphones,
  Music,
  Tv,
  X,
  PictureInPicture2,
  Maximize2,
  ExternalLink,
} from 'lucide-react';
import { MediaTrack } from '../types';
import { CURATED_TRACKS, formatTime } from '../utils/sponsorBlock';
import { backgroundEngine } from '../utils/backgroundKeepAlive';
import { ApkDownloadModal } from './ApkDownloadModal';
import {
  AndroidServiceConfig,
  createAndroidProjectZipBlob,
  downloadDirectApkFile,
  generateAccessibilityConfigXml,
  generateAndroidAccessibilityServiceKt,
  generateAndroidManifestXml,
  generateMainActivityKt,
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
    scanIntervalMs: 80,
  });

  const [androidServiceEnabled] = useState<boolean>(true);
  const [activeAndroidApp, setActiveAndroidApp] = useState<'youtube' | 'ytmusic'>('youtube');
  const [adState, setAdState] = useState<'none' | 'skip_stuck' | 'skipped'>('none');
  const [skippedTotalAndroid, setSkippedTotalAndroid] = useState<number>(18);

  // Normal YouTube: When put in background while video is playing, Floating Mini-Screen ("Küçük Ekran") appears!
  const [ytInBackgroundMiniScreen, setYtInBackgroundMiniScreen] = useState<boolean>(true);
  const [ytMiniScreenClosedByX, setYtMiniScreenClosedByX] = useState<boolean>(false);

  // Normal YT Music: Top Notification Bar ("Telefon Üst Sekmesi") with Song Title + Prev / Play-Pause / Next
  const [ytmTopBarClosedByX, setYtmTopBarClosedByX] = useState<boolean>(false);

  const [lastAndroidLog, setLastAndroidLog] = useState<string>(
    'Normal YouTube & YT Music uygulamaları için Sistem Servisi: Reklam engelleme + Arka planda Küçük Ekran + YT Music Üst Sekme'
  );

  const [activeCodeFile, setActiveCodeFile] = useState<
    'PureStreamAccessibilityService.kt' | 'MainActivity.kt' | 'AndroidManifest.xml' | 'accessibility_service_config.xml'
  >('PureStreamAccessibilityService.kt');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!androidServiceEnabled || adState !== 'skip_stuck') return;

    const timer = setTimeout(() => {
      setAdState('skipped');
      setSkippedTotalAndroid((c) => c + 1);
      setLastAndroidLog(
        `[${new Date().toTimeString().split(' ')[0]}] Normal ${
          activeAndroidApp === 'youtube' ? 'YouTube' : 'YT Music'
        } Reklamı Engellendi: "Atla" tuşuna ${config.scanIntervalMs}ms içinde otomatik basıldı`
      );
    }, 650);

    return () => clearTimeout(timer);
  }, [androidServiceEnabled, adState, config.scanIntervalMs, activeAndroidApp]);

  const handlePrevTrack = () => {
    setYtmTopBarClosedByX(false);
    const idx = CURATED_TRACKS.findIndex((t) => t.id === activeTrack.id);
    const prevIdx = idx <= 0 ? CURATED_TRACKS.length - 1 : idx - 1;
    const prev = CURATED_TRACKS[prevIdx];
    onSelectTrack(prev);
    setLastAndroidLog(`⏮ YT Music Üst Sekme: Önceki şarkıya geçildi -> "${prev.title}"`);
  };

  const handleNextTrackWithLog = () => {
    setYtmTopBarClosedByX(false);
    onNextTrack();
    setLastAndroidLog('⏭ YT Music Üst Sekme: Sonraki şarkıya geçildi');
  };

  const handleSendNormalYoutubeToBackground = async () => {
    setActiveAndroidApp('youtube');
    setYtInBackgroundMiniScreen(true);
    setYtMiniScreenClosedByX(false);
    if (!backgroundGuardActive) {
      onToggleBackgroundGuard();
    }
    if (!isPlaying) {
      onTogglePlay();
    }
    setLastAndroidLog(
      'Normal YouTube arka plana alındı -> Ekranda Küçük Ekran (Mini-Screen) belirdi! Durdurup oynatabilir veya ✕ ile kapatabilirsiniz.'
    );
  };

  const handleCloseMiniScreenVideoWithX = () => {
    setYtMiniScreenClosedByX(true);
    setYtInBackgroundMiniScreen(false);
    onStopAllAndClose();
    setLastAndroidLog('Küçük Ekrandaki (Mini-Screen) video "✕ Kapat" tuşuyla durduruldu ve kapatıldı.');
  };

  const handleCloseYtmTopBarWithX = () => {
    setYtmTopBarClosedByX(true);
    onStopAllAndClose();
    setLastAndroidLog('YT Music Telefon Üst Sekmesi "✕" ile kapatıldı.');
  };

  const [apkModalOpen, setApkModalOpen] = useState<boolean>(false);
  const [apkClicked, setApkClicked] = useState<boolean>(false);

  const handleDownloadDirectApk = () => {
    setApkClicked(true);
    setApkModalOpen(true);
    downloadDirectApkFile(config);
    setLastAndroidLog('✓ GitHub Actions / Release üzerinden güncel app-debug.apk indiriliyor...');
  };

  const handleDownloadAndroidZip = () => {
    const blob = createAndroidProjectZipBlob(config);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'purestream-normal-youtube-ytmusic-companion.zip';
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
      {/* Architecture Banner explaining "Not inside an app — works directly on normal YouTube & YT Music" */}
      <div className="bg-gradient-to-r from-[#111827] via-slate-900 to-rose-950/40 border border-rose-500/40 rounded-xl p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wide">
            <Smartphone className="w-4 h-4 shrink-0" />
            <span>
              Uygulama İçi Tarayıcı Değil · Doğrudan Normal YouTube &amp; Normal YT Music Üzerinde Çalışır (v5.0)
            </span>
          </div>
          <p className="text-xs text-slate-200 leading-relaxed">
            YouTube bu uygulamanın içinde açılmaz! Telefonunuzdaki <strong>normal YouTube</strong> uygulamasını
            açtığınızda <strong>reklamları otomatik engeller</strong> ve video oynarken uygulamayı arka plana
            aldığınızda ekranda <strong>Küçük Ekran (Mini-Screen)</strong> belirir (durdurup oynatabilir ve{' '}
            <strong>✕</strong> ile videoyu kapatabilirsiniz). <strong>Normal YT Music</strong> için ise telefonun{' '}
            <strong>üst bildirim sekmesinde çalan şarkıyı gösterir</strong>; <strong>⏮ Önceki</strong>,{' '}
            <strong>⏯ Durdur/Oynat</strong> ve <strong>⏭ Sonraki</strong> tuşlarıyla şarkı değiştirebilirsiniz.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href="https://github.com/guvenKazici1/yt-pure-apk/releases/latest/download/app-debug.apk"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setApkClicked(true)}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-all active:scale-95 cursor-pointer whitespace-nowrap shadow-md"
          >
            <Download className="w-4 h-4" />
            <span>GitHub Latest APK İndir (app-debug.apk)</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </a>

          <button
            type="button"
            onClick={handleSendNormalYoutubeToBackground}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <PictureInPicture2 className="w-4 h-4" />
            <span>Küçük Ekranı Test Et</span>
          </button>
        </div>
      </div>

      <ApkDownloadModal isOpen={apkModalOpen} onClose={() => setApkModalOpen(false)} config={config} />

      {/* Main Grid: Interactive Phone Simulation (Left 6 Cols) + Feature & GitHub Instructions (Right 6 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 6 Cols: Interactive Phone Demonstrating YT Music Top Bar & Normal YouTube Floating Mini-Screen */}
        <div className="lg:col-span-6 bg-[#111827] border border-slate-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-white">
                Canlı Telefon Simülasyonu: Küçük Ekran &amp; YT Music Üst Sekme
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Normal YouTube arka plana alındığında çıkan <strong>Küçük Ekranı</strong> ve{' '}
                <strong>YT Music Üst Sekmesini</strong> aşağıdan test edin.
              </p>
            </div>
            <span className="px-2.5 py-1 rounded bg-emerald-950 border border-emerald-600/60 font-mono text-[11px] text-emerald-300 shrink-0">
              V5.0 AKTİF
            </span>
          </div>

          {/* Phone Frame */}
          <div className="bg-slate-950 border-2 border-slate-700 rounded-2xl p-4 space-y-4 shadow-2xl relative overflow-hidden">
            {/* 1. Phone Status Bar */}
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 px-1 border-b border-slate-800 pb-2">
              <span className="font-semibold">09:41 · Android Sistem</span>
              <span className="text-emerald-400 font-semibold">
                ● REKLAM ENGELLEYİCİ &amp; ARKA PLAN AKTİF
              </span>
            </div>

            {/* 2. YT MUSIC PHONE TOP NOTIFICATION BAR (TELEFON ÜST SEKMESİNDE ÇALAN ŞARKI: ÖNCEKİ / PLAY-PAUSE / SONRAKİ) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5" />
                  1. YT Music Telefon Üst Sekmesi (Çalan Şarkı &amp; Önceki/Sonraki)
                </span>
                {ytmTopBarClosedByX && (
                  <button
                    type="button"
                    onClick={() => {
                      setYtmTopBarClosedByX(false);
                      if (!isPlaying) onTogglePlay();
                    }}
                    className="text-emerald-400 underline cursor-pointer"
                  >
                    Üst Sekmeyi Geri Aç
                  </button>
                )}
              </div>

              {!ytmTopBarClosedByX ? (
                <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950/90 border-2 border-emerald-500/70 rounded-xl p-3.5 shadow-lg space-y-2.5">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-700/80 pb-2">
                    <div className="flex items-center gap-1.5">
                      <Headphones className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-[10px] font-mono font-bold text-emerald-300 uppercase tracking-wide">
                        YT MUSIC · TELEFON ÜST BİLDİRİM SEKMESİ
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCloseYtmTopBarWithX}
                      title="Üst Sekmeyi Kapat (X)"
                      className="px-2 py-0.5 bg-rose-600/80 hover:bg-rose-500 text-white text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                      <span>Kapat</span>
                    </button>
                  </div>

                  {/* Playing Song Info + Previous / Play-Pause / Next Controls */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={`https://i.ytimg.com/vi/${activeTrack.videoId}/hqdefault.jpg`}
                        alt={activeTrack.title}
                        referrerPolicy="no-referrer"
                        className="w-12 h-10 rounded-lg object-cover border border-slate-600 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">🎵 {activeTrack.title}</p>
                        <p className="text-[11px] text-emerald-300 truncate">
                          {activeTrack.channel} · {isPlaying ? 'Çalıyor' : 'Duraklatıldı'}
                        </p>
                      </div>
                    </div>

                    {/* ⏮ Önceki | ⏯ Play/Pause | ⏭ Sonraki */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handlePrevTrack}
                        className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg cursor-pointer transition-transform active:scale-95"
                        title="Önceki Şarkı (⏮)"
                      >
                        <SkipBack className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={onTogglePlay}
                        className="p-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg cursor-pointer transition-transform active:scale-95 shadow"
                        title={isPlaying ? 'Durdur (⏸)' : 'Oynat (▶)'}
                      >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={handleNextTrackWithLog}
                        className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg cursor-pointer transition-transform active:scale-95"
                        title="Sonraki Şarkı (⏭)"
                      >
                        <SkipForward className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-slate-400 flex items-center justify-between">
                  <span>YT Music üst sekmesi kapatıldı.</span>
                  <button
                    type="button"
                    onClick={() => setYtmTopBarClosedByX(false)}
                    className="px-2.5 py-1 bg-emerald-600 text-white rounded text-xs font-semibold cursor-pointer"
                  >
                    Tekrar Göster
                  </button>
                </div>
              )}
            </div>

            {/* 3. NORMAL YOUTUBE APP & FLOATING MINI-SCREEN ("KÜÇÜK EKRAN") */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                <span className="font-semibold text-rose-400 flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5" />
                  2. Normal YouTube: Reklam Engelleme &amp; Arka Plan Küçük Ekran
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setYtInBackgroundMiniScreen(false);
                      setYtMiniScreenClosedByX(false);
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                      !ytInBackgroundMiniScreen ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    Normal YouTube Açık
                  </button>
                  <button
                    type="button"
                    onClick={handleSendNormalYoutubeToBackground}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                      ytInBackgroundMiniScreen ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    Arka Plana Al (Küçük Ekran)
                  </button>
                </div>
              </div>

              {ytInBackgroundMiniScreen ? (
                /* Phone Home Screen with Floating Mini-Screen Overlay ("Küçük Ekran") */
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 min-h-[230px] flex flex-col justify-between relative">
                  <div className="text-xs text-slate-400 space-y-1">
                    <p className="font-semibold text-slate-200">
                      📱 Telefon Ana Ekranı (Normal YouTube Arka Plana Alındı)
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Normal YouTube&apos;da video oynarken ana ekrana döndüğünüzde veya başka uygulamaya
                      geçtiğinizde aşağıdaki <strong>Küçük Ekran (Mini-Screen)</strong> otomatik belirir:
                    </p>
                  </div>

                  {!ytMiniScreenClosedByX ? (
                    /* FLOATING MINI-SCREEN OVERLAY (KÜÇÜK EKRAN) */
                    <div className="mt-3 ml-auto w-full sm:w-[310px] bg-[#0F172A] border-2 border-rose-500 rounded-xl p-2.5 shadow-2xl space-y-2">
                      {/* Mini-Screen Header */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono font-bold text-rose-400 flex items-center gap-1">
                          <PictureInPicture2 className="w-3.5 h-3.5" />
                          ● YOUTUBE KÜÇÜK EKRAN
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setYtInBackgroundMiniScreen(false)}
                            className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-semibold rounded flex items-center gap-1 cursor-pointer"
                            title="Normal YouTube'a Geri Dön"
                          >
                            <Maximize2 className="w-2.5 h-2.5" />
                            <span>Büyüt</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleCloseMiniScreenVideoWithX}
                            className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold rounded cursor-pointer"
                            title="Videoyu ve Küçük Ekranı Kapat (✕)"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Mini-Screen 16:9 Video Preview */}
                      <div className="relative rounded-lg overflow-hidden border border-slate-700 bg-black aspect-video max-h-[120px] w-full">
                        <img
                          src={`https://i.ytimg.com/vi/${activeTrack.videoId}/hqdefault.jpg`}
                          alt={activeTrack.title}
                          referrerPolicy="no-referrer"
                          className={`w-full h-full object-cover ${isPlaying ? 'opacity-90' : 'opacity-50'}`}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 flex items-end p-2">
                          <p className="text-[11px] font-semibold text-white truncate w-full">
                            {activeTrack.title}
                          </p>
                        </div>
                      </div>

                      {/* Mini-Screen Controls: Durdur/Oynat & Videoyu Kapat */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={onTogglePlay}
                          className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-transform active:scale-95"
                        >
                          {isPlaying ? (
                            <>
                              <Pause className="w-3.5 h-3.5" />
                              <span>Durdur</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5" />
                              <span>Oynat</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={handleCloseMiniScreenVideoWithX}
                          className="py-1.5 px-3 bg-rose-700 hover:bg-rose-600 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-transform active:scale-95"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Videoyu Kapat</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                      <span className="text-xs text-slate-300">
                        Küçük ekran videosu <strong>✕ Videoyu Kapat</strong> ile kapatıldı.
                      </span>
                      <button
                        type="button"
                        onClick={handleSendNormalYoutubeToBackground}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        Küçük Ekranı Tekrar Aç
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Normal Official YouTube App Foreground View with Auto Ad-Block */
                <div className="bg-slate-900 border border-slate-700 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Tv className="w-4 h-4 text-rose-500" />
                      Normal YouTube Uygulaması (com.google.android.youtube)
                    </span>
                    <button
                      type="button"
                      onClick={handleSendNormalYoutubeToBackground}
                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold rounded-md flex items-center gap-1 cursor-pointer"
                    >
                      <PictureInPicture2 className="w-3.5 h-3.5" />
                      <span>Arka Plana Al → Küçük Ekran Aç</span>
                    </button>
                  </div>

                  {adState === 'skip_stuck' ? (
                    <div className="p-3 bg-amber-500/20 border border-amber-400/60 rounded-lg flex items-center justify-between gap-2">
                      <div className="text-xs text-amber-100">
                        <p className="font-semibold">Normal YouTube&apos;da Reklam Algılandı!</p>
                        <p className="text-[11px] text-amber-200">
                          PureStream Erişilebilirlik Servisi &ldquo;Atla&rdquo; tuşuna otomatik basıyor...
                        </p>
                      </div>
                      <span className="px-2.5 py-1 bg-white text-slate-950 font-bold text-xs rounded shadow flex items-center gap-1">
                        <span>Atla</span>
                        <MousePointerClick className="w-3.5 h-3.5 text-rose-600" />
                      </span>
                    </div>
                  ) : (
                    <div className="px-3 py-2 bg-emerald-950/70 border border-emerald-700/60 rounded-lg flex items-center justify-between text-xs text-emerald-200">
                      <span className="flex items-center gap-1.5 font-medium">
                        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                        Normal YouTube Reklam Engelleyici Aktif (Engellenen: {skippedTotalAndroid})
                      </span>
                      <button
                        type="button"
                        onClick={() => setAdState('skip_stuck')}
                        className="text-[11px] underline text-emerald-300 cursor-pointer"
                      >
                        Reklam Test Et
                      </button>
                    </div>
                  )}

                  {/* Select Song / Video */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {CURATED_TRACKS.slice(0, 4).map((t) => {
                      const selected = t.id === activeTrack.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setYtMiniScreenClosedByX(false);
                            setYtmTopBarClosedByX(false);
                            onSelectTrack(t);
                          }}
                          className={`p-2 rounded-lg text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                            selected
                              ? 'bg-rose-600/25 border border-rose-500/50 text-white'
                              : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                          }`}
                        >
                          <span className="truncate font-medium pr-1">{t.title}</span>
                          <span className="font-mono text-[10px] text-slate-400 shrink-0">
                            {formatTime(t.durationSec)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="text-[11px] font-mono text-emerald-300 truncate border-t border-slate-800 pt-2">
              {lastAndroidLog}
            </div>
          </div>
        </div>

        {/* Right 6 Cols: How It Works on Your Phone + GitHub APK Build & Download */}
        <div className="lg:col-span-6 space-y-4">
          {/* Summary of the 3 Native Capabilities */}
          <div className="bg-[#111827] border border-slate-700 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-white">
              Telefonda Nasıl Çalışır? (Uygulama İçi Değil, Sistem Servisi)
            </h2>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 bg-slate-900 border border-slate-700 rounded-lg space-y-1">
                <p className="font-bold text-rose-400">
                  1. Normal YouTube Reklam Engelleme (Otomatik Skip &amp; Sessize Alma)
                </p>
                <p className="text-slate-300 leading-relaxed">
                  Telefonunuzdaki <strong>normal YouTube</strong> uygulamasını açtığınızda arka planda çalışan{' '}
                  <code className="text-emerald-300">PureStreamAccessibilityService</code> reklamları milisaniyede
                  algılar, <strong>&ldquo;Atla / Skip&rdquo;</strong> tuşuna otomatik tıklar ve geçilemeyen reklam
                  varsa sesini otomatik kapatır.
                </p>
              </div>

              <div className="p-3.5 bg-slate-900 border border-slate-700 rounded-lg space-y-1">
                <p className="font-bold text-purple-400">
                  2. Normal YouTube Arka Plana Alındığında Beliren Küçük Ekran (Mini-Screen)
                </p>
                <p className="text-slate-300 leading-relaxed">
                  Normal YouTube&apos;da video oynarken ana ekrana döndüğünüzde veya başka bir uygulamaya
                  geçtiğinizde <code className="text-emerald-300">FloatingMiniPlayerService</code> devreye girer ve
                  ekranın üzerinde sürüklenebilir <strong>Küçük Ekran</strong> açar. Üzerindeki{' '}
                  <strong>⏸ Durdur / ▶ Oynat</strong> tuşuyla videoyu durdurup oynatabilir, isterseniz{' '}
                  <strong>✕ Videoyu Kapat</strong> tuşuyla tamamen kapatabilirsiniz.
                </p>
              </div>

              <div className="p-3.5 bg-slate-900 border border-slate-700 rounded-lg space-y-1">
                <p className="font-bold text-emerald-400">
                  3. Normal YT Music Telefon Üst Sekmesinde Çalan Şarkı &amp; Şarkı Değiştirme
                </p>
                <p className="text-slate-300 leading-relaxed">
                  Normal <strong>YT Music</strong> uygulamasını açtığınızda veya arka plana aldığınızda telefonun{' '}
                  <strong>üst bildirim sekmesinde (Android MediaStyle Notification)</strong> çalan şarkının adını ve
                  sanatçısını gösterir. Üst sekmedeki <strong>⏮ Önceki</strong>, <strong>⏯ Durdur/Oynat</strong> ve{' '}
                  <strong>⏭ Sonraki</strong> tuşlarıyla istediğiniz zaman önceki veya sonraki şarkıya geçebilirsiniz.
                </p>
              </div>
            </div>
          </div>

          {/* GitHub Direct Download Card */}
          <div className="bg-[#111827] border-2 border-rose-500/60 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-rose-400">
                GITHUB ACTIONS OTOMATİK APK &amp; DİREKT İNDİRME LİNKİ
              </span>
              <span className="text-xs font-mono text-emerald-400">v5.0.0 · AGP 9.1.1</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Değişiklikleri GitHub deponuza (<strong>guvenKazici1/yt-pure-apk</strong>) gönderdiğinizde GitHub
              Actions yeni <strong>v5.0.0</strong> APK&apos;sını otomatik derler ve aşağıdaki sabit bağlantıdan
              indirilebilir hale getirir:
            </p>
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs text-emerald-300 break-all">
              https://github.com/guvenKazici1/yt-pure-apk/releases/latest/download/app-debug.apk
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <a
                href="https://github.com/guvenKazici1/yt-pure-apk/releases/latest/download/app-debug.apk"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>GitHub Latest APK İndir (app-debug.apk)</span>
              </a>
              <button
                type="button"
                onClick={handleDownloadAndroidZip}
                className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Proje ZIP</span>
              </button>
            </div>
          </div>

          {/* Code Inspector */}
          <div className="bg-[#111827] border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-slate-300" />
                <span className="text-xs font-semibold text-white">Android Sistem Servisi Kodları</span>
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
                      className={`px-2 py-1 text-[10px] font-mono rounded transition-colors cursor-pointer whitespace-nowrap ${
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
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Kopyalandı' : 'Kopyala'}
                </button>
              </div>
            </div>
            <pre className="p-4 bg-slate-950 text-xs font-mono text-slate-200 overflow-x-auto max-h-[200px] leading-relaxed">
              <code>{currentCode}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
