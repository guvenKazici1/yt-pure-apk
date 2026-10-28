import { ProtectionRule } from '../types';

export interface ExtensionConfig {
  skipButtonClick: boolean;
  lingerSkipHunter: boolean;
  seamlessAdVanish: boolean;
  muteDuringAd: boolean;
  hidePageBanners: boolean;
  preventMusicPause: boolean;
  enableSponsorBlock: boolean;
  keepBackgroundPlay: boolean;
}

export function rulesToConfig(rules: ProtectionRule[]): ExtensionConfig {
  const isEnabled = (id: string, fallback = true) => rules.find((r) => r.id === id)?.enabled ?? fallback;
  return {
    skipButtonClick: isEnabled('rule-skip-btn', true),
    lingerSkipHunter: isEnabled('rule-linger-skip', true),
    seamlessAdVanish: isEnabled('rule-16x-speed', true),
    muteDuringAd: isEnabled('rule-auto-mute', true),
    hidePageBanners: isEnabled('rule-dom-banners', true),
    preventMusicPause: isEnabled('rule-ytmusic-nonstop', true),
    enableSponsorBlock: isEnabled('rule-sponsorblock', false),
    keepBackgroundPlay: isEnabled('rule-bg-visibility', true),
  };
}

export function generateContentScript(config: ExtensionConfig): string {
  return `/**
 * PureStream v3.1 — Kesintisiz Reklam & Skip Tuşu Avcısı (Siyah Ekran Korumalı)
 * Video ekranını ASLA karartmaz, görüntüyü kesmez; yalnızca reklamı geçer ve kalan Skip tuşuna otomatik basar.
 */
(function () {
  'use strict';

  const CONFIG = ${JSON.stringify(config, null, 2)};

  const SKIP_SELECTORS = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-slot',
    '.ytp-ad-skip-button-slot button',
    '.ytp-ad-skip-button-container',
    '.ytp-ad-skip-button-container button',
    '.ytp-ad-player-overlay-skip-or-preview button',
    'button.ytp-ad-overlay-close-button',
    '.ytp-ad-overlay-close-container button',
    '[id^="skip-button"]',
    'button[aria-label*="Atla" i]',
    'button[aria-label*="Reklamı geç" i]',
    'button[aria-label*="Reklamları geç" i]',
    'button[aria-label*="Skip" i]'
  ];

  const SKIP_TEXT_PATTERNS = [
    /^atla$/i,
    /^reklam[ıi] ge[cç]$/i,
    /^reklamlar[ıi] ge[cç]$/i,
    /^skip$/i,
    /^skip ad$/i,
    /^skip ads$/i
  ];

  // Yalnızca sayfa dışı bannerları gizle; video oynatıcıya veya ekrana ASLA dokunma
  const SAFE_BANNER_SELECTORS = [
    'ytd-ad-slot-renderer',
    'ytd-in-feed-ad-layout-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-banner-promo-renderer',
    'ytmusic-mealbar-promo-renderer',
    '.ytp-ad-overlay-container',
    '#masthead-ad'
  ];

  let wasMutedByShield = false;
  let savedUserPlaybackRate = 1;

  // 1. Güvenli CSS: Video ekranının kararmasını (brightness/opacity) kesin olarak engelle
  const style = document.createElement('style');
  style.id = 'purestream-safe-shield-style';
  style.textContent = \`
    \${CONFIG.hidePageBanners ? SAFE_BANNER_SELECTORS.join(', ') + ' { display: none !important; }' : ''}
    /* Video ekranının kararmasını veya kaybolmasını her zaman engelle */
    #movie_player video.html5-main-video,
    video {
      filter: none !important;
      opacity: 1 !important;
      visibility: visible !important;
    }
  \`;
  (document.head || document.documentElement).appendChild(style);

  // Eğer önceki sürümden kalan karartma stili varsa anında sil
  const oldStyle = document.getElementById('purestream-seamless-shield-style');
  if (oldStyle) oldStyle.remove();

  // 2. Arkaplanda Çalma Kilidini Aç
  if (CONFIG.keepBackgroundPlay) {
    try {
      Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
      document.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
    } catch {}
  }

  // 3. Görünür olan bir butona gerçek fare tıklaması gönder
  function triggerSafeClick(el) {
    if (!el) return false;
    try {
      const rect = el.getBoundingClientRect();
      // Yalnızca ekranda gerçekten var olan/görünür butonlara tıkla
      if (rect.width === 0 && rect.height === 0) {
        el.style.display = 'block';
        el.style.visibility = 'visible';
        el.style.opacity = '1';
      }
      el.removeAttribute('disabled');

      const clientX = rect.left + (rect.width > 0 ? rect.width / 2 : 10);
      const clientY = rect.top + (rect.height > 0 ? rect.height / 2 : 10);

      const eventOpts = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX,
        clientY,
        button: 0,
        buttons: 1
      };

      el.dispatchEvent(new PointerEvent('pointerdown', eventOpts));
      el.dispatchEvent(new MouseEvent('mousedown', eventOpts));
      el.dispatchEvent(new PointerEvent('pointerup', eventOpts));
      el.dispatchEvent(new MouseEvent('mouseup', eventOpts));
      el.dispatchEvent(new MouseEvent('click', eventOpts));
      if (typeof el.click === 'function') {
        el.click();
      }
      return true;
    } catch {
      return false;
    }
  }

  // 4. Ekranda Kalan "Skip / Atla" Tuşlarını Bul ve Tıkla
  function huntAndClickSkipButtons() {
    for (const sel of SKIP_SELECTORS) {
      const elements = document.querySelectorAll(sel);
      elements.forEach((btn) => {
        triggerSafeClick(btn);
        const innerBtn = btn.querySelector('button, .ytp-skip-ad-button__text, .ytp-ad-skip-button-text');
        if (innerBtn) triggerSafeClick(innerBtn);
      });
    }

    if (CONFIG.lingerSkipHunter) {
      const adContainers = document.querySelectorAll('.video-ads, .ytp-ad-module, .ytp-ad-player-overlay, .ytp-ad-player-overlay-layout');
      adContainers.forEach((container) => {
        const candidates = container.querySelectorAll('button, [role="button"]');
        candidates.forEach((node) => {
          const txt = (node.textContent || '').trim();
          if (SKIP_TEXT_PATTERNS.some((rx) => rx.test(txt))) {
            triggerSafeClick(node);
          }
        });
      });
    }
  }

  // 5. Ana Döngü (Görüntüyü karartmadan ve ana videoyu bozmadan reklam geçme)
  function safeAdShieldTick() {
    const player = document.getElementById('movie_player');
    const video = document.querySelector('#movie_player video.html5-main-video') || document.querySelector('video');

    if (CONFIG.skipButtonClick || CONFIG.lingerSkipHunter) {
      huntAndClickSkipButtons();
    }

    // Gerçekten reklam oynadığını doğrula (hem .ad-showing sınıfı hem de aktif reklam katmanı olmalı)
    const hasAdOverlay = document.querySelector(
      '.ytp-ad-player-overlay, .ytp-ad-player-overlay-layout, .ytp-ad-preview-container, .ytp-ad-skip-button-slot'
    );
    const isAdShowing =
      player &&
      (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) &&
      hasAdOverlay !== null;

    if (video && isAdShowing) {
      if (CONFIG.muteDuringAd && !video.muted) {
        video.muted = true;
        wasMutedByShield = true;
      }

      if (CONFIG.seamlessAdVanish) {
        if (video.playbackRate <= 2 && video.playbackRate > 0) {
          savedUserPlaybackRate = video.playbackRate;
        }
        try {
          video.playbackRate = 16.0;
        } catch {}

        // Yalnızca kısa reklam videolarını (<= 120 sn) ileri sar, ana videoyu ASLA sarma
        if (Number.isFinite(video.duration) && video.duration > 0.5 && video.duration <= 120) {
          if (video.currentTime < video.duration - 0.3) {
            try {
              video.currentTime = video.duration - 0.1;
            } catch {}
          }
        }
      }

      huntAndClickSkipButtons();
    } else if (video && !isAdShowing) {
      // Asıl videoda hızı ve sesi normalde tut
      if (video.playbackRate > 2) {
        try {
          video.playbackRate = savedUserPlaybackRate || 1.0;
        } catch {}
      }
      if (wasMutedByShield) {
        video.muted = false;
        wasMutedByShield = false;
      }
    }

    // YT Music & YouTube "Oynatmaya devam edilsin mi?" kesintisini engelle
    if (CONFIG.preventMusicPause) {
      const dialogs = document.querySelectorAll('yt-confirm-dialog-renderer, ytmusic-you-there-renderer');
      dialogs.forEach((d) => {
        const popup = d.closest('tp-yt-paper-dialog');
        if (!popup || popup.style.display !== 'none') {
          const btn = d.querySelector('#confirm-button button, yt-button-renderer#confirm-button button, button');
          if (btn) triggerSafeClick(btn);
          if (video && video.paused) video.play().catch(() => {});
        }
      });
    }
  }

  const observer = new MutationObserver(() => safeAdShieldTick());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'disabled']
  });

  setInterval(safeAdShieldTick, 80);
})();
`;
}

export function generateManifestJson(): string {
  return JSON.stringify(
    {
      manifest_version: 3,
      name: 'PureStream v3.1 — Kesintisiz YouTube & YT Music Reklam Kalkanı',
      version: '3.1.0',
      description:
        'Ekranı karartmadan ve videoda kesinti yaratmadan reklamları geçer, ekranda kalan Skip/Atla tuşlarına otomatik tıklar.',
      permissions: ['storage'],
      host_permissions: ['*://*.youtube.com/*', '*://music.youtube.com/*'],
      content_scripts: [
        {
          matches: ['*://*.youtube.com/*', '*://music.youtube.com/*'],
          js: ['content.js'],
          run_at: 'document_start',
          all_frames: true,
        },
      ],
    },
    null,
    2
  );
}

export function generateUserscript(config: ExtensionConfig): string {
  const coreScript = generateContentScript(config);
  return `// ==UserScript==
// @name         PureStream v3.1 — Kesintisiz YouTube & YT Music Reklam ve Skip Avcısı
// @namespace    https://purestream.local/
// @version      3.1.0
// @description  Ekranı karartmadan ve videoda kesinti yapmadan reklamları geçer, ekranda kalan Skip/Atla tuşlarına otomatik tıklar.
// @author       PureStream
// @match        *://*.youtube.com/*
// @match        *://music.youtube.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

${coreScript}`;
}

export function generateBookmarklet(config: ExtensionConfig): string {
  const inlineCode = `javascript:(function(){const old=document.getElementById('purestream-seamless-shield-style');if(old)old.remove();const st=document.createElement('style');st.textContent='video{filter:none!important;opacity:1!important;visibility:visible!important;}';document.head.appendChild(st);const fireClick=(el)=>{if(!el)return;el.removeAttribute('disabled');['pointerdown','mousedown','pointerup','mouseup','click'].forEach(t=>el.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true,view:window})));if(el.click)el.click();};setInterval(()=>{const p=document.getElementById('movie_player');const v=document.querySelector('video');document.querySelectorAll('.ytp-skip-ad-button,.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-ad-skip-button-slot button,button.ytp-ad-overlay-close-button,[id^="skip-button"],button[aria-label*="Atla" i],button[aria-label*="Skip" i]').forEach(b=>fireClick(b));const hasOverlay=document.querySelector('.ytp-ad-player-overlay,.ytp-ad-player-overlay-layout,.ytp-ad-skip-button-slot');const isAd=p&&(p.classList.contains('ad-showing')||p.classList.contains('ad-interrupting'))&&hasOverlay;if(isAd&&v){${config.muteDuringAd ? 'v.muted=true;' : ''}${config.seamlessAdVanish ? 'v.playbackRate=16;if(isFinite(v.duration)&&v.duration>0.5&&v.duration<=120&&v.currentTime<v.duration-0.2)v.currentTime=v.duration-0.1;' : ''}}else if(v&&!isAd&&v.playbackRate>2){v.playbackRate=1;v.muted=false;}},80);})();`;
  return inlineCode;
}

function crc32(bytes: Uint8Array): number {
  let c = -1;
  for (let i = 0; i < bytes.length; i++) {
    c = (c >>> 8) ^ CRC_TABLE[(c ^ bytes[i]) & 0xff];
  }
  return (c ^ -1) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function createExtensionZipBlob(config: ExtensionConfig): Blob {
  const readmeText = `PURESTREAM v3.1 — SİYAH EKRAN KORUMALI KESİNTİSİZ REKLAM & SKIP AVCISI
========================================================================

Düzeltme (v3.1):
- Video ekranını karartan CSS filtresi tamamen kaldırıldı; video görüntüsü hiçbir zaman gitmez veya kararmaz.
- Yalnızca doğrulanmış reklam katmanı (< 120 sn) oynarken reklam hızlandırılır ve ekranda kalan Skip/Atla tuşuna basılır.

Kurulum:
1. ZIP dosyasını klasöre çıkartın.
2. chrome://extensions adresinde Geliştirici Modu'nu açıp "Paketlenmemiş öğe yükle" ile klasörü seçin.
3. Açık olan YouTube sekmesini bir kez yenileyin (F5).
`;

  const files: { name: string; content: string }[] = [
    { name: 'manifest.json', content: generateManifestJson() },
    { name: 'content.js', content: generateContentScript(config) },
    { name: 'BENI-OKU-KURULUM.txt', content: readmeText },
  ];

  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralChunks.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralSize = centralChunks.reduce((acc, c) => acc + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...localChunks, ...centralChunks, eocd], { type: 'application/zip' });
}
