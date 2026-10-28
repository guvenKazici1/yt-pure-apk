import React, { useState } from 'react';
import { Download, Copy, Check, Code2, Bookmark, Shield, Terminal } from 'lucide-react';
import { ProtectionRule } from '../types';
import {
  createExtensionZipBlob,
  generateBookmarklet,
  generateContentScript,
  generateManifestJson,
  generateUserscript,
  rulesToConfig,
} from '../utils/extensionGenerator';

interface ExtensionBuilderViewProps {
  rules: ProtectionRule[];
}

export const ExtensionBuilderView: React.FC<ExtensionBuilderViewProps> = ({ rules }) => {
  const [copiedType, setCopiedType] = useState<'bookmarklet' | 'userscript' | 'content' | null>(null);
  const [activeCodeTab, setActiveCodeTab] = useState<'content.js' | 'manifest.json' | 'userscript.user.js'>(
    'content.js'
  );

  const config = rulesToConfig(rules);
  const bookmarkletHref = generateBookmarklet(config);
  const userscriptCode = generateUserscript(config);
  const contentJsCode = generateContentScript(config);
  const manifestCode = generateManifestJson();

  const handleDownloadExtensionZip = () => {
    const zipBlob = createExtensionZipBlob(config);
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'purestream-youtube-ytmusic-eklentisi.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadUserscript = () => {
    const blob = new Blob([userscriptCode], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'purestream-yt-shield.user.js';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = (text: string, type: 'bookmarklet' | 'userscript' | 'content') => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Top 3 Real Installation Options */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Option 1: Full Chrome/Edge/Brave/Opera Extension ZIP */}
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-rose-400">01. TAM OTOMATİK TARAYICI EKLENTİSİ</span>
              <span className="text-xs font-mono text-slate-400">Manifest V3</span>
            </div>
            <h3 className="text-base font-semibold text-slate-100">
              Chrome, Brave, Edge & Opera Eklenti Paketi (.ZIP)
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Tarayıcınızı açtığınız anda arkaplanda otomatik başlar. <code className="text-slate-200">youtube.com</code>{' '}
              ve <code className="text-slate-200">music.youtube.com</code> sekmelerine girdiğinizde reklamları 16x
              hızlandırıp atlar ve müziğin durmasını engeller.
            </p>
            <ol className="text-xs text-slate-300 space-y-1.5 pt-2 list-decimal list-inside">
              <li>Aşağıdaki butondan ZIP paketini indirin ve klasöre çıkartın.</li>
              <li>
                Tarayıcıda <code className="font-mono text-emerald-400">chrome://extensions</code> adresini açın.
              </li>
              <li>
                Sağ üstten <strong>Geliştirici Modu</strong>&apos;nu açıp <strong>Paketlenmemiş öğe yükle</strong> ile
                klasörü seçin.
              </li>
            </ol>
          </div>

          <button
            type="button"
            onClick={handleDownloadExtensionZip}
            className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            Eklenti Paketini İndir (.ZIP)
          </button>
        </div>

        {/* Option 2: Userscript for Tampermonkey / Violentmonkey / Mobile Firefox & Safari */}
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-emerald-400">02. MASAÜSTÜ & MOBİL USERSCRIPT</span>
              <span className="text-xs font-mono text-slate-400">.user.js</span>
            </div>
            <h3 className="text-base font-semibold text-slate-100">
              Tampermonkey, Violentmonkey & Mobil Tarayıcı Betiği
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Bilgisayarda veya Android (Firefox / Kiwi) ve iOS (Safari Userscripts / Stay) cihazlarda YouTube ve YT
              Music&apos;i arkaplanda reklamsız ve ekran kapalıyken dinlemek için doğrudan kurulabilir betik.
            </p>
            <ul className="text-xs text-slate-300 space-y-1.5 pt-2">
              <li>· Sayfa Visibility API kilidini devre dışı bırakır (ekran kapanınca müzik durmaz)</li>
              <li>· SponsorBlock API ile şarkı içi diyalog ve sponsorları otomatik sarar</li>
            </ul>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadUserscript}
              className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              .user.js İndir
            </button>
            <button
              type="button"
              onClick={() => handleCopy(userscriptCode, 'userscript')}
              className="py-2.5 px-3.5 bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {copiedType === 'userscript' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copiedType === 'userscript' ? 'Kopyalandı' : 'Kodu Kopyala'}
            </button>
          </div>
        </div>

        {/* Option 3: Zero-Install Bookmarklet */}
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-amber-400">03. KURULUMSUZ TEK TIK YER İMİ</span>
              <span className="text-xs font-mono text-slate-400">Bookmarklet</span>
            </div>
            <h3 className="text-base font-semibold text-slate-100">
              Yer İmleri Çubuğuna Sürükle & Çalıştır
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Eklenti kurma izniniz olmayan iş/okul bilgisayarlarında aşağıdaki butonu tarayıcınızın yer imleri çubuğuna
              sürükleyin. YouTube veya YT Music açıkken tıkladığınızda arkaplan kalkanı o sekmede devreye girer.
            </p>
            <div className="pt-2">
              <a
                href={bookmarkletHref}
                onClick={(e) => e.preventDefault()}
                title="Beni Yer İmleri Çubuğuna Sürükleyin"
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-semibold rounded-lg cursor-grab active:cursor-grabbing"
              >
                <Bookmark className="w-3.5 h-3.5" />
                PureStream YT Reklam Kalkanı (Yer İmlerine Sürükle)
              </a>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleCopy(bookmarkletHref, 'bookmarklet')}
            className="w-full py-2.5 px-4 bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {copiedType === 'bookmarklet' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copiedType === 'bookmarklet' ? 'Yer İmi Kodu Kopyalandı!' : 'Yer İmi Kodunu Kopyala'}
          </button>
        </div>
      </div>

      {/* Live Generated Source Code Inspector */}
      <div className="bg-[#111827] border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-200">
              Seçili Kurallarınıza Göre Üretilen Arkaplan Kalkan Kodu
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[#0B0F17] p-1 rounded-lg border border-slate-800">
              {(['content.js', 'manifest.json', 'userscript.user.js'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveCodeTab(tab)}
                  className={`px-3 py-1 text-xs font-mono rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    activeCodeTab === tab ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                handleCopy(
                  activeCodeTab === 'content.js'
                    ? contentJsCode
                    : activeCodeTab === 'manifest.json'
                    ? manifestCode
                    : userscriptCode,
                  'content'
                )
              }
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              {copiedType === 'content' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedType === 'content' ? 'Kopyalandı' : 'Kopyala'}
            </button>
          </div>
        </div>

        <pre className="p-5 bg-[#0B0F17] text-xs font-mono text-slate-300 overflow-x-auto max-h-[380px] leading-relaxed">
          <code>
            {activeCodeTab === 'content.js'
              ? contentJsCode
              : activeCodeTab === 'manifest.json'
              ? manifestCode
              : userscriptCode}
          </code>
        </pre>
      </div>
    </div>
  );
};
