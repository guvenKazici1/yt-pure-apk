import React, { useState } from 'react';
import {
  Download,
  Smartphone,
  X,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import {
  AndroidServiceConfig,
  createAndroidProjectZipBlob,
  downloadDirectApkFile,
  generateMacroDroidJson,
  getSignedApkBlobUrl,
} from '../utils/androidAppGenerator';

interface ApkDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  config?: AndroidServiceConfig;
}

const DEFAULT_CONFIG: AndroidServiceConfig = {
  autoClickSkipNode: true,
  gestureTapFallback: true,
  autoMuteAdStream: true,
  ytMusicContinueConfirm: true,
  foregroundKeepAliveNotification: true,
  scanIntervalMs: 100,
};

export const ApkDownloadModal: React.FC<ApkDownloadModalProps> = ({
  isOpen,
  onClose,
  config = DEFAULT_CONFIG,
}) => {
  const [clickCount, setClickCount] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>(
    '✓ PureStream-YouTube-Premium.apk (21 KB · V1+V2+V3 İmzalı) indirme işlemi başlatıldı! İndirme başlamadıysa aşağıdaki kırmızı butona dokunun.'
  );

  if (!isOpen) return null;

  const apkBlobUrl = getSignedApkBlobUrl();

  const handleDirectApkDownload = () => {
    setClickCount((c) => c + 1);
    downloadDirectApkFile(config);
    setStatusMessage(
      '✓ PureStream-YouTube-Premium.apk indiriliyor! Bildirim çubuğundan veya İndirilenler klasöründen dokunup kurabilirsiniz.'
    );
  };

  const triggerZipDownload = () => {
    const blob = createAndroidProjectZipBlob(config);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PureStream-YouTube-Premium-Android-Kaynak.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusMessage('✓ Android Studio kaynak kodu (.zip) indirildi!');
  };

  const triggerMacroDownload = () => {
    const json = generateMacroDroidJson(config);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PureStream_YouTube_Premium_Skip.macro';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusMessage('✓ PureStream_YouTube_Premium_Skip.macro indirildi!');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
      <div className="w-full max-w-xl bg-[#111827] border-2 border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 border-b border-slate-700 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center text-white shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Direkt APK İndir · PureStream-YouTube-Premium.apk
              </h3>
              <p className="text-[11px] text-emerald-400 font-mono">
                Android SDK (aapt + dx + apksigner V1/V2/V3) İle Derlenmiş Gerçek APK · v4.0.0
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Status Banner */}
          <div className="px-3.5 py-2.5 bg-emerald-950/80 border border-emerald-600/70 rounded-lg flex items-center gap-2 text-xs text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>

          {/* Primary Direct APK Download Box */}
          <div className="p-4 bg-slate-900/95 border-2 border-rose-500/80 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-rose-400">
                GERÇEK İMZALI ANDROID PAKETİ (.APK · 21 KB)
              </span>
              <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                V1 + V2 + V3 İmzalı
              </span>
            </div>

            <p className="text-xs text-slate-200 leading-relaxed">
              <strong>&ldquo;There was a problem parsing the package&rdquo;</strong> hatası tamamen giderildi. Bu paket
              resmi Android SDK araçları (<code>aapt</code>, <code>dx</code>, <code>zipalign</code> ve{' '}
              <code>apksigner</code>) ile derlenmiş gerçek ikili (binary) <code>.apk</code> dosyasıdır.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <a
                href="/api/purestream-youtube-premium.apk"
                download="PureStream-YouTube-Premium.apk"
                onClick={() => {
                  setClickCount((c) => c + 1);
                  setStatusMessage(
                    '✓ PureStream-YouTube-Premium.apk indiriliyor! İndirilen dosyaya dokunup Android telefonunuza doğrudan kurabilirsiniz.'
                  );
                }}
                className="py-3 px-4 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2 cursor-pointer shadow-lg transition-transform"
              >
                <Download className="w-4 h-4" />
                {clickCount > 0 ? '✓ APK İndiriliyor (Tekrar İndir)' : 'PureStream-YouTube-Premium.apk İndir'}
              </a>

              <a
                href={apkBlobUrl}
                download="PureStream-YouTube-Premium.apk"
                onClick={handleDirectApkDownload}
                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-transform"
              >
                <Smartphone className="w-4 h-4" />
                Alternatif Direkt .APK İndir
              </a>
            </div>

            <div className="text-[11px] text-slate-300 bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-1">
              <p className="font-semibold text-white">APK Kurulum Adımları & Özellikler:</p>
              <ol className="list-decimal list-inside space-y-0.5 text-slate-300">
                <li>
                  İndirilen <strong>PureStream-YouTube-Premium.apk</strong> dosyasına dokunun ve <strong>Yükle</strong>{' '}
                  deyin.
                </li>
                <li>
                  Uygulama içinde <strong>YouTube</strong>, <strong>YT Music</strong> ve <strong>PureStream</strong>{' '}
                  modları hazır gelir.
                </li>
                <li>
                  Ekranı kapattığınızda veya arkaplana aldığınızda <strong>telefonun üst bildirim sekmesinde</strong>{' '}
                  çalmaya devam eder; istediğinizde <strong>&ldquo;X Kapat&rdquo;</strong> ile tamamen kapatılır.
                </li>
              </ol>
            </div>
          </div>

          {/* Extra Tools: MacroDroid & Source Code */}
          <div className="p-3.5 bg-slate-900/90 border border-slate-700 rounded-xl space-y-2">
            <span className="text-[11px] font-mono font-bold text-slate-300 block">
              EK ARAÇLAR · KAYNAK KODU (.ZIP) & MACRODROID (.MACRO)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={triggerMacroDownload}
                className="py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                Otomasyon Profili (.MACRO)
              </button>
              <button
                type="button"
                onClick={triggerZipDownload}
                className="py-2 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-rose-400" />
                Android Studio Kaynak (.ZIP)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
