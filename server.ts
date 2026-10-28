import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseDurationToSeconds(text: string): number {
  if (!text) return 240;
  const parts = text.split(':').map((p) => parseInt(p.trim(), 10));
  if (parts.some((n) => Number.isNaN(n))) return 240;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 240;
}

async function searchYouTubeDirect(query: string) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=tr`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  if (!res.ok) {
    throw new Error(`YouTube HTTP ${res.status}`);
  }

  const html = await res.text();
  const marker = 'var ytInitialData = ';
  const startIdx = html.indexOf(marker);
  if (startIdx === -1) {
    throw new Error('ytInitialData not found');
  }

  const jsonStart = startIdx + marker.length;
  const scriptEnd = html.indexOf(';</script>', jsonStart);
  if (scriptEnd === -1) {
    throw new Error('ytInitialData end not found');
  }

  const rawJson = html.slice(jsonStart, scriptEnd);
  const data = JSON.parse(rawJson);

  const contents =
    data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

  const results: Array<{
    videoId: string;
    title: string;
    channel: string;
    durationSec: number;
    durationText: string;
  }> = [];

  for (const section of contents) {
    const items = section?.itemSectionRenderer?.contents || [];
    for (const item of items) {
      const v = item?.videoRenderer;
      if (!v || !v.videoId) continue;

      const title =
        v.title?.runs?.map((r: any) => r.text).join('') ||
        v.title?.simpleText ||
        'YouTube Akışı';
      const channel =
        v.ownerText?.runs?.[0]?.text ||
        v.longBylineText?.runs?.[0]?.text ||
        'YouTube Kanalı';
      const durationText = v.lengthText?.simpleText || '04:00';
      const durationSec = parseDurationToSeconds(durationText);

      results.push({
        videoId: v.videoId,
        title,
        channel,
        durationSec,
        durationText,
      });

      if (results.length >= 12) break;
    }
    if (results.length >= 12) break;
  }

  return results;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get('/api/yt-search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) {
      res.status(400).json({ error: 'Arama terimi gerekli' });
      return;
    }

    try {
      const results = await searchYouTubeDirect(q);
      res.json({ results });
    } catch (err: any) {
      res.status(500).json({
        error: 'Arama sırasında hata oluştu',
        details: err?.message || 'Unknown error',
      });
    }
  });

  const serveSignedApk = (_req: express.Request, res: express.Response) => {
    const apkPath = path.join(__dirname, 'public', 'PureStream-YouTube-Premium.apk');
    if (!fs.existsSync(apkPath)) {
      res.status(404).send('APK file not found');
      return;
    }
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="PureStream-YouTube-Premium.apk"');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(apkPath);
  };

  app.all('/api/purestream-youtube-premium.apk', serveSignedApk);
  app.all('/PureStream-YouTube-Premium.apk', serveSignedApk);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PureStream Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
