import { SponsorSegment, SponsorCategory, MediaTrack } from '../types';

export const CATEGORY_LABELS: Record<SponsorCategory, { label: string; color: string; hex: string }> = {
  sponsor: { label: 'Sponsorluk', color: 'bg-emerald-500', hex: '#10B981' },
  selfpromo: { label: 'Öz Tanıtım / Ürün', color: 'bg-amber-500', hex: '#F59E0B' },
  interaction: { label: 'Abone Ol / Beğen Hatırlatması', color: 'bg-sky-500', hex: '#0EA5E9' },
  intro: { label: 'Giriş Jeneriği (İntro)', color: 'bg-indigo-500', hex: '#6366F1' },
  outro: { label: 'Bitiş Ekranı (Outro)', color: 'bg-violet-500', hex: '#8B5CF6' },
  music_offtopic: { label: 'Müzik Dışı Diyalog / Klipte Konuşma', color: 'bg-rose-500', hex: '#F43F5E' },
};

export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Direct 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.slice(1).split('/')[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }
    if (url.hostname.includes('youtube.com')) {
      const v = url.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      const pathParts = url.pathname.split('/').filter(Boolean);
      if ((pathParts[0] === 'shorts' || pathParts[0] === 'embed' || pathParts[0] === 'live') && pathParts[1]) {
        if (/^[a-zA-Z0-9_-]{11}$/.test(pathParts[1])) return pathParts[1];
      }
    }
  } catch {
    // Fallback regex
    const match = trimmed.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
    if (match && match[1]) return match[1];
  }

  return null;
}

export async function fetchSponsorSegments(
  videoId: string,
  categories: SponsorCategory[] = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'music_offtopic']
): Promise<SponsorSegment[]> {
  try {
    const catsParam = encodeURIComponent(JSON.stringify(categories));
    const response = await fetch(
      `https://sponsor.ajay.app/api/skipSegments?videoID=${encodeURIComponent(videoId)}&categories=${catsParam}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data
      .filter((item: any) => Array.isArray(item.segment) && item.segment.length === 2)
      .map((item: any) => ({
        category: (item.category as SponsorCategory) || 'sponsor',
        startTime: Number(item.segment[0]),
        endTime: Number(item.segment[1]),
        UUID: item.UUID,
        actionType: item.actionType || 'skip',
      }))
      .sort((a, b) => a.startTime - b.startTime);
  } catch {
    return [];
  }
}

export const CURATED_TRACKS: MediaTrack[] = [
  {
    id: 'track-1',
    videoId: 'bMknfKXIFA8',
    title: 'React Course - Beginner\'s Tutorial for React JavaScript Library',
    channel: 'freeCodeCamp.org',
    platform: 'YouTube',
    durationSec: 42915,
    categoryLabel: 'Eğitim · Yazılım',
    fallbackSegments: [
      { category: 'intro', startTime: 0, endTime: 28 },
      { category: 'selfpromo', startTime: 165, endTime: 210 },
    ],
  },
  {
    id: 'track-2',
    videoId: 'jfKfPfyJRdk',
    title: 'lofi hip hop radio - beats to relax/study to',
    channel: 'Lofi Girl',
    platform: 'YT Music',
    durationSec: 3600,
    categoryLabel: 'YT Music · Kesintisiz Odak',
    fallbackSegments: [],
  },
  {
    id: 'track-3',
    videoId: '0e3GPea1Tyg',
    title: '$456,000 Squid Game In Real Life!',
    channel: 'MrBeast',
    platform: 'YouTube',
    durationSec: 1542,
    categoryLabel: 'Eğlence · Sponsorlu İçerik Testi',
    fallbackSegments: [
      { category: 'sponsor', startTime: 62, endTime: 132 },
      { category: 'outro', startTime: 1505, endTime: 1542 },
    ],
  },
  {
    id: 'track-4',
    videoId: '4NRXx6U8ABQ',
    title: 'The Weeknd - Blinding Lights (Official Video)',
    channel: 'The Weeknd',
    platform: 'YT Music',
    durationSec: 263,
    categoryLabel: 'YT Music · Klipte Müzik Dışı Bölüm Atla',
    fallbackSegments: [
      { category: 'music_offtopic', startTime: 0, endTime: 21 },
      { category: 'music_offtopic', startTime: 218, endTime: 263 },
    ],
  },
  {
    id: 'track-5',
    videoId: 'LK7-_dgAVQE',
    title: 'Mabel Matiz - Antidepresan (Official Video)',
    channel: 'Mabel Matiz',
    platform: 'YT Music',
    durationSec: 252,
    categoryLabel: 'YT Music · Türkçe Pop',
    fallbackSegments: [
      { category: 'music_offtopic', startTime: 0, endTime: 14 },
      { category: 'outro', startTime: 235, endTime: 252 },
    ],
  },
  {
    id: 'track-6',
    videoId: 'aircAruvnKk',
    title: 'But what is a neural network? | Deep learning chapter 1',
    channel: '3Blue1Brown',
    platform: 'YouTube',
    durationSec: 1153,
    categoryLabel: 'Bilim & Matematik · Outro/Sponsor Testi',
    fallbackSegments: [
      { category: 'intro', startTime: 0, endTime: 18 },
      { category: 'sponsor', startTime: 1072, endTime: 1153 },
    ],
  },
];

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
