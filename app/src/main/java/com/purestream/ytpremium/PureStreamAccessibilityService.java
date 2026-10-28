package com.purestream.ytpremium;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Path;
import android.graphics.Rect;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.List;

public class PureStreamAccessibilityService extends AccessibilityService {

    private static final String YT_PKG = "com.google.android.youtube";
    private static final String YTM_PKG = "com.google.android.apps.youtube.music";

    public static final String YTM_CHANNEL_ID = "purestream_ytmusic_topbar_channel";
    public static final int YTM_NOTIFICATION_ID = 1002;

    public static final String ACTION_YTM_PREV = "com.purestream.ytpremium.ACTION_YTM_PREV";
    public static final String ACTION_YTM_PLAY_PAUSE = "com.purestream.ytpremium.ACTION_YTM_PLAY_PAUSE";
    public static final String ACTION_YTM_NEXT = "com.purestream.ytpremium.ACTION_YTM_NEXT";
    public static final String ACTION_YTM_CLOSE_X = "com.purestream.ytpremium.ACTION_YTM_CLOSE_X";
    public static final String ACTION_TEST_YTM_NOTIFICATION = "com.purestream.ytpremium.ACTION_TEST_YTM_NOTIFICATION";

    private static boolean instanceRunning = false;

    public static boolean isRunning() {
        return instanceRunning;
    }

    private final Handler handler = new Handler(Looper.getMainLooper());
    private AudioManager audioManager;
    private NotificationManager notificationManager;
    private PowerManager.WakeLock wakeLock;

    private long lastClickTime = 0L;
    private String lastForegroundPkg = "";
    private boolean adCurrentlyMuted = false;

    // Normal YouTube tracking state
    private boolean ytVideoActive = false;
    private String currentYtVideoTitle = "YouTube Video Oynatılıyor";

    // Normal YT Music tracking state
    private boolean ytmPlaying = true;
    private boolean ytmClosedByX = false;
    private String currentYtmSongTitle = "YT Music · Çalan Şarkı";
    private String currentYtmArtist = "YouTube Music Arka Plan Kontrolü";

    private final String[] skipViewIds = new String[] {
        "com.google.android.youtube:id/skip_ad_button",
        "com.google.android.youtube:id/modern_skip_ad_button",
        "com.google.android.youtube:id/skip_ad_button_container",
        "com.google.android.youtube:id/skip_ad_button_text",
        "com.google.android.youtube:id/ad_skip_button",
        "com.google.android.apps.youtube.music:id/skip_ad_button",
        "com.google.android.apps.youtube.music:id/ad_skip_button"
    };

    private final String[] adBadgeIds = new String[] {
        "com.google.android.youtube:id/ad_progress_text",
        "com.google.android.youtube:id/ad_badge",
        "com.google.android.apps.youtube.music:id/ad_badge"
    };

    private final String[] skipLabels = new String[] {
        "Atla", "Reklamı atla", "Reklamı geç", "Reklamları geç", "Skip", "Skip ad", "Skip ads"
    };

    private final String[] continueWatchingLabels = new String[] {
        "Evet", "Devam et", "İzlemeye devam et", "Yes", "Continue"
    };

    private final BroadcastReceiver ytmTopBarReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || intent.getAction() == null) return;
            String action = intent.getAction();

            if (ACTION_YTM_PREV.equals(action)) {
                ytmClosedByX = false;
                ytmPlaying = true;
                sendMediaKey(KeyEvent.KEYCODE_MEDIA_PREVIOUS);
                showOrUpdateYtMusicTopNotification();
            } else if (ACTION_YTM_PLAY_PAUSE.equals(action)) {
                ytmClosedByX = false;
                ytmPlaying = !ytmPlaying;
                sendMediaKey(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE);
                showOrUpdateYtMusicTopNotification();
            } else if (ACTION_YTM_NEXT.equals(action)) {
                ytmClosedByX = false;
                ytmPlaying = true;
                sendMediaKey(KeyEvent.KEYCODE_MEDIA_NEXT);
                showOrUpdateYtMusicTopNotification();
            } else if (ACTION_YTM_CLOSE_X.equals(action)) {
                ytmClosedByX = true;
                ytmPlaying = false;
                sendMediaKey(KeyEvent.KEYCODE_MEDIA_PAUSE);
                releaseWakeLock();
                if (notificationManager != null) {
                    notificationManager.cancel(YTM_NOTIFICATION_ID);
                }
            } else if (ACTION_TEST_YTM_NOTIFICATION.equals(action)) {
                ytmClosedByX = false;
                ytmPlaying = true;
                String customSong = intent.getStringExtra("song_title");
                String customArtist = intent.getStringExtra("artist_name");
                if (customSong != null && !customSong.isEmpty()) {
                    currentYtmSongTitle = customSong;
                }
                if (customArtist != null && !customArtist.isEmpty()) {
                    currentYtmArtist = customArtist;
                }
                showOrUpdateYtMusicTopNotification();
            }
        }
    };

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instanceRunning = true;
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && notificationManager != null) {
            NotificationChannel ch = new NotificationChannel(
                YTM_CHANNEL_ID,
                "YT Music Telefon Üst Sekme Şarkı Kontrolü",
                NotificationManager.IMPORTANCE_LOW
            );
            notificationManager.createNotificationChannel(ch);
        }

        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_YTM_PREV);
        filter.addAction(ACTION_YTM_PLAY_PAUSE);
        filter.addAction(ACTION_YTM_NEXT);
        filter.addAction(ACTION_YTM_CLOSE_X);
        filter.addAction(ACTION_TEST_YTM_NOTIFICATION);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(ytmTopBarReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(ytmTopBarReceiver, filter);
        }
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        String pkg = event.getPackageName().toString();
        int eventType = event.getEventType();

        // Capture YT Music song title from notification updates if posted by YT Music
        if (eventType == AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED && YTM_PKG.equals(pkg)) {
            List<CharSequence> texts = event.getText();
            if (texts != null && !texts.isEmpty()) {
                for (CharSequence cs : texts) {
                    if (cs != null && cs.length() > 2) {
                        currentYtmSongTitle = cs.toString();
                        break;
                    }
                }
                if (!ytmClosedByX) {
                    showOrUpdateYtMusicTopNotification();
                }
            }
            return;
        }

        // Ignore transient system overlays when tracking foreground app transitions
        if (pkg.startsWith("com.android.systemui") || pkg.equals(getPackageName())) {
            if (YT_PKG.equals(lastForegroundPkg) || YTM_PKG.equals(lastForegroundPkg)) {
                scanWindowForAdsAndMetadata(lastForegroundPkg);
            }
            return;
        }

        // 1. Official YouTube App is in foreground
        if (YT_PKG.equals(pkg)) {
            if (!YT_PKG.equals(lastForegroundPkg)) {
                // User returned to official YouTube app -> hide floating mini-screen so full YouTube is unobstructed
                hideFloatingMiniScreen();
            }
            lastForegroundPkg = YT_PKG;
            ytVideoActive = true;
            scanWindowForAdsAndMetadata(YT_PKG);
            return;
        }

        // 2. Official YT Music App is in foreground
        if (YTM_PKG.equals(pkg)) {
            lastForegroundPkg = YTM_PKG;
            ytmClosedByX = false;
            ytmPlaying = true;
            acquireWakeLock();
            scanWindowForAdsAndMetadata(YTM_PKG);
            showOrUpdateYtMusicTopNotification();
            return;
        }

        // 3. User switched from Official YouTube to Home Screen / Another App -> Launch Floating Mini-Screen!
        if (YT_PKG.equals(lastForegroundPkg) && eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            lastForegroundPkg = pkg;
            restoreAdMuteIfNeeded();
            if (ytVideoActive) {
                launchFloatingMiniScreenForYouTube();
                handler.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        sendMediaKey(KeyEvent.KEYCODE_MEDIA_PLAY);
                    }
                }, 250L);
            }
            return;
        }

        // 4. User switched from Official YT Music to Home Screen / Another App -> Keep Music Playing + Show Top Bar!
        if (YTM_PKG.equals(lastForegroundPkg) && eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            lastForegroundPkg = pkg;
            restoreAdMuteIfNeeded();
            if (!ytmClosedByX) {
                acquireWakeLock();
                showOrUpdateYtMusicTopNotification();
                handler.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        sendMediaKey(KeyEvent.KEYCODE_MEDIA_PLAY);
                    }
                }, 250L);
            }
        }
    }

    private void scanWindowForAdsAndMetadata(String activePkg) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;

        // Step A: Click any Ad Skip button by View ID
        for (String id : skipViewIds) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(id);
            if (nodes != null) {
                for (AccessibilityNodeInfo node : nodes) {
                    if (clickOrTapNode(node)) {
                        restoreAdMuteIfNeeded();
                        return;
                    }
                }
            }
        }

        // Step B: Click any Ad Skip button by Localized Label ("Atla", "Skip", etc.)
        for (String label : skipLabels) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(label);
            if (nodes != null) {
                for (AccessibilityNodeInfo node : nodes) {
                    if (clickOrTapNode(node)) {
                        restoreAdMuteIfNeeded();
                        return;
                    }
                }
            }
        }

        // Step C: Auto-mute unskippable ad stream while ad badge is visible
        boolean adDetected = false;
        for (String badgeId : adBadgeIds) {
            List<AccessibilityNodeInfo> badges = root.findAccessibilityNodeInfosByViewId(badgeId);
            if (badges != null && !badges.isEmpty()) {
                adDetected = true;
                break;
            }
        }
        if (adDetected) {
            muteDuringUnskippableAd();
        } else {
            restoreAdMuteIfNeeded();
        }

        // Step D: Extract active video / song title
        if (YT_PKG.equals(activePkg)) {
            extractYouTubeVideoMetadata(root);
        } else if (YTM_PKG.equals(activePkg)) {
            extractYtMusicSongMetadata(root);
            dismissStillListeningDialog(root);
        }
    }

    private void extractYouTubeVideoMetadata(AccessibilityNodeInfo root) {
        String[] titleIds = new String[] {
            "com.google.android.youtube:id/title",
            "com.google.android.youtube:id/video_title",
            "com.google.android.youtube:id/player_video_title_view"
        };
        for (String id : titleIds) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(id);
            if (nodes != null) {
                for (AccessibilityNodeInfo n : nodes) {
                    if (n != null && n.getText() != null && n.getText().length() > 2) {
                        currentYtVideoTitle = n.getText().toString();
                        ytVideoActive = true;
                        return;
                    }
                }
            }
        }
    }

    private void extractYtMusicSongMetadata(AccessibilityNodeInfo root) {
        String[] songIds = new String[] {
            "com.google.android.apps.youtube.music:id/song_title",
            "com.google.android.apps.youtube.music:id/player_SingleLineTitle",
            "com.google.android.apps.youtube.music:id/title"
        };
        String[] artistIds = new String[] {
            "com.google.android.apps.youtube.music:id/artist_name",
            "com.google.android.apps.youtube.music:id/subtitle",
            "com.google.android.apps.youtube.music:id/player_SingleLineSubtitle"
        };

        boolean updated = false;
        for (String id : songIds) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(id);
            if (nodes != null) {
                for (AccessibilityNodeInfo n : nodes) {
                    if (n != null && n.getText() != null && n.getText().length() > 1) {
                        String candidate = n.getText().toString();
                        if (!candidate.equals(currentYtmSongTitle)) {
                            currentYtmSongTitle = candidate;
                            updated = true;
                        }
                        break;
                    }
                }
            }
            if (updated) break;
        }

        for (String id : artistIds) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(id);
            if (nodes != null) {
                for (AccessibilityNodeInfo n : nodes) {
                    if (n != null && n.getText() != null && n.getText().length() > 1) {
                        String candidate = n.getText().toString();
                        if (!candidate.equals(currentYtmArtist)) {
                            currentYtmArtist = candidate;
                            updated = true;
                        }
                        break;
                    }
                }
            }
        }

        if (updated && !ytmClosedByX) {
            showOrUpdateYtMusicTopNotification();
        }
    }

    private void dismissStillListeningDialog(AccessibilityNodeInfo root) {
        for (String label : continueWatchingLabels) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(label);
            if (nodes != null) {
                for (AccessibilityNodeInfo n : nodes) {
                    if (clickOrTapNode(n)) return;
                }
            }
        }
    }

    private void launchFloatingMiniScreenForYouTube() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            return;
        }
        try {
            Intent serviceIntent = new Intent(this, FloatingMiniPlayerService.class);
            serviceIntent.setAction(FloatingMiniPlayerService.ACTION_SHOW_MINI_SCREEN);
            serviceIntent.putExtra(FloatingMiniPlayerService.EXTRA_VIDEO_TITLE, currentYtVideoTitle);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        } catch (Exception ignored) {}
    }

    private void hideFloatingMiniScreen() {
        try {
            Intent serviceIntent = new Intent(this, FloatingMiniPlayerService.class);
            serviceIntent.setAction(FloatingMiniPlayerService.ACTION_HIDE_MINI_SCREEN);
            startService(serviceIntent);
        } catch (Exception ignored) {}
    }

    public void showOrUpdateYtMusicTopNotification() {
        if (notificationManager == null || ytmClosedByX) return;
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;

        PendingIntent prevPending = PendingIntent.getBroadcast(this, 101, new Intent(ACTION_YTM_PREV), flags);
        PendingIntent playPausePending = PendingIntent.getBroadcast(this, 102, new Intent(ACTION_YTM_PLAY_PAUSE), flags);
        PendingIntent nextPending = PendingIntent.getBroadcast(this, 103, new Intent(ACTION_YTM_NEXT), flags);
        PendingIntent closePending = PendingIntent.getBroadcast(this, 104, new Intent(ACTION_YTM_CLOSE_X), flags);

        Intent openYtmIntent = getPackageManager().getLaunchIntentForPackage(YTM_PKG);
        if (openYtmIntent == null) {
            openYtmIntent = new Intent(this, MainActivity.class);
        }
        PendingIntent contentPending = PendingIntent.getActivity(this, 105, openYtmIntent, flags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, YTM_CHANNEL_ID)
            : new Notification.Builder(this);

        builder.setSmallIcon(ytmPlaying ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause)
            .setContentTitle("🎵 " + currentYtmSongTitle)
            .setContentText(currentYtmArtist + (ytmPlaying ? " · Çalıyor" : " · Duraklatıldı"))
            .setSubText("YT Music Üst Sekme")
            .setContentIntent(contentPending)
            .setOngoing(ytmPlaying)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(android.R.drawable.ic_media_previous, "⏮ Önceki", prevPending)
            .addAction(
                ytmPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                ytmPlaying ? "⏸ Durdur" : "▶ Oynat",
                playPausePending
            )
            .addAction(android.R.drawable.ic_media_next, "⏭ Sonraki", nextPending)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "✕ Kapat", closePending);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Notification.MediaStyle mediaStyle = new Notification.MediaStyle();
            mediaStyle.setShowActionsInCompactView(0, 1, 2);
            builder.setStyle(mediaStyle);
        }

        notificationManager.notify(YTM_NOTIFICATION_ID, builder.build());
    }

    private void muteDuringUnskippableAd() {
        if (audioManager == null || adCurrentlyMuted) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                audioManager.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_MUTE, 0);
            } else {
                audioManager.setStreamMute(AudioManager.STREAM_MUSIC, true);
            }
            adCurrentlyMuted = true;
        } catch (Exception ignored) {}
    }

    private void restoreAdMuteIfNeeded() {
        if (audioManager == null || !adCurrentlyMuted) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                audioManager.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_UNMUTE, 0);
            } else {
                audioManager.setStreamMute(AudioManager.STREAM_MUSIC, false);
            }
            adCurrentlyMuted = false;
        } catch (Exception ignored) {}
    }

    private boolean clickOrTapNode(AccessibilityNodeInfo node) {
        if (node == null) return false;
        long now = System.currentTimeMillis();
        if (now - lastClickTime < 220L) return false;

        AccessibilityNodeInfo curr = node;
        int depth = 0;
        while (curr != null && depth < 4) {
            if (curr.isClickable() && curr.isEnabled()) {
                if (curr.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                    lastClickTime = now;
                    return true;
                }
            }
            curr = curr.getParent();
            depth++;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            Rect rect = new Rect();
            node.getBoundsInScreen(rect);
            if (rect.width() > 0 && rect.height() > 0) {
                Path path = new Path();
                path.moveTo(rect.exactCenterX(), rect.exactCenterY());
                GestureDescription.StrokeDescription stroke = new GestureDescription.StrokeDescription(path, 0L, 45L);
                GestureDescription gesture = new GestureDescription.Builder().addStroke(stroke).build();
                lastClickTime = now;
                dispatchGesture(gesture, null, null);
                return true;
            }
        }
        return false;
    }

    private void sendMediaKey(int keyCode) {
        if (audioManager == null) return;
        audioManager.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, keyCode));
        audioManager.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, keyCode));
    }

    private void acquireWakeLock() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PureStream::YtMusicWakeLock");
                }
            }
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(4 * 60 * 60 * 1000L);
            }
        } catch (Exception ignored) {}
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
        instanceRunning = false;
        restoreAdMuteIfNeeded();
        releaseWakeLock();
        try {
            unregisterReceiver(ytmTopBarReceiver);
        } catch (Exception ignored) {}
        super.onDestroy();
    }
}
