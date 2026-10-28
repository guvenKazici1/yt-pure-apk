package com.purestream.ytpremium;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {

    private static final String YT_PKG = "com.google.android.youtube";
    private static final String YTM_PKG = "com.google.android.apps.youtube.music";

    private TextView statusAccessibilityBadge;
    private TextView statusOverlayBadge;
    private TextView statusNotificationBadge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildControlCenterUi();
        handleIncomingShareIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingShareIntent(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshPermissionBadges();
    }

    private void handleIncomingShareIntent(Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            String sharedSubject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            if (sharedText != null && !sharedText.trim().isEmpty()) {
                launchMiniScreenTest(
                    sharedSubject != null && !sharedSubject.isEmpty() ? sharedSubject : "YouTube Video · Küçük Ekran",
                    sharedText.trim()
                );
                finish();
            }
        }
    }

    private void buildControlCenterUi() {
        float d = getResources().getDisplayMetrics().density;

        ScrollView scrollView = new ScrollView(this);
        scrollView.setBackgroundColor(Color.parseColor("#0B0F17"));
        scrollView.setFillViewport(true);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (18 * d);
        root.setPadding(pad, (int) (24 * d), pad, pad);

        // Header Banner
        TextView badge = new TextView(this);
        badge.setText("● PURESTREAM SİSTEM SERVİSİ · V5.0");
        badge.setTextColor(Color.parseColor("#34D399"));
        badge.setTextSize(11f);
        badge.setTypeface(Typeface.DEFAULT_BOLD);
        root.addView(badge);

        TextView title = new TextView(this);
        title.setText("Normal YouTube & YT Music Premium Asistanı");
        title.setTextColor(Color.WHITE);
        title.setTextSize(20f);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setPadding(0, (int) (6 * d), 0, (int) (6 * d));
        root.addView(title);

        TextView subtitle = new TextView(this);
        subtitle.setText(
            "YouTube bu uygulamanın içinde açılmaz. Aşağıdaki izinleri aktif ettikten sonra doğrudan telefonunuzdaki normal YouTube ve YT Music uygulamalarını açın:\n\n" +
            "• Normal YouTube: Reklamları otomatik atlar, video oynarken uygulamayı arka plana aldığınızda ekranda Küçük Ekran (Mini-Screen) belirir (Durdur/Oynat ve ✕ Kapat tuşlu).\n" +
            "• Normal YT Music: Telefonun üst bildirim sekmesinde çalan şarkıyı gösterir (⏮ Önceki, ⏯ Durdur/Oynat, ⏭ Sonraki ve ✕ Kapat tuşlu)."
        );
        subtitle.setTextColor(Color.parseColor("#94A3B8"));
        subtitle.setTextSize(12.5f);
        subtitle.setLineSpacing(0f, 1.25f);
        subtitle.setPadding(0, 0, 0, (int) (16 * d));
        root.addView(subtitle);

        // Quick Launch Row: Normal YouTube & Normal YT Music
        LinearLayout launchRow = new LinearLayout(this);
        launchRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams launchRowLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        launchRowLp.setMargins(0, 0, 0, (int) (16 * d));
        launchRow.setLayoutParams(launchRowLp);

        Button btnOpenNormalYoutube = createActionButton("▶ Normal YouTube'u Aç", "#E11D48", d);
        LinearLayout.LayoutParams lpLeft = new LinearLayout.LayoutParams(0, (int) (46 * d), 1f);
        lpLeft.setMargins(0, 0, (int) (6 * d), 0);
        btnOpenNormalYoutube.setLayoutParams(lpLeft);
        btnOpenNormalYoutube.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openExternalApp(YT_PKG, "https://m.youtube.com");
            }
        });

        Button btnOpenNormalYtMusic = createActionButton("🎵 Normal YT Music'i Aç", "#059669", d);
        LinearLayout.LayoutParams lpRight = new LinearLayout.LayoutParams(0, (int) (46 * d), 1f);
        lpRight.setMargins((int) (6 * d), 0, 0, 0);
        btnOpenNormalYtMusic.setLayoutParams(lpRight);
        btnOpenNormalYtMusic.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openExternalApp(YTM_PKG, "https://music.youtube.com");
            }
        });

        launchRow.addView(btnOpenNormalYoutube);
        launchRow.addView(btnOpenNormalYtMusic);
        root.addView(launchRow);

        // Step 1 Card: Accessibility Service (AdBlock + Background Detection)
        statusAccessibilityBadge = new TextView(this);
        root.addView(createPermissionCard(
            "1. Reklam Engelleme & Arka Plan Algılama Servisi",
            "Normal YouTube ve YT Music'te reklamları otomatik geçer, video oynarken arka plana aldığınızda Küçük Ekranı ve YT Music üst sekmesini otomatik tetikler.",
            statusAccessibilityBadge,
            "Erişilebilirlik Servisini Aç",
            "#2563EB",
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    try {
                        startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
                    } catch (Exception ignored) {}
                }
            },
            d
        ));

        // Step 2 Card: Overlay Permission (Küçük Ekran / Mini-Screen)
        statusOverlayBadge = new TextView(this);
        root.addView(createPermissionCard(
            "2. YouTube Arka Plan Küçük Ekran (Overlay) İzni",
            "Normal YouTube'da video oynarken uygulamayı arka plana aldığınızda ekranda durdurup oynatabileceğiniz ve kapatabileceğiniz Küçük Ekranın belirmesi için gereklidir.",
            statusOverlayBadge,
            "Küçük Ekran İznini Ver",
            "#7C3AED",
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    requestOverlayPermission();
                }
            },
            d
        ));

        // Step 3 Card: Top Notification Permission (YT Music Üst Sekme Şarkı Kontrolü)
        statusNotificationBadge = new TextView(this);
        root.addView(createPermissionCard(
            "3. YT Music Telefon Üst Sekme Bildirim İzni",
            "YT Music'te çalan şarkıyı telefonun üst sekmesinde göstermek ve Önceki (⏮), Durdur/Oynat (⏯), Sonraki (⏭) şarkıya geçebilmek için gereklidir.",
            statusNotificationBadge,
            "Üst Sekme Bildirim İznini Ver",
            "#0D9488",
            new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    requestNotificationPermission();
                }
            },
            d
        ));

        // Instant Feature Test Section
        TextView testHeader = new TextView(this);
        testHeader.setText("ÖZELLİKLERİ ŞİMDİ TEST ET");
        testHeader.setTextColor(Color.parseColor("#94A3B8"));
        testHeader.setTextSize(11f);
        testHeader.setTypeface(Typeface.DEFAULT_BOLD);
        testHeader.setPadding(0, (int) (8 * d), 0, (int) (8 * d));
        root.addView(testHeader);

        Button btnTestMiniScreen = createActionButton(
            "🗔 YouTube Küçük Ekranı (Durdur/Oynat & Kapat) Şimdi Göster",
            "#1E293B",
            d
        );
        LinearLayout.LayoutParams testMiniLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            (int) (44 * d)
        );
        testMiniLp.setMargins(0, 0, 0, (int) (10 * d));
        btnTestMiniScreen.setLayoutParams(testMiniLp);
        btnTestMiniScreen.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                launchMiniScreenTest("YouTube Video · Arka Plan Küçük Ekran", "https://m.youtube.com");
            }
        });
        root.addView(btnTestMiniScreen);

        Button btnTestYtMusicTopBar = createActionButton(
            "🔔 YT Music Üst Sekme (⏮ Önceki · ⏯ Durdur/Oynat · ⏭ Sonraki) Göster",
            "#1E293B",
            d
        );
        LinearLayout.LayoutParams testYtmLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            (int) (44 * d)
        );
        btnTestYtMusicTopBar.setLayoutParams(testYtmLp);
        btnTestYtMusicTopBar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                triggerYtMusicTopBarPreview();
            }
        });
        root.addView(btnTestYtMusicTopBar);

        scrollView.addView(root);
        setContentView(scrollView);
    }

    private View createPermissionCard(
        String titleText,
        String descText,
        TextView statusBadge,
        String buttonText,
        String btnColorHex,
        View.OnClickListener onClick,
        float d
    ) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor("#111827"));
        bg.setCornerRadius(12 * d);
        bg.setStroke((int) (1 * d), Color.parseColor("#1F2937"));
        card.setBackground(bg);
        int p = (int) (14 * d);
        card.setPadding(p, p, p, p);

        LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        cardLp.setMargins(0, 0, 0, (int) (12 * d));
        card.setLayoutParams(cardLp);

        LinearLayout topRow = new LinearLayout(this);
        topRow.setOrientation(LinearLayout.HORIZONTAL);
        topRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView titleView = new TextView(this);
        titleView.setText(titleText);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(13.5f);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        titleView.setLayoutParams(titleLp);

        statusBadge.setTextSize(10.5f);
        statusBadge.setTypeface(Typeface.DEFAULT_BOLD);
        statusBadge.setPadding((int) (8 * d), (int) (3 * d), (int) (8 * d), (int) (3 * d));

        topRow.addView(titleView);
        topRow.addView(statusBadge);

        TextView descView = new TextView(this);
        descView.setText(descText);
        descView.setTextColor(Color.parseColor("#94A3B8"));
        descView.setTextSize(11.5f);
        descView.setPadding(0, (int) (6 * d), 0, (int) (12 * d));

        Button actionBtn = createActionButton(buttonText, btnColorHex, d);
        actionBtn.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            (int) (40 * d)
        ));
        actionBtn.setOnClickListener(onClick);

        card.addView(topRow);
        card.addView(descView);
        card.addView(actionBtn);
        return card;
    }

    private Button createActionButton(String label, String hexColor, float d) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextColor(Color.WHITE);
        b.setTextSize(12f);
        b.setAllCaps(false);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor(hexColor));
        bg.setCornerRadius(8 * d);
        b.setBackground(bg);
        return b;
    }

    private void refreshPermissionBadges() {
        boolean accEnabled = isAccessibilityServiceEnabled();
        styleStatusBadge(statusAccessibilityBadge, accEnabled ? "AKTİF ✓" : "KAPALI · AÇIN", accEnabled);

        boolean overlayEnabled = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this);
        styleStatusBadge(statusOverlayBadge, overlayEnabled ? "AKTİF ✓" : "İZİN GEREKLİ", overlayEnabled);

        boolean notifEnabled = isNotificationPermissionGranted();
        styleStatusBadge(statusNotificationBadge, notifEnabled ? "AKTİF ✓" : "İZİN GEREKLİ", notifEnabled);
    }

    private void styleStatusBadge(TextView badge, String text, boolean active) {
        if (badge == null) return;
        badge.setText(text);
        badge.setTextColor(active ? Color.parseColor("#34D399") : Color.parseColor("#FBBF24"));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.parseColor(active ? "#064E3B" : "#451A03"));
        bg.setCornerRadius(12f);
        badge.setBackground(bg);
    }

    private boolean isAccessibilityServiceEnabled() {
        if (PureStreamAccessibilityService.isRunning()) return true;
        try {
            String enabledServices = Settings.Secure.getString(
                getContentResolver(),
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            );
            if (!TextUtils.isEmpty(enabledServices)) {
                return enabledServices.contains(getPackageName());
            }
        } catch (Exception ignored) {}
        return false;
    }

    private boolean isNotificationPermissionGranted() {
        if (Build.VERSION.SDK_INT >= 33) {
            return checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    private void requestOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            try {
                Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getPackageName())
                );
                startActivity(intent);
            } catch (Exception ignored) {}
        } else {
            Toast.makeText(this, "Küçük Ekran (Overlay) izni zaten aktif!", Toast.LENGTH_SHORT).show();
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 501);
                return;
            }
        }
        triggerYtMusicTopBarPreview();
        Toast.makeText(this, "YT Music Üst Sekme bildirimi aktif!", Toast.LENGTH_SHORT).show();
    }

    private void launchMiniScreenTest(String videoTitle, String videoUrl) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "Önce 2. adımdaki Küçük Ekran (Overlay) iznini verin.", Toast.LENGTH_LONG).show();
            requestOverlayPermission();
            return;
        }
        try {
            Intent serviceIntent = new Intent(this, FloatingMiniPlayerService.class);
            serviceIntent.setAction(FloatingMiniPlayerService.ACTION_SHOW_MINI_SCREEN);
            serviceIntent.putExtra(FloatingMiniPlayerService.EXTRA_VIDEO_TITLE, videoTitle);
            serviceIntent.putExtra(FloatingMiniPlayerService.EXTRA_VIDEO_URL, videoUrl);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
            Toast.makeText(this, "Küçük Ekran açıldı! Sürükleyebilir, durdurup oynatabilir veya ✕ ile kapatabilirsiniz.", Toast.LENGTH_SHORT).show();
        } catch (Exception ignored) {}
    }

    private void triggerYtMusicTopBarPreview() {
        Intent testBroadcast = new Intent(PureStreamAccessibilityService.ACTION_TEST_YTM_NOTIFICATION);
        testBroadcast.setPackage(getPackageName());
        testBroadcast.putExtra("song_title", "Blinding Lights");
        testBroadcast.putExtra("artist_name", "The Weeknd · YT Music");
        sendBroadcast(testBroadcast);

        // Also post directly in case Accessibility Service isn't enabled yet so user can test immediately
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                PureStreamAccessibilityService.YTM_CHANNEL_ID,
                "YT Music Telefon Üst Sekme Şarkı Kontrolü",
                NotificationManager.IMPORTANCE_LOW
            );
            nm.createNotificationChannel(ch);
        }

        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent prevPending = PendingIntent.getBroadcast(this, 101, new Intent(PureStreamAccessibilityService.ACTION_YTM_PREV), flags);
        PendingIntent playPausePending = PendingIntent.getBroadcast(this, 102, new Intent(PureStreamAccessibilityService.ACTION_YTM_PLAY_PAUSE), flags);
        PendingIntent nextPending = PendingIntent.getBroadcast(this, 103, new Intent(PureStreamAccessibilityService.ACTION_YTM_NEXT), flags);
        PendingIntent closePending = PendingIntent.getBroadcast(this, 104, new Intent(PureStreamAccessibilityService.ACTION_YTM_CLOSE_X), flags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, PureStreamAccessibilityService.YTM_CHANNEL_ID)
            : new Notification.Builder(this);

        builder.setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("🎵 YT Music · Çalan Şarkı")
            .setContentText("Telefon Üst Sekmesi · Önceki / Durdur-Oynat / Sonraki")
            .setSubText("YT Music Üst Sekme")
            .setOngoing(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(android.R.drawable.ic_media_previous, "⏮ Önceki", prevPending)
            .addAction(android.R.drawable.ic_media_pause, "⏸ Durdur", playPausePending)
            .addAction(android.R.drawable.ic_media_next, "⏭ Sonraki", nextPending)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "✕ Kapat", closePending);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            Notification.MediaStyle style = new Notification.MediaStyle();
            style.setShowActionsInCompactView(0, 1, 2);
            builder.setStyle(style);
        }

        nm.notify(PureStreamAccessibilityService.YTM_NOTIFICATION_ID, builder.build());
    }

    private void openExternalApp(String packageName, String fallbackWebUrl) {
        try {
            Intent launchIntent = getPackageManager().getLaunchIntentForPackage(packageName);
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(launchIntent);
                return;
            }
        } catch (Exception ignored) {}

        try {
            Intent fallbackIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(fallbackWebUrl));
            fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(fallbackIntent);
        } catch (Exception ignored) {}
    }
}
