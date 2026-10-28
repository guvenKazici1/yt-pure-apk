package com.purestream.ytpremium;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

public class FloatingMiniPlayerService extends Service {

    public static final String ACTION_SHOW_MINI_SCREEN = "com.purestream.ytpremium.ACTION_SHOW_MINI_SCREEN";
    public static final String ACTION_HIDE_MINI_SCREEN = "com.purestream.ytpremium.ACTION_HIDE_MINI_SCREEN";
    public static final String ACTION_CLOSE_MINI_SCREEN = "com.purestream.ytpremium.ACTION_CLOSE_MINI_SCREEN";
    public static final String ACTION_TOGGLE_MINI_PLAY = "com.purestream.ytpremium.ACTION_TOGGLE_MINI_PLAY";
    public static final String EXTRA_VIDEO_TITLE = "extra_video_title";
    public static final String EXTRA_VIDEO_URL = "extra_video_url";

    private static final String CHANNEL_ID = "purestream_mini_screen_channel";
    private static final int FOREGROUND_ID = 3001;

    private WindowManager windowManager;
    private View floatingView;
    private WindowManager.LayoutParams layoutParams;
    private AudioManager audioManager;
    private MiniScreenWebView miniWebView;
    private TextView titleTextView;
    private TextView stateBadgeView;
    private Button playPauseBtn;

    private boolean isPlaying = true;
    private String currentVideoTitle = "YouTube Video · Arka Plan Küçük Ekran";
    private String currentVideoUrl = "";

    public static class MiniScreenWebView extends WebView {
        public MiniScreenWebView(Context context) {
            super(context);
        }

        @Override
        protected void onWindowVisibilityChanged(int visibility) {
            super.onWindowVisibilityChanged(View.VISIBLE);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.getAction() != null) {
            String action = intent.getAction();
            if (ACTION_CLOSE_MINI_SCREEN.equals(action)) {
                stopVideoAndCloseMiniScreen();
                return START_NOT_STICKY;
            } else if (ACTION_HIDE_MINI_SCREEN.equals(action)) {
                removeFloatingViewOnly();
                stopForeground(true);
                stopSelf();
                return START_NOT_STICKY;
            } else if (ACTION_TOGGLE_MINI_PLAY.equals(action)) {
                togglePlayPause();
                return START_STICKY;
            }

            String incomingTitle = intent.getStringExtra(EXTRA_VIDEO_TITLE);
            if (incomingTitle != null && !incomingTitle.trim().isEmpty()) {
                currentVideoTitle = incomingTitle.trim();
            }
            String incomingUrl = intent.getStringExtra(EXTRA_VIDEO_URL);
            if (incomingUrl != null && !incomingUrl.trim().isEmpty()) {
                currentVideoUrl = incomingUrl.trim();
            }
        }

        startForegroundSafely();
        showOrUpdateFloatingMiniScreen();
        return START_STICKY;
    }

    private void startForegroundSafely() {
        Notification notification = buildForegroundNotification();
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(FOREGROUND_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(FOREGROUND_ID, notification);
            }
        } catch (Exception ignored) {}
    }

    private Notification buildForegroundNotification() {
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;

        Intent toggleIntent = new Intent(this, FloatingMiniPlayerService.class);
        toggleIntent.setAction(ACTION_TOGGLE_MINI_PLAY);
        PendingIntent togglePending = PendingIntent.getService(this, 31, toggleIntent, flags);

        Intent closeIntent = new Intent(this, FloatingMiniPlayerService.class);
        closeIntent.setAction(ACTION_CLOSE_MINI_SCREEN);
        PendingIntent closePending = PendingIntent.getService(this, 32, closeIntent, flags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);

        return builder
            .setSmallIcon(isPlaying ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause)
            .setContentTitle("Küçük Ekran Aktif: " + currentVideoTitle)
            .setContentText(isPlaying ? "Oynatılıyor · Küçük ekrandan durdurabilir veya kapatabilirsiniz" : "Duraklatıldı")
            .setOngoing(true)
            .addAction(
                isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                isPlaying ? "Durdur" : "Oynat",
                togglePending
            )
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "✕ Kapat", closePending)
            .build();
    }

    private void showOrUpdateFloatingMiniScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            return;
        }

        if (floatingView != null) {
            if (titleTextView != null) {
                titleTextView.setText(currentVideoTitle);
            }
            if (!currentVideoUrl.isEmpty() && miniWebView != null) {
                loadUrlIntoMiniPlayer(currentVideoUrl, currentVideoTitle);
                currentVideoUrl = "";
            }
            updatePlayPauseUi();
            return;
        }

        float density = getResources().getDisplayMetrics().density;
        int widthPx = (int) (276 * density);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.parseColor("#0F172A"));
        cardBg.setCornerRadius(14 * density);
        cardBg.setStroke((int) (1.5f * density), Color.parseColor("#E11D48"));
        card.setBackground(cardBg);
        card.setPadding((int) (8 * density), (int) (6 * density), (int) (8 * density), (int) (8 * density));

        // 1. Draggable Top Header Bar (Drag handle + Open YouTube + X Close)
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding((int) (4 * density), (int) (2 * density), (int) (2 * density), (int) (6 * density));

        stateBadgeView = new TextView(this);
        stateBadgeView.setText("● YOUTUBE KÜÇÜK EKRAN");
        stateBadgeView.setTextColor(Color.parseColor("#FB7185"));
        stateBadgeView.setTextSize(10f);
        stateBadgeView.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams badgeLp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        stateBadgeView.setLayoutParams(badgeLp);

        Button openYtBtn = new Button(this);
        openYtBtn.setText("↗ Büyüt");
        openYtBtn.setTextColor(Color.WHITE);
        openYtBtn.setTextSize(9.5f);
        openYtBtn.setAllCaps(false);
        openYtBtn.setPadding((int) (8 * density), 0, (int) (8 * density), 0);
        GradientDrawable openBg = new GradientDrawable();
        openBg.setColor(Color.parseColor("#334155"));
        openBg.setCornerRadius(6 * density);
        openYtBtn.setBackground(openBg);
        LinearLayout.LayoutParams openLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            (int) (24 * density)
        );
        openLp.setMargins(0, 0, (int) (6 * density), 0);
        openYtBtn.setLayoutParams(openLp);
        openYtBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openOfficialYouTubeApp();
            }
        });

        Button closeTopBtn = new Button(this);
        closeTopBtn.setText("✕");
        closeTopBtn.setTextColor(Color.WHITE);
        closeTopBtn.setTextSize(11f);
        closeTopBtn.setTypeface(Typeface.DEFAULT_BOLD);
        closeTopBtn.setPadding(0, 0, 0, 0);
        GradientDrawable closeBg = new GradientDrawable();
        closeBg.setColor(Color.parseColor("#E11D48"));
        closeBg.setCornerRadius(6 * density);
        closeTopBtn.setBackground(closeBg);
        LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams((int) (26 * density), (int) (24 * density));
        closeTopBtn.setLayoutParams(closeLp);
        closeTopBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopVideoAndCloseMiniScreen();
            }
        });

        header.addView(stateBadgeView);
        header.addView(openYtBtn);
        header.addView(closeTopBtn);

        // 2. 16:9 Mini Video Surface + Title Overlay
        FrameLayout videoContainer = new FrameLayout(this);
        LinearLayout.LayoutParams videoContainerLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            (int) (136 * density)
        );
        videoContainer.setLayoutParams(videoContainerLp);

        miniWebView = new MiniScreenWebView(this);
        miniWebView.setBackgroundColor(Color.BLACK);
        WebSettings ws = miniWebView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            CookieManager.getInstance().setAcceptThirdPartyCookies(miniWebView, true);
        }
        miniWebView.setWebChromeClient(new WebChromeClient());
        miniWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectAdBlockerIntoMiniPlayer();
            }
        });

        loadUrlIntoMiniPlayer(currentVideoUrl, currentVideoTitle);

        videoContainer.addView(
            miniWebView,
            new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        );

        // Title strip below video
        titleTextView = new TextView(this);
        titleTextView.setText(currentVideoTitle);
        titleTextView.setTextColor(Color.WHITE);
        titleTextView.setTextSize(11f);
        titleTextView.setSingleLine(true);
        titleTextView.setEllipsize(TextUtils.TruncateAt.END);
        titleTextView.setPadding((int) (4 * density), (int) (6 * density), (int) (4 * density), (int) (6 * density));

        // 3. Bottom Control Buttons: Play/Pause (Durdur/Oynat) + Close (Videoyu Kapat)
        LinearLayout controlsRow = new LinearLayout(this);
        controlsRow.setOrientation(LinearLayout.HORIZONTAL);
        controlsRow.setGravity(Gravity.CENTER_VERTICAL);

        playPauseBtn = new Button(this);
        playPauseBtn.setText("⏸ Durdur");
        playPauseBtn.setTextColor(Color.WHITE);
        playPauseBtn.setTextSize(11f);
        playPauseBtn.setAllCaps(false);
        GradientDrawable playBg = new GradientDrawable();
        playBg.setColor(Color.parseColor("#059669"));
        playBg.setCornerRadius(8 * density);
        playPauseBtn.setBackground(playBg);
        LinearLayout.LayoutParams playLp = new LinearLayout.LayoutParams(0, (int) (34 * density), 1f);
        playLp.setMargins(0, 0, (int) (6 * density), 0);
        playPauseBtn.setLayoutParams(playLp);
        playPauseBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                togglePlayPause();
            }
        });

        Button closeBottomBtn = new Button(this);
        closeBottomBtn.setText("✕ Videoyu Kapat");
        closeBottomBtn.setTextColor(Color.WHITE);
        closeBottomBtn.setTextSize(11f);
        closeBottomBtn.setAllCaps(false);
        GradientDrawable stopBg = new GradientDrawable();
        stopBg.setColor(Color.parseColor("#BE123C"));
        stopBg.setCornerRadius(8 * density);
        closeBottomBtn.setBackground(stopBg);
        LinearLayout.LayoutParams stopLp = new LinearLayout.LayoutParams(0, (int) (34 * density), 1f);
        closeBottomBtn.setLayoutParams(stopLp);
        closeBottomBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopVideoAndCloseMiniScreen();
            }
        });

        controlsRow.addView(playPauseBtn);
        controlsRow.addView(closeBottomBtn);

        card.addView(header);
        card.addView(videoContainer);
        card.addView(titleTextView);
        card.addView(controlsRow);

        int overlayType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;

        layoutParams = new WindowManager.LayoutParams(
            widthPx,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            PixelFormat.TRANSLUCENT
        );
        layoutParams.gravity = Gravity.TOP | Gravity.START;
        layoutParams.x = (int) (16 * density);
        layoutParams.y = (int) (120 * density);

        // Allow dragging the mini-screen anywhere on the phone screen
        View.OnTouchListener dragListener = new View.OnTouchListener() {
            private int initialX;
            private int initialY;
            private float initialTouchX;
            private float initialTouchY;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                if (layoutParams == null || windowManager == null) return false;
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = layoutParams.x;
                        initialY = layoutParams.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        layoutParams.x = initialX + (int) (event.getRawX() - initialTouchX);
                        layoutParams.y = initialY + (int) (event.getRawY() - initialTouchY);
                        try {
                            windowManager.updateViewLayout(floatingView, layoutParams);
                        } catch (Exception ignored) {}
                        return true;
                }
                return false;
            }
        };

        header.setOnTouchListener(dragListener);
        titleTextView.setOnTouchListener(dragListener);

        floatingView = card;
        try {
            windowManager.addView(floatingView, layoutParams);
        } catch (Exception ignored) {}
    }

    private void loadUrlIntoMiniPlayer(String url, String title) {
        if (miniWebView == null) return;
        if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
            miniWebView.loadUrl(url);
        } else if (title != null && !title.isEmpty() && !"YouTube Video · Arka Plan Küçük Ekran".equals(title)) {
            String query = Uri.encode(title);
            miniWebView.loadUrl("https://m.youtube.com/results?search_query=" + query);
        } else {
            miniWebView.loadUrl("https://m.youtube.com");
        }
    }

    private void injectAdBlockerIntoMiniPlayer() {
        if (miniWebView == null) return;
        String js =
            "(function(){" +
            "if(window.__pureMiniInjected)return;" +
            "window.__pureMiniInjected=true;" +
            "setInterval(function(){" +
            "var skips=document.querySelectorAll('.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button');" +
            "for(var i=0;i<skips.length;i++){if(skips[i])skips[i].click();}" +
            "var player=document.getElementById('movie_player');" +
            "var v=document.querySelector('video');" +
            "if(player&&player.classList&&player.classList.contains('ad-showing')&&v&&isFinite(v.duration)&&v.duration>0){" +
            "v.muted=true;v.currentTime=v.duration;" +
            "}" +
            "},150);" +
            "})();";
        miniWebView.evaluateJavascript(js, null);
    }

    private void togglePlayPause() {
        isPlaying = !isPlaying;
        if (audioManager != null) {
            int key = isPlaying ? KeyEvent.KEYCODE_MEDIA_PLAY : KeyEvent.KEYCODE_MEDIA_PAUSE;
            audioManager.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, key));
            audioManager.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, key));
        }
        if (miniWebView != null) {
            if (isPlaying) {
                miniWebView.evaluateJavascript("(function(){var v=document.querySelector('video');if(v)v.play();})();", null);
            } else {
                miniWebView.evaluateJavascript("(function(){var v=document.querySelector('video');if(v)v.pause();})();", null);
            }
        }
        updatePlayPauseUi();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(FOREGROUND_ID, buildForegroundNotification());
        }
    }

    private void updatePlayPauseUi() {
        if (playPauseBtn != null) {
            playPauseBtn.setText(isPlaying ? "⏸ Durdur" : "▶ Oynat");
        }
        if (stateBadgeView != null) {
            stateBadgeView.setText(isPlaying ? "● KÜÇÜK EKRAN · OYNATILIYOR" : "⏸ KÜÇÜK EKRAN · DURAKLATILDI");
        }
    }

    private void openOfficialYouTubeApp() {
        try {
            Intent launchIntent = getPackageManager().getLaunchIntentForPackage("com.google.android.youtube");
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(launchIntent);
            } else {
                Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://m.youtube.com"));
                webIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(webIntent);
            }
        } catch (Exception ignored) {}
        removeFloatingViewOnly();
        stopForeground(true);
        stopSelf();
    }

    private void stopVideoAndCloseMiniScreen() {
        isPlaying = false;
        if (audioManager != null) {
            audioManager.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PAUSE));
            audioManager.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PAUSE));
        }
        if (miniWebView != null) {
            miniWebView.evaluateJavascript("(function(){var v=document.querySelector('video');if(v)v.pause();})();", null);
            miniWebView.loadUrl("about:blank");
        }
        removeFloatingViewOnly();
        stopForeground(true);
        stopSelf();
    }

    private void removeFloatingViewOnly() {
        if (floatingView != null && windowManager != null) {
            try {
                windowManager.removeView(floatingView);
            } catch (Exception ignored) {}
            floatingView = null;
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "PureStream YouTube Küçük Ekran Servisi",
                    NotificationManager.IMPORTANCE_LOW
                );
                nm.createNotificationChannel(ch);
            }
        }
    }

    @Override
    public void onDestroy() {
        removeFloatingViewOnly();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
