package com.purestream.ytpremium;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Rational;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;

public class MainActivity extends Activity {

    private static final String CHANNEL_ID = "purestream_top_bar_channel";
    private static final int NOTIFICATION_ID = 2001;
    private static final String ACTION_TOGGLE_PLAY = "com.purestream.ytpremium.ACTION_TOGGLE_PLAY";
    private static final String ACTION_NEXT_TRACK = "com.purestream.ytpremium.ACTION_NEXT_TRACK";
    private static final String ACTION_CLOSE_X = "com.purestream.ytpremium.ACTION_CLOSE_X";

    private BackgroundWebView webView;
    private NotificationManager notificationManager;
    private boolean closedByX = false;

    public static class BackgroundWebView extends WebView {
        public BackgroundWebView(Context context) {
            super(context);
        }

        @Override
        protected void onWindowVisibilityChanged(int visibility) {
            super.onWindowVisibilityChanged(View.VISIBLE);
        }
    }

    private final BroadcastReceiver topBarReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || intent.getAction() == null || webView == null) return;
            String action = intent.getAction();
            if (ACTION_TOGGLE_PLAY.equals(action)) {
                webView.evaluateJavascript(
                    "(function(){var v=document.querySelector('video');if(v){if(v.paused)v.play();else v.pause();}})();",
                    null
                );
            } else if (ACTION_NEXT_TRACK.equals(action)) {
                webView.evaluateJavascript(
                    "(function(){var n=document.querySelector('.ytp-next-button, .next-button');if(n)n.click();})();",
                    null
                );
            } else if (ACTION_CLOSE_X.equals(action)) {
                closedByX = true;
                webView.evaluateJavascript(
                    "(function(){var v=document.querySelector('video');if(v)v.pause();})();",
                    null
                );
                if (notificationManager != null) {
                    notificationManager.cancel(NOTIFICATION_ID);
                }
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        createTopNotificationChannel();

        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_TOGGLE_PLAY);
        filter.addAction(ACTION_NEXT_TRACK);
        filter.addAction(ACTION_CLOSE_X);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(topBarReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(topBarReceiver, filter);
        }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#0B0F17"));

        LinearLayout topBar = new LinearLayout(this);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setBackgroundColor(Color.parseColor("#111827"));
        topBar.setPadding(16, 14, 16, 14);
        topBar.setGravity(Gravity.CENTER_VERTICAL);

        Button btnYoutube = createStyledButton("YouTube", "#E11D48");
        btnYoutube.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                closedByX = false;
                webView.loadUrl("https://m.youtube.com");
            }
        });

        Button btnYtMusic = createStyledButton("YT Music", "#059669");
        btnYtMusic.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                closedByX = false;
                webView.loadUrl("https://music.youtube.com");
            }
        });

        Button btnSkipService = createStyledButton("Üst Sekme & Skip", "#334155");
        btnSkipService.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                try {
                    startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
                } catch (Exception ignored) {}
            }
        });

        topBar.addView(btnYoutube);
        topBar.addView(btnYtMusic);
        topBar.addView(btnSkipService);

        webView = new BackgroundWebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        }

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectYouTubePremiumEngine();
            }
        });

        webView.loadUrl("https://m.youtube.com");

        root.addView(topBar);
        root.addView(
            webView,
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
            )
        );

        setContentView(root);
    }

    private Button createStyledButton(String label, String hexColor) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextColor(Color.WHITE);
        b.setTextSize(11f);
        b.setBackgroundColor(Color.parseColor(hexColor));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
            0,
            LinearLayout.LayoutParams.WRAP_CONTENT,
            1f
        );
        lp.setMargins(6, 0, 6, 0);
        b.setLayoutParams(lp);
        return b;
    }

    private void injectYouTubePremiumEngine() {
        String script =
            "(function(){" +
            "if(window.__pureStreamInjected)return;" +
            "window.__pureStreamInjected=true;" +
            "try{" +
            "Object.defineProperty(document,'hidden',{get:function(){return false;},configurable:true});" +
            "Object.defineProperty(document,'visibilityState',{get:function(){return 'visible';},configurable:true});" +
            "document.addEventListener('visibilitychange',function(e){e.stopImmediatePropagation();},true);" +
            "}catch(e){}" +
            "setInterval(function(){" +
            "var skipSelectors=['.ytp-ad-skip-button','.ytp-ad-skip-button-modern','.ytp-skip-ad-button','.ytp-ad-skip-button-slot button','ytmusic-player-bar .skip-button'];" +
            "for(var i=0;i<skipSelectors.length;i++){" +
            "var btns=document.querySelectorAll(skipSelectors[i]);" +
            "for(var j=0;j<btns.length;j++){if(btns[j]&&typeof btns[j].click==='function')btns[j].click();}" +
            "}" +
            "var player=document.getElementById('movie_player');" +
            "var v=document.querySelector('video');" +
            "if(player&&player.classList&&player.classList.contains('ad-showing')&&v&&isFinite(v.duration)&&v.duration>0){" +
            "v.muted=true;v.currentTime=v.duration;" +
            "if(typeof player.skipAd==='function')player.skipAd();" +
            "}" +
            "var dialogBtn=document.querySelector('ytmusic-you-there-renderer button, yt-confirm-dialog-renderer #confirm-button button');" +
            "if(dialogBtn)dialogBtn.click();" +
            "},120);" +
            "})();";
        webView.evaluateJavascript(script, null);
    }

    private void showPhoneTopBarNotification() {
        if (notificationManager == null || closedByX) return;
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;

        PendingIntent playIntent = PendingIntent.getBroadcast(this, 10, new Intent(ACTION_TOGGLE_PLAY), flags);
        PendingIntent nextIntent = PendingIntent.getBroadcast(this, 11, new Intent(ACTION_NEXT_TRACK), flags);
        PendingIntent closeXIntent = PendingIntent.getBroadcast(this, 12, new Intent(ACTION_CLOSE_X), flags);
        PendingIntent openAppIntent = PendingIntent.getActivity(this, 13, new Intent(this, MainActivity.class), flags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);

        builder.setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("PureStream · Telefon Üst Sekmesinde Çalıyor")
            .setContentText("Arkaplan Modu Aktif · Kapatmak için ✕ Kapat tuşuna dokunun")
            .setContentIntent(openAppIntent)
            .setOngoing(true)
            .addAction(android.R.drawable.ic_media_pause, "Duraklat/Çal", playIntent)
            .addAction(android.R.drawable.ic_media_next, "Sonraki", nextIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "✕ Kapat", closeXIntent);

        notificationManager.notify(NOTIFICATION_ID, builder.build());
    }

    private void createTopNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && notificationManager != null) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "PureStream Telefon Üst Bildirim Sekmesi",
                NotificationManager.IMPORTANCE_LOW
            );
            notificationManager.createNotificationChannel(channel);
        }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (!closedByX) {
            showPhoneTopBarNotification();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    PictureInPictureParams params = new PictureInPictureParams.Builder()
                        .setAspectRatio(new Rational(16, 9))
                        .build();
                    enterPictureInPictureMode(params);
                } catch (Exception ignored) {}
            }
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (!closedByX) {
            showPhoneTopBarNotification();
            if (webView != null) {
                webView.evaluateJavascript(
                    "(function(){var v=document.querySelector('video');if(v&&v.paused)v.play();})();",
                    null
                );
            }
        }
    }

    @Override
    protected void onDestroy() {
        try {
            unregisterReceiver(topBarReceiver);
        } catch (Exception ignored) {}
        super.onDestroy();
    }
}
