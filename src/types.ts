export type PlatformType = 'youtube' | 'ytmusic' | 'both';

export type SponsorCategory =
  | 'sponsor'
  | 'selfpromo'
  | 'interaction'
  | 'intro'
  | 'outro'
  | 'music_offtopic';

export interface SponsorSegment {
  category: SponsorCategory;
  startTime: number;
  endTime: number;
  UUID?: string;
  actionType?: string;
}

export interface ProtectionRule {
  id: string;
  name: string;
  description: string;
  platform: PlatformType;
  enabled: boolean;
  mechanism: string;
  selectorTarget: string;
}

export interface InterceptionEvent {
  id: string;
  timestamp: string;
  platform: 'YouTube' | 'YT Music';
  ruleName: string;
  targetTitle: string;
  actionTaken: string;
  timeSavedSec: number;
  latencyMs: number;
}

export interface MediaTrack {
  id: string;
  videoId: string;
  title: string;
  channel: string;
  platform: 'YouTube' | 'YT Music';
  durationSec: number;
  categoryLabel: string;
  fallbackSegments: SponsorSegment[];
}

export interface ProtectionStats {
  totalAdsNeutralized: number;
  totalSponsorsSkipped: number;
  totalPromptsDismissed: number;
  totalTimeSavedSec: number;
  sessionUptimeSec: number;
}
