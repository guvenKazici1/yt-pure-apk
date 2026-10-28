// Manages Real Phone Top Notification Bar (Android / iOS MediaSession + System Notification)
// and Background Keep-Alive using an HTML5 <audio> WAV stream, Screen Wake Lock API,
// and visibilitychange/pagehide protection so playback continues in the PHONE'S top notification shade.

function createSilentWavBlobUrl(durationSec = 10): string {
  const sampleRate = 8000;
  const numSamples = sampleRate * durationSec;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true); // 16-bit
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Fill with sub-audible 1-bit dithering so Android/iOS OS treats it as an active media stream
  // and pins the Media Player Card into the phone's top notification shade.
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(44 + i * 2, i % 2 === 0 ? 1 : -1, true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

export interface MediaSessionHandlers {
  onPlay?: () => void;
  onPause?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onStop?: () => void;
}

class BackgroundKeepAliveEngine {
  private audioEl: HTMLAudioElement | null = null;
  private wavUrl: string | null = null;
  private wakeLock: any = null;
  private activeNotification: Notification | null = null;
  private isRunning = false;
  private lastHandlers: MediaSessionHandlers = {};

  public async start(
    trackTitle = 'PureStream Arkaplan Kalkanı Aktif',
    artist = 'YouTube & YT Music Kesintisiz Mod',
    videoId = '4NRXx6U8ABQ',
    handlers?: MediaSessionHandlers
  ): Promise<boolean> {
    if (handlers) {
      this.lastHandlers = { ...this.lastHandlers, ...handlers };
    }

    if (this.isRunning && this.audioEl) {
      try {
        await this.audioEl.play();
      } catch {}
      this.updateMediaSession(trackTitle, artist, videoId, this.lastHandlers);
      return true;
    }

    try {
      if (!this.wavUrl) {
        this.wavUrl = createSilentWavBlobUrl(10);
      }

      if (!this.audioEl) {
        this.audioEl = document.createElement('audio');
        this.audioEl.src = this.wavUrl;
        this.audioEl.loop = true;
        this.audioEl.volume = 0.01;
        this.audioEl.setAttribute('playsinline', 'true');
        this.audioEl.style.display = 'none';
        document.body.appendChild(this.audioEl);
      }

      await this.audioEl.play();

      // Request Screen Wake Lock so Android doesn't throttle while screen is on
      if ('wakeLock' in navigator) {
        try {
          this.wakeLock = await (navigator as any).wakeLock.request('screen');
        } catch {
          // Optional if battery saver is active
        }
      }

      // Override Page Visibility API in current tab so embedded players don't pause on minimize
      try {
        Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
        Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
      } catch {}

      this.updateMediaSession(trackTitle, artist, videoId, this.lastHandlers);
      this.isRunning = true;
      return true;
    } catch {
      this.updateMediaSession(trackTitle, artist, videoId, this.lastHandlers);
      this.isRunning = true;
      return true;
    }
  }

  public async requestPhoneTopNotificationPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      try {
        const res = await Notification.requestPermission();
        return res === 'granted';
      } catch {
        return false;
      }
    }
    return false;
  }

  public sendPhoneTopNotification(title: string, artist: string, videoId: string) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      if (this.activeNotification) {
        this.activeNotification.close();
      }
      this.activeNotification = new Notification(title, {
        body: `${artist} · Telefon Üst Bildiriminde Kesintisiz Çalıyor (Kapatmak için X / Kaydırın)`,
        icon: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        tag: 'purestream-phone-top-bar',
        silent: true,
      });
      this.activeNotification.onclick = () => {
        window.focus();
      };
    } catch {}
  }

  public updateMediaSession(
    title: string,
    artist: string,
    videoId = '4NRXx6U8ABQ',
    handlers?: MediaSessionHandlers,
    positionSec?: number,
    durationSec?: number
  ) {
    if (handlers) {
      this.lastHandlers = { ...this.lastHandlers, ...handlers };
    }

    if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title,
          artist,
          album: 'YouTube & YT Music · Telefon Üst Bildirim Oynatıcısı',
          artwork: [
            {
              src: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
              sizes: '320x180',
              type: 'image/jpeg',
            },
            {
              src: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              sizes: '480x360',
              type: 'image/jpeg',
            },
          ],
        });

        navigator.mediaSession.playbackState = 'playing';

        if (
          typeof navigator.mediaSession.setPositionState === 'function' &&
          typeof durationSec === 'number' &&
          durationSec > 0 &&
          typeof positionSec === 'number' &&
          positionSec >= 0 &&
          positionSec <= durationSec
        ) {
          try {
            navigator.mediaSession.setPositionState({
              duration: durationSec,
              playbackRate: 1,
              position: positionSec,
            });
          } catch {}
        }

        navigator.mediaSession.setActionHandler('play', () => {
          this.audioEl?.play().catch(() => {});
          this.lastHandlers.onPlay?.();
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
          }
        });

        navigator.mediaSession.setActionHandler('pause', () => {
          this.lastHandlers.onPause?.();
          if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
          }
        });

        navigator.mediaSession.setActionHandler('nexttrack', () => {
          this.lastHandlers.onNext?.();
        });

        navigator.mediaSession.setActionHandler('previoustrack', () => {
          this.lastHandlers.onPrev?.();
        });

        // Fired when user clicks 'X' / swipes away the media notification in the phone's top bar
        navigator.mediaSession.setActionHandler('stop', () => {
          this.stop();
          this.lastHandlers.onStop?.();
        });
      } catch {}
    }
  }

  public stop() {
    try {
      if (this.audioEl) {
        this.audioEl.pause();
      }
      if (this.wakeLock) {
        this.wakeLock.release();
        this.wakeLock = null;
      }
      if (this.activeNotification) {
        this.activeNotification.close();
        this.activeNotification = null;
      }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
        navigator.mediaSession.metadata = null;
      }
    } catch {}
    this.isRunning = false;
  }

  public getStatus(): boolean {
    return this.isRunning;
  }
}

export const backgroundEngine = new BackgroundKeepAliveEngine();
