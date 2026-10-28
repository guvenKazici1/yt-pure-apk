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
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.List;

public class PureStreamAccessibilityService extends AccessibilityService {

    private static final String CHANNEL_ID = "purestream_service_top_channel";
    private static final int NOTIFICATION_ID = 1001;
    private static final String ACTION_PLAY_PAUSE = "com.purestream.ytpremium.SERVICE_PLAY_PAUSE";
    private static final String ACTION_NEXT = "com.purestream.ytpremium.SERVICE_NEXT";
    private static final String ACTION_CLOSE_X = "com.purestream.ytpremium.SERVICE_CLOSE_X";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private AudioManager audioManager;
    private NotificationManager notificationManager;
    private long lastClickTime = 0L;
    private String lastForegroundPkg = "";
    private boolean closedByUserX = false;

    private final String[] skipViewIds = new String[] {
        "com.google.android.youtube:id/skip_ad_button",
        "com.google.android.youtube:id/modern_skip_ad_button",
        "com.google.android.youtube:id/skip_ad_button_container",
        "com.google.android.youtube:id/skip_ad_button_text",
        "com.google.android.apps.youtube.music:id/skip_ad_button",
        "com.google.android.apps.youtube.music:id/ad_skip_button"
    };

    private final String[] skipLabels = new String[] {
        "Atla", "Reklamı geç", "Reklamları geç", "Skip", "Skip ad", "Skip ads"
    };

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || intent.getAction() == null) return;
            String action = intent.getAction();
            if (ACTION_PLAY_PAUSE.equals(action)) {
                sendMediaKey(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE);
            } else if (ACTION_NEXT.equals(action)) {
                sendMediaKey(KeyEvent.KEYCODE_MEDIA_NEXT);
            } else if (ACTION_CLOSE_X.equals(action)) {
                closedByUserX = true;
                sendMediaKey(KeyEvent.KEYCODE_MEDIA_PAUSE);
                if (notificationManager != null) {
                    notificationManager.cancel(NOTIFICATION_ID);
                }
            }
        }
    };

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && notificationManager != null) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID,
                "PureStream Üst Bildirim Kumandası",
                NotificationManager.IMPORTANCE_LOW
            );
            notificationManager.createNotificationChannel(ch);
        }

        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_PLAY_PAUSE);
        filter.addAction(ACTION_NEXT);
        filter.addAction(ACTION_CLOSE_X);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(receiver, filter);
        }
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        String pkg = event.getPackageName().toString();
        boolean isYt = "com.google.android.youtube".equals(pkg) || "com.google.android.apps.youtube.music".equals(pkg);
        boolean wasYt = "com.google.android.youtube".equals(lastForegroundPkg) || "com.google.android.apps.youtube.music".equals(lastForegroundPkg);

        if (isYt) {
            closedByUserX = false;
            lastForegroundPkg = pkg;
            scanAndClickSkip();
        } else if (wasYt && !pkg.startsWith("com.android.systemui") && !closedByUserX) {
            lastForegroundPkg = pkg;
            showTopBarNotification();
            handler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    sendMediaKey(KeyEvent.KEYCODE_MEDIA_PLAY);
                }
            }, 250L);
        }
    }

    private void scanAndClickSkip() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return;

        for (String id : skipViewIds) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(id);
            if (nodes != null) {
                for (AccessibilityNodeInfo node : nodes) {
                    if (clickOrTapNode(node)) return;
                }
            }
        }

        for (String label : skipLabels) {
            List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByText(label);
            if (nodes != null) {
                for (AccessibilityNodeInfo node : nodes) {
                    if (clickOrTapNode(node)) return;
                }
            }
        }
    }

    private boolean clickOrTapNode(AccessibilityNodeInfo node) {
        if (node == null) return false;
        long now = System.currentTimeMillis();
        if (now - lastClickTime < 250L) return false;

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

    private void showTopBarNotification() {
        if (notificationManager == null) return;
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent playPending = PendingIntent.getBroadcast(this, 1, new Intent(ACTION_PLAY_PAUSE), flags);
        PendingIntent nextPending = PendingIntent.getBroadcast(this, 2, new Intent(ACTION_NEXT), flags);
        PendingIntent closePending = PendingIntent.getBroadcast(this, 3, new Intent(ACTION_CLOSE_X), flags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);

        Notification n = builder
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("PureStream · Telefon Üst Sekmesinde Çalıyor")
            .setContentText("Arkaplan Kalkanı Aktif · Kapatmak için ✕ Kapat tuşuna dokunun")
            .setOngoing(true)
            .addAction(android.R.drawable.ic_media_pause, "Duraklat/Çal", playPending)
            .addAction(android.R.drawable.ic_media_next, "Sonraki", nextPending)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "✕ Kapat", closePending)
            .build();

        notificationManager.notify(NOTIFICATION_ID, n);
    }

    private void sendMediaKey(int keyCode) {
        if (audioManager == null) return;
        audioManager.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, keyCode));
        audioManager.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, keyCode));
    }

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
        try {
            unregisterReceiver(receiver);
        } catch (Exception ignored) {}
        super.onDestroy();
    }
}
