import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  FastForward,
  Volume2,
  VolumeX,
  Headphones,
  MonitorPlay,
  Plus,
  CheckCircle2,
  RefreshCw,
  Search,
  Download,
  ShieldCheck,
  MousePointerClick,
  Maximize2,
  Minimize2,
  X,
  EyeOff,
  Eye,
  PictureInPicture2,
  Repeat,
  Timer,
  Gauge,
} from 'lucide-react';
import { MediaTrack, SponsorCategory, SponsorSegment } from '../types';
import {
  CATEGORY_LABELS,
  CURATED_TRACKS,
  extractYouTubeId,
  fetchSponsorSegments,
  formatTime,
} from '../utils/sponsorBlock';
import { backgroundEngine } from '../utils/backgroundKeepAlive';
import { pipEngine } from '../utils/pipEngine';
import { ApkDownloadModal } from './ApkDownloadModal';
import { downloadDirectApkFile, getSignedApkBlobUrl } from '../utils/androidAppGenerator';

interface AdFreePlayerViewProps {
  isMinimizedDock: boolean;
  onExpandToPlayerTab: () => void;
  backgroundGuardActive: boolean;
  onToggleBackgroundGuard: () => void;
  onAutoEnableBackgroundGuard: () => void;
  onStopAllAndClose: () => void;
  onOpenExtensionTab: () => void;
  activeTrack: MediaTrack;
  onSelectTrack: (track: MediaTrack) => void;
  tracks: MediaTrack[];
  onUpdateTracks: (tracks: MediaTrack[]) => void;
  isPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
  videoScreenVisible: boolean;
  onVideoScreenVisibleChange: (visible: boolean) => void;
  playerClosedByX: boolean;
  onPlayerClosedByXChange: (closed: boolean) => void;
  registerControls: (controls: {
    togglePlay: () => void;
    pauseAndStop: () => void;
    nextTrack: () => void;
    toggleMute: () => void;
  }) => void;
  onSegmentSkipped: (
    platform: 'YouTube' | 'YT Music',
    title: string,
    categoryLabel: string,
    savedSec: number
  ) => void;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export const AdFreePlayerView: React.FC<AdFreePlayerViewProps> = ({
  isMinimizedDock,
  onExpandToPlayerTab,
  backgroundGuardActive,
  onToggleBackgroundGuard,
  onAutoEnableBackgroundGuard,
  onStopAllAndClose,
  onOpenExtensionTab,
  activeTrack,
  onSelectTrack,
  tracks,
  onUpdateTracks,
  isPlaying,
  onPlayingChange,
  videoScreenVisible,
  onVideoScreenVisibleChange,
  playerClosedByX,
  onPlayerClosedByXChange,
  registerControls,
  onSegmentSkipped,
}) => {
  const [searchOrUrlInput, setSearchOrUrlInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [seamlessNoCutMode, setSeamlessNoCutMode] = useState<boolean>(true);
  const [autoClickSkipHunter, setAutoClickSkipHunter] = useState<boolean>(true);
  const [skipHunterClicksCount, setSkipHunterClicksCount] = useState<number>(0);

  const [segments, setSegments] = useState<SponsorSegment[]>(CURATED_TRACKS[3].fallbackSegments);
  const [loadingSegments, setLoadingSegments] = useState(false);
  const [enabledCategories, setEnabledCategories] = useState<Record<SponsorCategory, boolean>>({
    sponsor: false,
    selfpromo: false,
    interaction: false,
    intro: false,
    outro: false,
    music_offtopic: false,
  });

  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(activeTrack.durationSec);
  const [lastSkipBanner, setLastSkipBanner] = useState<string | null>(null);

  // YouTube Premium & YT Music Premium states
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [repeatOneTrack, setRepeatOneTrack] = useState<boolean>(false);
  const [sleepTimerSec, setSleepTimerSec] = useState<number | null>(null);
  const [apkModalOpen, setApkModalOpen] = useState<boolean>(false);
  const [apkClicked, setApkClicked] = useState<boolean>(false);

  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [customCat, setCustomCat] = useState<SponsorCategory>('sponsor');

  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);
  const playerReadyRef = useRef<boolean>(false);
  const userPausedRef = useRef<boolean>(false);
  const repeatOneRef = useRef<boolean>(repeatOneTrack);
  const lastSkippedUuidRef = useRef<string | null>(null);
  const segmentsRef = useRef<SponsorSegment[]>(segments);
  const enabledCatsRef = useRef(enabledCategories);
  const seamlessModeRef = useRef(seamlessNoCutMode);
  const activeTrackRef = useRef(activeTrack);
  const tracksRef = useRef(tracks);

  useEffect(() => {
    repeatOneRef.current = repeatOneTrack;
  }, [repeatOneTrack]);

  // YouTube Premium Sleep Timer countdown
  useEffect(() => {
    if (sleepTimerSec === null) return;
    if (sleepTimerSec <= 0) {
      setSleepTimerSec(null);
      handlePauseAndStop();
      onStopAllAndClose();
      return;
    }
    const timer = setInterval(() => {
      setSleepTimerSec((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(timer);
  }, [sleepTimerSec]);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    enabledCatsRef.current = enabledCategories;
  }, [enabledCategories]);

  useEffect(() => {
    seamlessModeRef.current = seamlessNoCutMode;
  }, [seamlessNoCutMode]);

  useEffect(() => {
    activeTrackRef.current = activeTrack;
  }, [activeTrack]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  const handleTogglePlay = () => {
    const p = playerRef.current;
    if (!p || !playerReadyRef.current) return;
    try {
      onPlayerClosedByXChange(false);
      const state = p.getPlayerState?.();
      if (state === 1) {
        userPausedRef.current = true;
        p.pauseVideo();
      } else {
        userPausedRef.current = false;
        p.playVideo();
      }
    } catch {}
  };

  const handlePauseAndStop = () => {
    userPausedRef.current = true;
    const p = playerRef.current;
    if (p && playerReadyRef.current) {
      try {
        p.pauseVideo();
      } catch {}
    }
    onPlayingChange(false);
  };

  const handleNextTrack = () => {
    userPausedRef.current = false;
    onPlayerClosedByXChange(false);
    const list = tracksRef.current;
    const idx = list.findIndex((t) => t.id === activeTrackRef.current.id);
    const nextIdx = (idx + 1) % list.length;
    onSelectTrack(list[nextIdx]);
  };

  const handlePrevTrack = () => {
    userPausedRef.current = false;
    onPlayerClosedByXChange(false);
    const list = tracksRef.current;
    const idx = list.findIndex((t) => t.id === activeTrackRef.current.id);
    const prevIdx = (idx - 1 + list.length) % list.length;
    onSelectTrack(list[prevIdx]);
  };

  const handleToggleMute = () => {
    const p = playerRef.current;
    if (!p || !playerReadyRef.current) return;
    if (isMuted) {
      p.unMute();
      setIsMuted(false);
    } else {
      p.mute();
      setIsMuted(true);
    }
  };

  useEffect(() => {
    registerControls({
      togglePlay: handleTogglePlay,
      pauseAndStop: handlePauseAndStop,
      nextTrack: handleNextTrack,
      toggleMute: handleToggleMute,
    });
  });

  const handleToggleSeamlessMode = (noCut: boolean) => {
    setSeamlessNoCutMode(noCut);
    if (noCut) {
      setEnabledCategories({
        sponsor: false,
        selfpromo: false,
        interaction: false,
        intro: false,
        outro: false,
        music_offtopic: false,
      });
    } else {
      setEnabledCategories({
        sponsor: true,
        selfpromo: true,
        interaction: false,
        intro: false,
        outro: false,
        music_offtopic: false,
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function loadSegments() {
      setLoadingSegments(true);
      const apiSegments = await fetchSponsorSegments(activeTrack.videoId);
      if (cancelled) return;

      if (apiSegments.length > 0) {
        setSegments(apiSegments);
      } else {
        setSegments(activeTrack.fallbackSegments || []);
      }
      setLoadingSegments(false);
    }
    loadSegments();
    return () => {
      cancelled = true;
    };
  }, [activeTrack]);

  // Initialize YouTube IFrame API inside an imperative child node
  useEffect(() => {
    const initPlayer = () => {
      if (!window.YT || !window.YT.Player || !playerHostRef.current) return;

      if (playerRef.current && playerReadyRef.current && typeof playerRef.current.loadVideoById === 'function') {
        try {
          userPausedRef.current = false;
          playerRef.current.loadVideoById(activeTrack.videoId);
          return;
        } catch {}
      }

      try {
        playerHostRef.current.innerHTML = '';
        const mountTarget = document.createElement('div');
        mountTarget.style.width = '100%';
        mountTarget.style.height = '100%';
        playerHostRef.current.appendChild(mountTarget);

        playerReadyRef.current = false;
        playerRef.current = new window.YT.Player(mountTarget, {
          height: '100%',
          width: '100%',
          videoId: activeTrack.videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: {
            autoplay: 0,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            iv_load_policy: 3,
            playsinline: 1,
          },
          events: {
            onReady: (event: any) => {
              playerReadyRef.current = true;
              const d = event.target.getDuration();
              if (d && d > 0) setDuration(d);
            },
            onStateChange: (event: any) => {
              const state = event.data;
              if (state === 1) {
                userPausedRef.current = false;
                onPlayingChange(true);
                onPlayerClosedByXChange(false);
                // Automatically activate phone top notification & background keep-alive whenever playback starts!
                onAutoEnableBackgroundGuard();
                const d = event.target.getDuration();
                const t = event.target.getCurrentTime?.() || 0;
                if (d && d > 0) setDuration(d);
                backgroundEngine.updateMediaSession(
                  activeTrackRef.current.title,
                  activeTrackRef.current.channel,
                  activeTrackRef.current.videoId,
                  {
                    onPlay: () => {
                      userPausedRef.current = false;
                      event.target.playVideo();
                    },
                    onPause: () => {
                      userPausedRef.current = true;
                      event.target.pauseVideo();
                    },
                    onNext: () => handleNextTrack(),
                    onPrev: () => handlePrevTrack(),
                    onStop: () => {
                      userPausedRef.current = true;
                      event.target.pauseVideo();
                      onStopAllAndClose();
                    },
                  },
                  t,
                  d
                );
              } else if (state === 2) {
                // If the browser automatically paused the video when the user minimized the phone app,
                // immediately resume playback so it continues in the phone's top notification bar!
                if (!userPausedRef.current && document.visibilityState === 'hidden') {
                  try {
                    event.target.playVideo();
                    return;
                  } catch {}
                }
                onPlayingChange(false);
              } else if (state === 0) {
                if (repeatOneRef.current) {
                  try {
                    event.target.seekTo(0, true);
                    event.target.playVideo();
                    return;
                  } catch {}
                }
                onPlayingChange(false);
                handleNextTrack();
              }
            },
          },
        });
      } catch {}
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const existingScript = document.getElementById('yt-iframe-api-script');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(tag);
      }
      window.onYouTubeIframeAPIReady = () => {
        initPlayer();
      };
    }
  }, [activeTrack.videoId]);

  useEffect(() => {
    const timer = setInterval(() => {
      const p = playerRef.current;
      if (!p || !playerReadyRef.current || typeof p.getCurrentTime !== 'function') return;

      try {
        const t = p.getCurrentTime();
        const d = p.getDuration();
        if (typeof t === 'number' && !Number.isNaN(t)) {
          setCurrentTime(t);
        }
        if (typeof d === 'number' && d > 0) {
          setDuration(d);
        }

        if (seamlessModeRef.current) return;

        for (const seg of segmentsRef.current) {
          if (!enabledCatsRef.current[seg.category]) continue;
          if (t >= seg.startTime && t < seg.endTime - 0.5) {
            const segKey = `${activeTrackRef.current.videoId}-${seg.startTime}-${seg.endTime}`;
            if (lastSkippedUuidRef.current !== segKey) {
              lastSkippedUuidRef.current = segKey;
              p.seekTo(seg.endTime, true);
              const saved = Math.max(1, Math.round(seg.endTime - t));
              const catInfo = CATEGORY_LABELS[seg.category] || CATEGORY_LABELS.sponsor;
              setLastSkipBanner(
                `${catInfo.label} otomatik atlandı (${formatTime(seg.startTime)} → ${formatTime(seg.endTime)} · +${saved} sn kazanıldı)`
              );
              onSegmentSkipped(
                activeTrackRef.current.platform,
                activeTrackRef.current.title,
                catInfo.label,
                saved
              );
              setTimeout(() => {
                setLastSkipBanner(null);
              }, 4500);
              setTimeout(() => {
                lastSkippedUuidRef.current = null;
              }, 2000);
            }
            break;
          }
        }
      } catch {}
    }, 150);

    return () => clearInterval(timer);
  }, [onSegmentSkipped]);

  const handleTestLingeringSkipClick = () => {
    setSkipHunterClicksCount((c) => c + 1);
    setLastSkipBanner(
      'Asılı Kalan "Skip / Atla" Tuşu Avcısı tetiklendi: PointerDown → MouseDown → Click + player.skipAd() (8ms içinde reklam katmanı kapatıldı, video kesintisiz devam ediyor)'
    );
    onSegmentSkipped(
      activeTrack.platform,
      activeTrack.title,
      'Kalan Skip Tuşu Otomatik Tıklandı',
      15
    );
    setTimeout(() => {
      setLastSkipBanner(null);
    }, 4500);
  };

  const handleSearchOrUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError('');
    const raw = searchOrUrlInput.trim();
    if (!raw) return;

    onPlayerClosedByXChange(false);

    const extractedId = extractYouTubeId(raw);
    if (extractedId && (raw.includes('youtu') || raw.length === 11)) {
      const isMusic = raw.toLowerCase().includes('music.youtube.com');
      const newTrack: MediaTrack = {
        id: `custom-${Date.now()}`,
        videoId: extractedId,
        title: `Özel Akış (${extractedId})`,
        channel: isMusic ? 'YouTube Music Akışı' : 'YouTube Akışı',
        platform: isMusic ? 'YT Music' : 'YouTube',
        durationSec: 300,
        categoryLabel: isMusic ? 'YT Music · Doğrudan Bağlantı' : 'YouTube · Doğrudan Bağlantı',
        fallbackSegments: [],
      };
      onUpdateTracks([newTrack, ...tracks]);
      onSelectTrack(newTrack);
      setSearchOrUrlInput('');
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/yt-search?q=${encodeURIComponent(raw)}`);
      if (!res.ok) {
        throw new Error('Arama yanıt vermedi');
      }
      const data = await res.json();
      if (!Array.isArray(data.results) || data.results.length === 0) {
        setSearchError('Sonuç bulunamadı. Lütfen farklı bir şarkı/video adı veya doğrudan YouTube linki deneyin.');
        setIsSearching(false);
        return;
      }

      const mappedTracks: MediaTrack[] = data.results.map((item: any, idx: number) => ({
        id: `search-${Date.now()}-${idx}`,
        videoId: item.videoId,
        title: item.title,
        channel: item.channel,
        platform: item.durationSec < 420 ? 'YT Music' : 'YouTube',
        durationSec: item.durationSec || 240,
        categoryLabel: `Canlı Arama Sonucu · ${item.durationText || ''}`,
        fallbackSegments: [],
      }));

      onUpdateTracks(mappedTracks);
      onSelectTrack(mappedTracks[0]);
    } catch {
      setSearchError('YouTube arama servisine bağlanılamadı. Doğrudan YouTube linki yapıştırabilirsiniz.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleJumpToSegmentTest = (seg: SponsorSegment) => {
    const p = playerRef.current;
    if (!p || !playerReadyRef.current) return;
    setSeamlessNoCutMode(false);
    setEnabledCategories((prev) => ({ ...prev, [seg.category]: true }));
    const targetTime = Math.max(0, seg.startTime - 1.5);
    lastSkippedUuidRef.current = null;
    p.seekTo(targetTime, true);
    p.playVideo();
  };

  const handleAddCustomSegment = (e: React.FormEvent) => {
    e.preventDefault();
    const s = Number(customStart);
    const end = Number(customEnd);
    if (Number.isNaN(s) || Number.isNaN(end) || end <= s || s < 0) return;

    const newSeg: SponsorSegment = {
      category: customCat,
      startTime: s,
      endTime: end,
    };
    setSegments((prev) => [...prev, newSeg].sort((a, b) => a.startTime - b.startTime));
    setSeamlessNoCutMode(false);
    setEnabledCategories((prev) => ({ ...prev, [customCat]: true }));
    setCustomStart('');
    setCustomEnd('');
  };

  const handleChangePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    const p = playerRef.current;
    if (p && playerReadyRef.current && typeof p.setPlaybackRate === 'function') {
      try {
        p.setPlaybackRate(rate);
      } catch {}
    }
  };

  const handleOpenPiPWindow = async () => {
    await pipEngine.openPiP(
      {
        title: activeTrack.title,
        channel: activeTrack.channel,
        videoId: activeTrack.videoId,
        isPlaying,
      },
      {
        onTogglePlay: handleTogglePlay,
        onNext: handleNextTrack,
        onMinimizeToTopNotificationOnly: () => {
          onVideoScreenVisibleChange(false);
          onAutoEnableBackgroundGuard();
          backgroundEngine.sendPhoneTopNotification(activeTrack.title, activeTrack.channel, activeTrack.videoId);
        },
        onStopAndCloseX: () => {
          handlePauseAndStop();
          onStopAllAndClose();
        },
      }
    );
  };

  const handleMinimizeToPhoneTopBar = async () => {
    const nextVisible = !videoScreenVisible;
    onVideoScreenVisibleChange(nextVisible);
    if (!nextVisible) {
      onAutoEnableBackgroundGuard();
      const granted = await backgroundEngine.requestPhoneTopNotificationPermission();
      if (granted) {
        backgroundEngine.sendPhoneTopNotification(activeTrack.title, activeTrack.channel, activeTrack.videoId);
      }
    }
  };

  // Determine how the outer wrapper is positioned:
  // 1) If user closed everything with X or hid the video screen while on another tab, keep the 1x1 invisible pixel alive so audio never stops in the Phone's Top Bar!
  // 2) If on another tab and videoScreenVisible is true, show the closeable Floating Mini-Screen.
  // 3) If on the Player tab, show the full layout (with option to hide the video screen so it plays only in the Phone's Top Notification Shade).
  const hideFloatingBoxCompletely = playerClosedByX || (isMinimizedDock && !videoScreenVisible);

  return (
    <div
      className={
        hideFloatingBoxCompletely
          ? 'fixed bottom-0 right-0 w-[1px] h-[1px] opacity-[0.01] pointer-events-none overflow-hidden -z-10'
          : isMinimizedDock
          ? 'fixed bottom-4 right-4 z-50 w-80 sm:w-96 shadow-2xl'
          : 'space-y-6'
      }
    >
      {/* Zero-Interruption Mode & Lingering Skip Button Hunter Control Bar */}
      {!isMinimizedDock && (
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>
                Telefonun Üst Bildirim Sekmesinde Çalma & Otomatik Arkaplan Kalkanı
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong>Uygulama İçinde Değil, Telefonun Üst Sekmesinde Çalar:</strong> Videonun sağ üstündeki{' '}
              <strong>&ldquo;Ekranı Kapat (Telefon Üst Sekmesinde Çalsın)&rdquo;</strong> butonuna bastığınızda veya
              uygulamayı arkaplana aldığınızda görüntü kapanır; tıpkı YT Music gibi{' '}
              <strong>telefonunuzun üst bildirim çekmecesinde</strong> çalmaya devam eder ve istediğinizde{' '}
              <strong>&ldquo;X&rdquo; (Çarpı)</strong> ile kapatılır.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href="/api/purestream-youtube-premium.apk"
              download="PureStream-YouTube-Premium.apk"
              onClick={() => {
                setApkClicked(true);
                setApkModalOpen(true);
                downloadDirectApkFile();
              }}
              className={`px-3.5 py-2 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all active:scale-95 whitespace-nowrap shrink-0 cursor-pointer shadow-md ${
                apkClicked ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              {apkClicked
                ? '✓ APK İndiriliyor (PureStream-YouTube-Premium.apk)'
                : 'Direkt .APK İndir (PureStream-YouTube-Premium.apk)'}
            </a>
            <button
              type="button"
              onClick={handleTestLingeringSkipClick}
              className="px-3.5 py-2 bg-emerald-950/80 hover:bg-emerald-900/80 border border-emerald-700/70 text-emerald-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <MousePointerClick className="w-3.5 h-3.5" />
              Skip Avcısını Test Et ({skipHunterClicksCount})
            </button>
            <button
              type="button"
              onClick={onOpenExtensionTab}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              v3.1 Eklentisini İndir
            </button>
          </div>
        </div>
      )}

      <ApkDownloadModal isOpen={apkModalOpen} onClose={() => setApkModalOpen(false)} />

      {/* Live YouTube & YT Music Search + URL Bar */}
      {!isMinimizedDock && (
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
          <form onSubmit={handleSearchOrUrlSubmit} className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <label htmlFor="yt-search-input" className="sr-only">
                YouTube / YT Music Şarkı Ara veya Bağlantı Yapıştır
              </label>
              <input
                id="yt-search-input"
                type="text"
                value={searchOrUrlInput}
                onChange={(e) => setSearchOrUrlInput(e.target.value)}
                placeholder="Şarkı veya video adını yazıp aratın (örn: Duman, Tarkan, Sezen Aksu) veya YouTube linki yapıştırın..."
                className="w-full pl-9 pr-3.5 py-2.5 bg-[#0B0F17] border border-slate-800 rounded-lg text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
              />
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="submit"
                disabled={isSearching}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
              >
                {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                {isSearching ? 'Aranıyor...' : 'Kesintisiz Ara & Oynat'}
              </button>
              <button
                type="button"
                onClick={handleMinimizeToPhoneTopBar}
                className={`px-3.5 py-2.5 border rounded-lg text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  !videoScreenVisible
                    ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
                    : 'bg-[#0B0F17] border-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                {videoScreenVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {videoScreenVisible ? 'Ekranı Kapat (Telefon Üst Sekmesinde Çalsın)' : 'Video Ekranını Göster'}
              </button>
            </div>
          </form>
          {searchError && <p className="text-xs text-rose-400 mt-2">{searchError}</p>}
        </div>
      )}

      {/* Main Split Grid: Player + Search/Curated Queue */}
      <div className={isMinimizedDock ? 'block' : 'grid grid-cols-1 lg:grid-cols-12 gap-6 items-start'}>
        <div className={isMinimizedDock ? 'w-full' : 'lg:col-span-8 space-y-4'}>
          <div className="bg-[#111827] border-2 border-slate-700 rounded-xl overflow-hidden">
            {/* Top Header of the Player Box (With Minimize to Phone Top Bar & Close 'X' Button!) */}
            <div className="px-3.5 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-[11px] font-mono text-emerald-400 shrink-0">
                  {videoScreenVisible ? 'CANLI EKRAN' : 'TELEFON ÜST BİLDİRİM SEKMESİNDE ÇALIYOR'}
                </span>
                <span className="text-slate-600">·</span>
                <p className="text-xs font-semibold text-white truncate">{activeTrack.title}</p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {isMinimizedDock && (
                  <button
                    type="button"
                    onClick={onExpandToPlayerTab}
                    title="Tam Ekran Oynatıcıya Dön"
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium rounded flex items-center gap-1 cursor-pointer"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>Büyüt</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleMinimizeToPhoneTopBar}
                  title="Ekranı kapat, YT Music gibi yalnızca telefonun üst bildirim sekmesinde çalmaya devam etsin"
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium rounded flex items-center gap-1 cursor-pointer"
                >
                  {videoScreenVisible ? (
                    <>
                      <Minimize2 className="w-3 h-3 text-emerald-400" />
                      <span>{isMinimizedDock ? 'Ekranı Kapat (Telefon Üst Sekmesi)' : 'Ekranı Kapat (Telefon Üst Sekmesinde Çalsın)'}</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3 h-3 text-emerald-400" />
                      <span>Ekranı Aç</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handlePauseAndStop();
                    onStopAllAndClose();
                  }}
                  title="Oynatıcıyı tamamen kapat ve durdur (X)"
                  className="p-1 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!isMinimizedDock && lastSkipBanner && (
              <div className="px-4 py-2.5 bg-emerald-950/90 border-b border-emerald-800/80 flex items-center justify-between text-xs text-emerald-200">
                <span className="font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  {lastSkipBanner}
                </span>
                <span className="font-mono text-emerald-400 shrink-0 ml-2">Kesintisiz Geçildi</span>
              </div>
            )}

            {/* Video Container — Never display:none so audio keeps playing in the Phone's Top Notification Bar when screen is hidden */}
            <div
              className={`relative bg-slate-950 w-full overflow-hidden transition-all ${
                !videoScreenVisible
                  ? 'h-[1px] opacity-[0.01] pointer-events-none'
                  : isMinimizedDock
                  ? 'h-36'
                  : 'aspect-video'
              }`}
            >
              <div ref={playerHostRef} className="w-full h-full" />
            </div>

            {!videoScreenVisible && !isMinimizedDock && (
              <div className="p-5 bg-gradient-to-r from-slate-900 via-[#111827] to-slate-900 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Headphones className="w-8 h-8 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Video Ekranı Kapatıldı — Telefonunuzun Üst Bildirim Sekmesinde Çalıyor
                    </p>
                    <p className="text-xs text-slate-400">
                      Tıpkı YT Music gibi telefonunuzun üstten çekilen bildirim çubuğundan (MediaSession) kontrol
                      edebilir veya çarpı (X) ile tamamen kapatabilirsiniz.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onVideoScreenVisibleChange(true)}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg shrink-0 cursor-pointer"
                  >
                    Video Ekranını Tekrar Aç
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handlePauseAndStop();
                      onStopAllAndClose();
                    }}
                    className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Tamamen Kapat (X)</span>
                  </button>
                </div>
              </div>
            )}

            <div className={isMinimizedDock ? 'p-2.5 bg-slate-900' : 'p-4 space-y-4'}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {!isMinimizedDock && (
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-slate-100 truncate">{activeTrack.title}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {activeTrack.channel} · {activeTrack.platform} ·{' '}
                      {seamlessNoCutMode
                        ? 'Sıfır Kesinti Modu (Video Bölünmez, Yalnızca Reklam Yok Edilir)'
                        : 'Video İçi Sponsor Atlama Açık'}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto justify-between sm:justify-end">
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {isPlaying ? 'Duraklat' : 'Oynat'}
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
                    {isMuted ? 'Sesi Aç' : 'Sessiz'}
                  </button>
                  <button
                    type="button"
                    onClick={handleNextTrack}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    Sonraki
                  </button>
                  {!isMinimizedDock && (
                    <button
                      type="button"
                      onClick={handleOpenPiPWindow}
                      title="YouTube Premium Resim İçinde Resim (PiP) Yüzen Pencereyi Aç"
                      className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <PictureInPicture2 className="w-3.5 h-3.5" />
                      <span>PiP Yüzen Pencere</span>
                    </button>
                  )}
                </div>
              </div>

              {/* YOUTUBE PREMIUM FEATURE BAR: Video vs Audio-Only (Top Notification), Playback Speed, Repeat One, Sleep Timer */}
              {!isMinimizedDock && (
                <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded-lg flex flex-wrap items-center justify-between gap-3">
                  {/* Video vs Audio-Only (Phone Top Notification) Switcher */}
                  <div className="flex items-center gap-1 bg-[#111827] border border-slate-800 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => onVideoScreenVisibleChange(true)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded flex items-center gap-1.5 cursor-pointer ${
                        videoScreenVisible ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <MonitorPlay className="w-3.5 h-3.5" />
                      <span>Video Modu</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleMinimizeToPhoneTopBar}
                      className={`px-2.5 py-1 text-xs font-semibold rounded flex items-center gap-1.5 cursor-pointer ${
                        !videoScreenVisible ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Headphones className="w-3.5 h-3.5" />
                      <span>Yalnızca Ses (Telefon Üst Sekmesi)</span>
                    </button>
                  </div>

                  {/* Playback Speed (0.75x - 2x) */}
                  <div className="flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[11px] text-slate-400">Hız:</span>
                    {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => handleChangePlaybackRate(rate)}
                        className={`px-2 py-0.5 text-[11px] font-mono rounded cursor-pointer ${
                          playbackRate === rate
                            ? 'bg-rose-600 text-white font-semibold'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>

                  {/* Repeat One & Sleep Timer */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRepeatOneTrack((r) => !r)}
                      className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 cursor-pointer ${
                        repeatOneTrack
                          ? 'bg-emerald-600/25 border border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      <span>{repeatOneTrack ? 'Tekrar: Açık' : 'Tekrarla'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setSleepTimerSec((prev) => (prev === null ? 15 * 60 : prev > 15 * 60 ? null : 30 * 60))
                      }
                      className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 cursor-pointer ${
                        sleepTimerSec !== null
                          ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <Timer className="w-3.5 h-3.5" />
                      <span className="font-mono">
                        {sleepTimerSec !== null ? `Uyku: ${formatTime(sleepTimerSec)}` : 'Uyku Zamanlayıcı'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {!isMinimizedDock && (
                <>
                  <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-200">Akış Davranışı Seçimi</p>
                      <p className="text-[11px] text-slate-400">
                        Videonun içindeki sahnelerin hiç kesilmemesini mi yoksa sponsor anlatımlarının da sarılmasını mı
                        istersiniz?
                      </p>
                    </div>
                    <div className="flex items-center gap-1 p-1 bg-[#111827] border border-slate-800 rounded-lg shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleSeamlessMode(true)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          seamlessNoCutMode ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Sadece Reklam Kaybolsun (Kesintisiz)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleSeamlessMode(false)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          !seamlessNoCutMode ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Video İçi Sponsorları da Atla
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                      <span>{formatTime(currentTime)}</span>
                      <span>
                        {seamlessNoCutMode
                          ? 'Sıfır Kesinti Modu Aktif · Toplam Süre ' + formatTime(duration)
                          : `${segments.length} Sponsor Atlama Noktası · Toplam Süre ${formatTime(duration)}`}
                      </span>
                    </div>
                    <div className="relative h-2.5 w-full bg-[#0B0F17] border border-slate-800 rounded overflow-hidden">
                      <div
                        className="absolute top-0 bottom-0 left-0 bg-emerald-500/70 transition-all"
                        style={{
                          width: `${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%`,
                        }}
                      />
                      {!seamlessNoCutMode &&
                        segments.map((seg, i) => {
                          if (!enabledCategories[seg.category] || duration <= 0) return null;
                          const leftPct = Math.max(0, Math.min(100, (seg.startTime / duration) * 100));
                          const widthPct = Math.max(
                            1,
                            Math.min(100 - leftPct, ((seg.endTime - seg.startTime) / duration) * 100)
                          );
                          const cat = CATEGORY_LABELS[seg.category] || CATEGORY_LABELS.sponsor;
                          return (
                            <div
                              key={`${seg.startTime}-${i}`}
                              title={`${cat.label}: ${formatTime(seg.startTime)} - ${formatTime(seg.endTime)}`}
                              style={{ left: `${leftPct}%`, width: `${widthPct}%`, backgroundColor: cat.hex }}
                              className="absolute top-0 bottom-0 opacity-90"
                            />
                          );
                        })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {!isMinimizedDock && !seamlessNoCutMode && (
            <div className="bg-[#111827] border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">
                  Video İçi SponsorBlock Kategorileri (İsteğe Bağlı)
                </h3>
                {loadingSegments && (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Sorgulanıyor...
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {(Object.keys(CATEGORY_LABELS) as SponsorCategory[]).map((cat) => {
                  const info = CATEGORY_LABELS[cat];
                  const checked = enabledCategories[cat];
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() =>
                        setEnabledCategories((prev) => ({
                          ...prev,
                          [cat]: !prev[cat],
                        }))
                      }
                      className={`px-3 py-2 rounded-lg border text-left text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                        checked
                          ? 'bg-[#0B0F17] border-slate-700 text-slate-100'
                          : 'bg-[#0B0F17]/40 border-slate-800/60 text-slate-500'
                      }`}
                    >
                      <span className="truncate pr-2">{info.label}</span>
                      <span className="font-mono text-[11px] shrink-0">{checked ? 'AÇIK' : 'KAPALI'}</span>
                    </button>
                  );
                })}
              </div>

              {segments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {segments.map((seg, idx) => {
                    const info = CATEGORY_LABELS[seg.category] || CATEGORY_LABELS.sponsor;
                    return (
                      <button
                        key={`${seg.startTime}-${idx}`}
                        type="button"
                        onClick={() => handleJumpToSegmentTest(seg)}
                        className="px-3 py-1.5 bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 rounded-md text-xs text-slate-200 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <FastForward className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{info.label}</span>
                        <span className="font-mono text-slate-400">
                          {formatTime(seg.startTime)} → {formatTime(seg.endTime)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <form onSubmit={handleAddCustomSegment} className="pt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 mr-1">Manuel Atlama Aralığı:</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Başlangıç (sn)"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-28 px-2.5 py-1.5 bg-[#0B0F17] border border-slate-800 rounded text-xs font-mono text-slate-200"
                />
                <input
                  type="number"
                  min="1"
                  placeholder="Bitiş (sn)"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-28 px-2.5 py-1.5 bg-[#0B0F17] border border-slate-800 rounded text-xs font-mono text-slate-200"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ekle
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Right 4 Cols: Skip Button Hunter Status & Ready Queue */}
        {!isMinimizedDock && (
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-[#111827] border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">Asılı Kalan &ldquo;Skip&rdquo; Tuşu Avcısı</h3>
                <span className="font-mono text-xs text-emerald-400">
                  {autoClickSkipHunter ? '50ms TARAMA AKTİF' : 'KAPALI'}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Reklam hızlandırıldığında veya bittiğinde ekranda takılı kalan{' '}
                <code className="text-slate-300">.ytp-skip-ad-button</code> ve{' '}
                <code className="text-slate-300">Atla / Skip</code> tuşlarına gerçek fare tıklaması gönderir.
              </p>
              <button
                type="button"
                onClick={() => setAutoClickSkipHunter((v) => !v)}
                className={`w-full py-2 px-3 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  autoClickSkipHunter
                    ? 'bg-emerald-950/70 border border-emerald-700/70 text-emerald-300'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {autoClickSkipHunter
                  ? 'Otomatik Skip Tıklayıcı: AÇIK'
                  : 'Otomatik Skip Tıklayıcıyı Aç'}
              </button>
            </div>

            <div className="bg-[#111827] border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">Otomatik Arkaplan Çalma Kalkanı</h3>
                <span className="font-mono text-xs text-emerald-400">
                  {backgroundGuardActive ? 'OTOMATİK AKTİF' : 'HAZIR'}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                YouTube veya YT Music&apos;i arkaplana aldığınızda (sekme değiştirdiğinizde veya ekranı
                kilitlediğinizde) otomatik devreye girer.
              </p>
              <button
                type="button"
                onClick={onToggleBackgroundGuard}
                className={`w-full py-2.5 px-4 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  backgroundGuardActive
                    ? 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                {backgroundGuardActive
                  ? 'Arkaplan Koruması Açık (Durdurmak İçin Tıklayın)'
                  : 'Arkaplan Korumasını Şimdi Başlat'}
              </button>
            </div>

            <div className="bg-[#111827] border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">Oynatma Listesi & Arama Sonuçları</h3>
                <span className="text-xs font-mono text-slate-400">{tracks.length} içerik</span>
              </div>
              <div className="divide-y divide-slate-800/80 max-h-[420px] overflow-y-auto">
                {tracks.map((track) => {
                  const isSelected = track.id === activeTrack.id;
                  return (
                    <button
                      key={track.id}
                      type="button"
                      onClick={() => {
                        onPlayerClosedByXChange(false);
                        onSelectTrack(track);
                      }}
                      className={`w-full py-3 px-2.5 text-left transition-colors flex items-start justify-between gap-3 rounded cursor-pointer ${
                        isSelected ? 'bg-slate-800/70' : 'hover:bg-slate-800/30'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-semibold truncate ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                          {track.title}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                          {track.channel} · {track.categoryLabel}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono text-[11px] text-slate-400 block">
                          {formatTime(track.durationSec)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
