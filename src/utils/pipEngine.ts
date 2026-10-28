// Real OS-Level Picture-in-Picture (PiP) Engine for YouTube Premium Experience
// Uses Document Picture-in-Picture API (Chrome/Edge) with fallback to HTMLCanvasElement -> HTMLVideoElement.requestPictureInPicture() (Android/iOS/Safari)

export interface PiPTrackState {
  title: string;
  channel: string;
  videoId: string;
  isPlaying: boolean;
}

export interface PiPCallbacks {
  onTogglePlay: () => void;
  onNext: () => void;
  onMinimizeToTopNotificationOnly: () => void;
  onStopAndCloseX: () => void;
}

class YouTubePremiumPiPEngine {
  private docPipWindow: Window | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private coverImg: HTMLImageElement | null = null;
  private renderTimer: any = null;
  private currentTrack: PiPTrackState = {
    title: 'PureStream YouTube Premium',
    channel: 'Kesintisiz Akış',
    videoId: '4NRXx6U8ABQ',
    isPlaying: true,
  };

  public async openPiP(track: PiPTrackState, callbacks: PiPCallbacks): Promise<boolean> {
    this.currentTrack = track;

    // 1. Try Document Picture-in-Picture API first (Interactive Always-on-Top OS Mini Window with X & Audio-Only buttons)
    if (typeof window !== 'undefined' && 'documentPictureInPicture' in window) {
      try {
        const dpip = (window as any).documentPictureInPicture;
        if (this.docPipWindow && !this.docPipWindow.closed) {
          this.updateDocPiPContent(this.docPipWindow, track, callbacks);
          return true;
        }
        const pipWin: Window = await dpip.requestWindow({
          width: 360,
          height: 200,
        });
        this.docPipWindow = pipWin;
        this.updateDocPiPContent(pipWin, track, callbacks);
        return true;
      } catch {
        // Fallback to video canvas PiP
      }
    }

    // 2. Fallback: Canvas Stream -> HTMLVideoElement.requestPictureInPicture() (Supported on Mobile & Safari)
    try {
      if (!this.canvasEl) {
        this.canvasEl = document.createElement('canvas');
        this.canvasEl.width = 480;
        this.canvasEl.height = 270;
      }

      this.loadCoverImage(track.videoId);
      this.drawCanvasFrame();

      if (!this.videoEl) {
        this.videoEl = document.createElement('video');
        this.videoEl.muted = true;
        this.videoEl.playsInline = true;
        this.videoEl.style.position = 'fixed';
        this.videoEl.style.bottom = '0';
        this.videoEl.style.right = '0';
        this.videoEl.style.width = '1px';
        this.videoEl.style.height = '1px';
        this.videoEl.style.opacity = '0.01';
        this.videoEl.style.pointerEvents = 'none';
        document.body.appendChild(this.videoEl);
      }

      const stream = (this.canvasEl as any).captureStream
        ? (this.canvasEl as any).captureStream(10)
        : null;
      if (!stream) return false;

      this.videoEl.srcObject = stream;
      await this.videoEl.play();

      if (this.renderTimer) clearInterval(this.renderTimer);
      this.renderTimer = setInterval(() => this.drawCanvasFrame(), 500);

      if ((this.videoEl as any).requestPictureInPicture) {
        await (this.videoEl as any).requestPictureInPicture();
        return true;
      }
    } catch {}

    return false;
  }

  public updateTrack(track: PiPTrackState, callbacks: PiPCallbacks) {
    this.currentTrack = track;
    this.loadCoverImage(track.videoId);
    this.drawCanvasFrame();
    if (this.docPipWindow && !this.docPipWindow.closed) {
      this.updateDocPiPContent(this.docPipWindow, track, callbacks);
    }
  }

  public closePiP() {
    try {
      if (this.docPipWindow && !this.docPipWindow.closed) {
        this.docPipWindow.close();
        this.docPipWindow = null;
      }
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(() => {});
      }
      if (this.renderTimer) {
        clearInterval(this.renderTimer);
        this.renderTimer = null;
      }
    } catch {}
  }

  private loadCoverImage(videoId: string) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    img.onload = () => {
      this.coverImg = img;
      this.drawCanvasFrame();
    };
  }

  private drawCanvasFrame() {
    if (!this.canvasEl) return;
    const ctx = this.canvasEl.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0B0F17';
    ctx.fillRect(0, 0, 480, 270);

    if (this.coverImg) {
      try {
        ctx.globalAlpha = 0.35;
        ctx.drawImage(this.coverImg, 0, 0, 480, 270);
        ctx.globalAlpha = 1;
      } catch {}
    }

    ctx.fillStyle = '#10B981';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('PURESTREAM YOUTUBE PREMIUM · PiP', 24, 42);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(this.currentTrack.title.slice(0, 34), 24, 130);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '15px sans-serif';
    ctx.fillText(this.currentTrack.channel.slice(0, 40), 24, 162);

    ctx.fillStyle = '#E11D48';
    ctx.fillRect(24, 215, 432, 6);
  }

  private updateDocPiPContent(pipWin: Window, track: PiPTrackState, callbacks: PiPCallbacks) {
    const doc = pipWin.document;
    doc.body.style.margin = '0';
    doc.body.style.backgroundColor = '#0B0F17';
    doc.body.style.color = '#F8FAFC';
    doc.body.style.fontFamily = ' system-ui, -apple-system, sans-serif';
    doc.body.style.padding = '12px';
    doc.body.style.boxSizing = 'border-box';

    doc.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1E293B;padding-bottom:8px;margin-bottom:10px;">
        <span style="font-size:11px;font-family:monospace;color:#10B981;font-weight:700;">YOUTUBE PREMIUM · PiP</span>
        <div style="display:flex;gap:6px;">
          <button id="pip-hide-screen" style="background:#1E293B;color:#E2E8F0;border:1px solid #334155;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;">
            Ekranı Kapat (Üst Bildirimde Çal)
          </button>
          <button id="pip-close-x" title="Tamamen Kapat (X)" style="background:#E11D48;color:#FFFFFF;border:none;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;">
            ✕
          </button>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <img src="https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg" style="width:68px;height:48px;object-fit:cover;border-radius:6px;border:1px solid #334155;" />
        <div style="min-width:0;flex:1;overflow:hidden;">
          <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${track.title}</div>
          <div style="font-size:11px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${track.channel}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="pip-play" style="flex:1;background:#E11D48;color:#FFFFFF;border:none;border-radius:6px;padding:8px;font-size:12px;font-weight:700;cursor:pointer;">
          ${track.isPlaying ? 'Duraklat' : 'Oynat'}
        </button>
        <button id="pip-next" style="background:#1E293B;color:#FFFFFF;border:1px solid #334155;border-radius:6px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;">
          Sonraki ⏭
        </button>
      </div>
    `;

    doc.getElementById('pip-play')?.addEventListener('click', () => {
      callbacks.onTogglePlay();
    });
    doc.getElementById('pip-next')?.addEventListener('click', () => {
      callbacks.onNext();
    });
    doc.getElementById('pip-hide-screen')?.addEventListener('click', () => {
      pipWin.close();
      callbacks.onMinimizeToTopNotificationOnly();
    });
    doc.getElementById('pip-close-x')?.addEventListener('click', () => {
      pipWin.close();
      callbacks.onStopAndCloseX();
    });
  }
}

export const pipEngine = new YouTubePremiumPiPEngine();
