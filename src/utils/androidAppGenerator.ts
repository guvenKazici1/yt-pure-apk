import { SIGNED_APK_BYTES, getSignedApkBlobUrl } from './signedApkData';

export { getSignedApkBlobUrl };

export interface AndroidServiceConfig {
  autoClickSkipNode: boolean;
  gestureTapFallback: boolean;
  autoMuteAdStream: boolean;
  ytMusicContinueConfirm: boolean;
  foregroundKeepAliveNotification: boolean;
  scanIntervalMs: number;
}

export function generateAndroidAccessibilityServiceKt(config: AndroidServiceConfig): string {
  return `package com.purestream.ytshield

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Path
import android.graphics.Rect
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * PureStream Android Arkaplan Servisi (YouTube & YouTube Music)
 * 1) YouTube veya YT Music açıkken reklamlardaki "Atla / Skip" tuşuna otomatik tıklar.
 * 2) YouTube veya YT Music arkaplana alındığında OTOMATİK devreye girer,
 *    TELEFONUN ÜST BİLDİRİM SEKMESİNDE (Notification Bar) çalmaya devam ettirir
 *    ve istendiğinde üst bildirimdeki "✕ (Çarpı)" tuşuyla tamamen kapatılır.
 */
class PureStreamAccessibilityService : AccessibilityService() {

    companion object {
        const val CHANNEL_ID = "purestream_phone_top_bar_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_PLAY_PAUSE = "com.purestream.ytshield.ACTION_PLAY_PAUSE"
        const val ACTION_NEXT = "com.purestream.ytshield.ACTION_NEXT"
        const val ACTION_CLOSE_X = "com.purestream.ytshield.ACTION_CLOSE_X"
    }

    private val handler = Handler(Looper.getMainLooper())
    private var audioManager: AudioManager? = null
    private var notificationManager: NotificationManager? = null
    private var wasMutedByService = false
    private var lastClickTimestamp = 0L
    private var lastForegroundPackage = ""
    private var closedByUserX = false

    private val skipViewIds = listOf(
        "com.google.android.youtube:id/skip_ad_button",
        "com.google.android.youtube:id/modern_skip_ad_button",
        "com.google.android.youtube:id/skip_ad_button_container",
        "com.google.android.youtube:id/skip_ad_button_text",
        "com.google.android.apps.youtube.music:id/skip_ad_button",
        "com.google.android.apps.youtube.music:id/ad_skip_button"
    )

    private val adIndicatorViewIds = listOf(
        "com.google.android.youtube:id/ad_progress_text",
        "com.google.android.youtube:id/ad_attribution",
        "com.google.android.apps.youtube.music:id/ad_badge"
    )

    private val skipTextLabels = listOf(
        "Atla",
        "Reklamı geç",
        "Reklamları geç",
        "Skip",
        "Skip ad",
        "Skip ads"
    )

    // Telefonun Üst Bildirim Sekmesindeki Play/Pause, Next ve "✕ (Çarpı)" butonlarını dinler
    private val notificationReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                ACTION_PLAY_PAUSE -> sendMediaKeyEvent(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)
                ACTION_NEXT -> sendMediaKeyEvent(KeyEvent.KEYCODE_MEDIA_NEXT)
                ACTION_CLOSE_X -> {
                    // Çarpı (X) tuşuna basıldığında müziği durdur ve telefonun üst bildirimini kapat
                    closedByUserX = true
                    sendMediaKeyEvent(KeyEvent.KEYCODE_MEDIA_PAUSE)
                    notificationManager?.cancel(NOTIFICATION_ID)
                }
            }
        }
    }

    private val periodicScanner = object : Runnable {
        override fun run() {
            try {
                scanActiveWindow()
            } catch (_: Exception) {}
            handler.postDelayed(this, ${config.scanIntervalMs}L)
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        createPhoneTopNotificationChannel()

        val filter = IntentFilter().apply {
            addAction(ACTION_PLAY_PAUSE)
            addAction(ACTION_NEXT)
            addAction(ACTION_CLOSE_X)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(notificationReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(notificationReceiver, filter)
        }

        handler.post(periodicScanner)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        val pkg = event.packageName?.toString() ?: return

        val isYtOrMusic = (pkg == "com.google.android.youtube" || pkg == "com.google.android.apps.youtube.music")
        val wasYtOrMusic = (lastForegroundPackage == "com.google.android.youtube" || lastForegroundPackage == "com.google.android.apps.youtube.music")

        if (isYtOrMusic) {
            closedByUserX = false
            lastForegroundPackage = pkg
            scanActiveWindow()
        } else if (wasYtOrMusic && !pkg.startsWith("com.android.systemui") && !closedByUserX) {
            // YouTube veya YT Music ARKAPLANA ALINDI!
            // Otomatik olarak Telefonun Üst Bildirim Sekmesinde oynatmayı sürdür:
            val appTitle = if (lastForegroundPackage == "com.google.android.apps.youtube.music") "YT Music" else "YouTube"
            lastForegroundPackage = pkg
            if (${config.foregroundKeepAliveNotification}) {
                showPhoneTopBarNotification("$appTitle — Telefon Üst Sekmesinde Çalıyor")
                handler.postDelayed({
                    sendMediaKeyEvent(KeyEvent.KEYCODE_MEDIA_PLAY)
                }, 250L)
            }
        }
    }

    private fun showPhoneTopBarNotification(statusText: String) {
        val nm = notificationManager ?: return
        val playPausePending = PendingIntent.getBroadcast(
            this, 1, Intent(ACTION_PLAY_PAUSE), PendingIntent.FLAG_IMMUTABLE
        )
        val nextPending = PendingIntent.getBroadcast(
            this, 2, Intent(ACTION_NEXT), PendingIntent.FLAG_IMMUTABLE
        )
        val closeXPending = PendingIntent.getBroadcast(
            this, 3, Intent(ACTION_CLOSE_X), PendingIntent.FLAG_IMMUTABLE
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            Notification.Builder(this)
        }

        val notification = builder
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(statusText)
            .setContentText("Arkaplan Kalkanı Aktif · Kapatmak için ✕ tuşuna dokunun")
            .setOngoing(true)
            .addAction(android.R.drawable.ic_media_pause, "Duraklat/Çal", playPausePending)
            .addAction(android.R.drawable.ic_media_next, "Sonraki", nextPending)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "✕ Kapat", closeXPending)
            .build()

        nm.notify(NOTIFICATION_ID, notification)
    }

    private fun createPhoneTopNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "PureStream Telefon Üst Bildirim Oynatıcısı",
                NotificationManager.IMPORTANCE_LOW
            )
            notificationManager?.createNotificationChannel(channel)
        }
    }

    private fun sendMediaKeyEvent(keyCode: Int) {
        val am = audioManager ?: return
        val downEvent = KeyEvent(KeyEvent.ACTION_DOWN, keyCode)
        val upEvent = KeyEvent(KeyEvent.ACTION_UP, keyCode)
        am.dispatchMediaKeyEvent(downEvent)
        am.dispatchMediaKeyEvent(upEvent)
    }

    private fun scanActiveWindow() {
        val root = rootInActiveWindow ?: return
        val pkg = root.packageName?.toString() ?: ""
        if (pkg != "com.google.android.youtube" && pkg != "com.google.android.apps.youtube.music") {
            return
        }

        // 1. Ekranda "Atla / Reklamı Geç / Skip" butonu var mı kontrol et ve tıkla
        var skipClicked = false
        if (${config.autoClickSkipNode}) {
            for (viewId in skipViewIds) {
                val nodes = root.findAccessibilityNodeInfosByViewId(viewId)
                if (!nodes.isNullOrEmpty()) {
                    for (node in nodes) {
                        if (performClickOrTap(node)) {
                            skipClicked = true
                        }
                    }
                }
            }

            if (!skipClicked) {
                for (label in skipTextLabels) {
                    val textNodes = root.findAccessibilityNodeInfosByText(label)
                    if (!textNodes.isNullOrEmpty()) {
                        for (node in textNodes) {
                            val txt = node.text?.toString()?.trim() ?: ""
                            if (txt.equals(label, ignoreCase = true) || txt.contains("Reklamı geç", ignoreCase = true)) {
                                if (performClickOrTap(node)) {
                                    skipClicked = true
                                }
                            }
                        }
                    }
                }
            }
        }

        // 2. Geçilemeyen reklam oynarken sesi otomatik kapat, reklam bitince geri aç
        if (${config.autoMuteAdStream}) {
            val isAdPlaying = adIndicatorViewIds.any { id ->
                val list = root.findAccessibilityNodeInfosByViewId(id)
                !list.isNullOrEmpty()
            }

            if (isAdPlaying && !wasMutedByService) {
                muteMediaStream(true)
                wasMutedByService = true
            } else if (!isAdPlaying && wasMutedByService) {
                muteMediaStream(false)
                wasMutedByService = false
            }
        }

        // 3. YT Music "Hâlâ dinliyor musunuz?" uyarısını geç
        if (${config.ytMusicContinueConfirm}) {
            val confirmNodes = root.findAccessibilityNodeInfosByText("Evet")
            if (!confirmNodes.isNullOrEmpty()) {
                for (node in confirmNodes) {
                    performClickOrTap(node)
                }
            }
        }
    }

    private fun performClickOrTap(node: AccessibilityNodeInfo): Boolean {
        val now = System.currentTimeMillis()
        if (now - lastClickTimestamp < 250L) return false

        var current: AccessibilityNodeInfo? = node
        var depth = 0
        while (current != null && depth < 4) {
            if (current.isClickable && current.isEnabled) {
                val ok = current.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                if (ok) {
                    lastClickTimestamp = now
                    return true
                }
            }
            current = current.parent
            depth++
        }

        if (${config.gestureTapFallback} && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val rect = Rect()
            node.getBoundsInScreen(rect)
            if (rect.width() > 0 && rect.height() > 0) {
                val centerX = rect.exactCenterX()
                val centerY = rect.exactCenterY()
                val path = Path().apply { moveTo(centerX, centerY) }
                val stroke = GestureDescription.StrokeDescription(path, 0L, 45L)
                val gesture = GestureDescription.Builder().addStroke(stroke).build()
                lastClickTimestamp = now
                dispatchGesture(gesture, null, null)
                return true
            }
        }

        return false
    }

    private fun muteMediaStream(mute: Boolean) {
        try {
            val am = audioManager ?: return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.adjustStreamVolume(
                    AudioManager.STREAM_MUSIC,
                    if (mute) AudioManager.ADJUST_MUTE else AudioManager.ADJUST_UNMUTE,
                    0
                )
            }
        } catch (_: Exception) {}
    }

    override fun onInterrupt() {
        handler.removeCallbacks(periodicScanner)
        if (wasMutedByService) {
            muteMediaStream(false)
            wasMutedByService = false
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(periodicScanner)
        try {
            unregisterReceiver(notificationReceiver)
        } catch (_: Exception) {}
        super.onDestroy()
    }
}
`;
}

export function generateAndroidManifestXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.purestream.ytshield">

    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <application
        android:allowBackup="true"
        android:label="PureStream YT Kalkanı"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.DeviceDefault.NoActionBar">

        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <service
            android:name=".PureStreamAccessibilityService"
            android:exported="true"
            android:label="PureStream YouTube &amp; YT Music Arkaplan &amp; Üst Sekme Servisi"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data
                android:name="android.accessibilityservice"
                android:resource="@xml/accessibility_service_config" />
        </service>

    </application>
</manifest>
`;
}

export function generateAccessibilityConfigXml(config: AndroidServiceConfig): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowContentChanged|typeWindowStateChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagReportViewIds|flagRetrieveInteractiveWindows|flagIncludeNotImportantViews"
    android:canPerformGestures="true"
    android:canRetrieveWindowContent="true"
    android:notificationTimeout="${config.scanIntervalMs}"
    android:packageNames="com.google.android.youtube,com.google.android.apps.youtube.music" />
`;
}

export function generateMainActivityKt(): string {
  return `package com.purestream.ytshield

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Rational
import android.view.Gravity
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout

/**
 * PureStream YouTube Premium & YT Music Android Uygulaması
 * 1) BackgroundWebView: onWindowVisibilityChanged(View.VISIBLE) ile telefon kilitlense veya
 *    uygulama arkaplana alınsa bile YouTube & YT Music'in telefonun üst bildiriminde çalmasını sağlar.
 * 2) Native PiP (Resim İçinde Resim): Ana ekrana dönüldüğünde yüzen küçük pencere açar.
 * 3) AccessibilityService: Resmi YouTube ve YT Music uygulamalarında da "Skip / Atla" tuşuna otomatik basar.
 */
class BackgroundYoutubeWebView(context: Context) : WebView(context) {
    override fun onWindowVisibilityChanged(visibility: Int) {
        // YouTube Premium Arkaplan Kilidi: Ekran kapansa bile WebView'e her zaman VISIBLE bildirir!
        super.onWindowVisibilityChanged(View.VISIBLE)
    }
}

class MainActivity : Activity() {

    private lateinit var webView: BackgroundYoutubeWebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0B0F17"))
        }

        val topControls = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor("#111827"))
            setPadding(16, 16, 16, 16)
            gravity = Gravity.CENTER_VERTICAL
        }

        val btnYoutube = Button(this).apply {
            text = "YouTube Premium"
            setOnClickListener { webView.loadUrl("https://m.youtube.com") }
        }

        val btnYtMusic = Button(this).apply {
            text = "YT Music Premium"
            setOnClickListener { webView.loadUrl("https://music.youtube.com") }
        }

        val btnService = Button(this).apply {
            text = "Skip Servisi"
            setOnClickListener {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }
        }

        topControls.addView(btnYoutube)
        topControls.addView(btnYtMusic)
        topControls.addView(btnService)

        webView = BackgroundYoutubeWebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    injectPremiumAdSkipper()
                }
            }
            loadUrl("https://m.youtube.com")
        }

        root.addView(topControls)
        root.addView(
            webView,
            LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
            )
        )
        setContentView(root)
    }

    private fun injectPremiumAdSkipper() {
        val js = """
            (function() {
              if (window.__pureStreamAndroidPremium) return;
              window.__pureStreamAndroidPremium = true;
              Object.defineProperty(document, 'hidden', { get: () => false });
              Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
              setInterval(() => {
                const skipBtns = document.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button');
                skipBtns.forEach(b => b.click());
                const player = document.getElementById('movie_player');
                const video = document.querySelector('video');
                if (player && player.classList.contains('ad-showing') && video && isFinite(video.duration)) {
                  video.muted = true;
                  video.currentTime = video.duration;
                }
              }, 80);
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        // Kullanıcı uygulamayı arkaplana aldığında otomatik Resim İçinde Resim (PiP) veya Üst Bildirim Modu
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val params = PictureInPictureParams.Builder()
                .setAspectRatio(Rational(16, 9))
                .build()
            enterPictureInPictureMode(params)
        }
    }
}
`;
}

export function generateGithubWorkflowYml(): string {
  return `name: Build PureStream Android APK

on:
  push:
    branches: [ "main", "master" ]
  workflow_dispatch:

jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v3
      - name: Build Debug APK
        run: gradle assembleDebug
      - name: Upload Compiled APK
        uses: actions/upload-artifact@v4
        with:
          name: purestream-youtube-shield-apk
          path: app/build/outputs/apk/debug/*.apk
`;
}

export function generateMacroDroidJson(config: AndroidServiceConfig): string {
  return JSON.stringify(
    {
      macroName: 'PureStream — YouTube & YT Music Telefon Üst Sekme & Skip Avcısı',
      description:
        'YouTube ve YouTube Music arkaplana alındığında telefonun üst bildirim sekmesinde oynatmayı sürdürür (✕ ile kapatılabilir) ve reklamlardaki Atla / Skip butonlarına otomatik tıklar.',
      triggers: [
        {
          type: 'ApplicationLaunchedOrClosed',
          packages: ['com.google.android.youtube', 'com.google.android.apps.youtube.music'],
          state: 'Background',
          comment: 'YouTube veya YT Music arkaplana alındığında otomatik devreye girer',
        },
        {
          type: 'RegularInterval',
          intervalMs: config.scanIntervalMs,
        },
      ],
      actions: [
        {
          type: 'DisplayNotification',
          title: 'PureStream · Telefon Üst Sekmesinde Çalıyor',
          text: 'Durdurmak veya kapatmak için sağdaki ✕ (Kapat) butonuna dokunun',
          actionButtons: [
            { label: 'Duraklat / Oynat', action: 'MediaPlayPause' },
            { label: 'Sonraki', action: 'MediaNext' },
            { label: '✕ Kapat', action: 'MediaStopAndClearNotification' },
          ],
        },
        {
          type: 'UIInteractionClick',
          matchOption: 'ViewIdOrText',
          targetViewIds: [
            'com.google.android.youtube:id/skip_ad_button',
            'com.google.android.youtube:id/modern_skip_ad_button',
            'com.google.android.apps.youtube.music:id/skip_ad_button',
          ],
          targetTexts: ['Atla', 'Reklamı geç', 'Reklamları geç', 'Skip', 'Skip Ad', 'Skip Ads'],
          gestureFallbackOnCoordinates: config.gestureTapFallback,
        },
      ],
    },
    null,
    2
  );
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

export function createAndroidProjectZipBlob(config: AndroidServiceConfig): Blob {
  const readme = `PURESTREAM ANDROID ARKAPLAN & TELEFON ÜST BİLDİRİM SEKMESİ UYGULAMASI
======================================================================

Bu paket, Android telefonunuzda YouTube ve YouTube Music uygulamalarına
girdiğinizde arkaplanda çalışan hafif (~80 KB) yerel Android uygulamasının tam kaynak kodunu içerir.

ÖZELLİKLERİ:
1. TELEFONUN ÜST BİLDİRİM SEKMESİNDE ÇALMA (YT MUSIC TARZI):
   - YouTube veya YT Music uygulamasını arkaplana aldığınızda (Ana ekrana döndüğünüzde veya
     başka uygulamaya geçtiğinizde) özellik OTOMATİK devreye girer.
   - Telefonun kendi üst bildirim çekmecesinde (Notification Bar) medya çubuğu açılır.
   - İstediğiniz zaman telefonun üst bildirimindeki "✕ Kapat" (Çarpı) tuşuna basarak tamamen kapatabilirsiniz.

2. OTOMATİK SKIP / ATLA TUŞU AVCISI:
   - Ekranda "Atla", "Reklamı geç", "Skip Ad" butonunu gördüğü milisaniyede otomatik tıklar.
   - Ekranda takılı kalan Skip tuşlarına gerçek dokunuş (GestureDescription Tap) gönderir.
`;

  const files: { name: string; content: string }[] = [
    { name: 'README-ANDROID-KURULUM.txt', content: readme },
    { name: 'app/src/main/AndroidManifest.xml', content: generateAndroidManifestXml() },
    {
      name: 'app/src/main/java/com/purestream/ytshield/PureStreamAccessibilityService.kt',
      content: generateAndroidAccessibilityServiceKt(config),
    },
    {
      name: 'app/src/main/java/com/purestream/ytshield/MainActivity.kt',
      content: generateMainActivityKt(),
    },
    {
      name: 'app/src/main/res/xml/accessibility_service_config.xml',
      content: generateAccessibilityConfigXml(config),
    },
    { name: '.github/workflows/build-apk.yml', content: generateGithubWorkflowYml() },
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

export function downloadDirectApkFile(_config?: AndroidServiceConfig) {
  const directHttpUrl = `/api/purestream-youtube-premium.apk?dl=${Date.now()}`;

  // 1) Trigger real HTTP attachment download for Android DownloadManager (works inside preview iframes without page navigation)
  try {
    const dlFrame = document.createElement('iframe');
    dlFrame.style.display = 'none';
    dlFrame.src = directHttpUrl;
    document.body.appendChild(dlFrame);
    setTimeout(() => {
      if (dlFrame.parentNode) dlFrame.parentNode.removeChild(dlFrame);
    }, 60000);
  } catch {}

  // 2) Also trigger synchronous Blob download from embedded V1+V2+V3 signed APK bytes for desktop & supporting browsers
  try {
    const apkBytes = new Uint8Array(SIGNED_APK_BYTES);
    const apkBlob = new Blob([apkBytes], { type: 'application/vnd.android.package-archive' });
    const blobUrl = URL.createObjectURL(apkBlob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = blobUrl;
    a.download = 'PureStream-YouTube-Premium.apk';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }, 30000);
  } catch {}
}
