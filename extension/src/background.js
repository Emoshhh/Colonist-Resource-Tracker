/**
 * Servis işçisi: maç kayıtlarını diske yazar.
 *
 * İçerik betiği `chrome.downloads`'u kullanamıyor, bu yüzden metni buraya
 * yolluyor. Kayıt yeri İndirilenler/colonist-logs — MV3 uzantısı rastgele bir
 * klasöre yazamaz, yazabildiği tek yer indirilenler (ve onun alt klasörleri).
 *
 * Servis işçisinde Blob/createObjectURL yok; bu yüzden data: URL kullanılıyor.
 */

const FOLDER = 'colonist-logs';

/** Dosya adını güvenli hale getirir: klasörden kaçış ve ayırıcı karakter yok. */
function safeName(raw) {
  const base = String(raw || '')
    .replace(/[\\/]+/g, '_')
    .replace(/\.\.+/g, '_')
    .replace(/[\u0000-\u001f<>:"|?*]/g, '_')
    .trim();
  const name = base || 'kayit.txt';
  return name.endsWith('.txt') ? name : name + '.txt';
}

function toDataUrl(text) {
  return 'data:text/plain;charset=utf-8,' + encodeURIComponent(String(text ?? ''));
}

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!msg || msg.type !== 'colonist-tracker:save-log') return undefined;

  const filename = `${FOLDER}/${safeName(msg.name)}`;
  try {
    chrome.downloads.download(
      {
        url: toDataUrl(msg.text),
        filename,
        // Aynı isim varsa üzerine yazma, sonuna sayı ekle: maç kaydı silinmesin.
        conflictAction: 'uniquify',
        saveAs: false,
      },
      (id) => {
        const err = chrome.runtime.lastError;
        if (err || id === undefined) {
          respond({ ok: false, error: (err && err.message) || 'indirme başlamadı' });
          return;
        }
        respond({ ok: true, id, path: filename });
      },
    );
  } catch (err) {
    respond({ ok: false, error: String((err && err.message) || err) });
  }

  // Yanıt asenkron geliyor: kanal açık kalsın.
  return true;
});

/* ------------------------------------------------- kendi kendine güncelleme
 *
 * "Paketlenmemiş" (unpacked) uzantıyı Chrome kendisi güncellemez: dosyalar
 * diskte, mağaza yok. Ama iki parça birleşince otomatik oluyor:
 *
 *   1. kurulum/guncelle.cmd  — klasörü GitHub'dan tazeler (saatte bir,
 *      Görev Zamanlayıcı ya da cron ile)
 *   2. burası — GitHub'daki manifest sürümüne bakar; diskteki sürümden
 *      farklıysa chrome.runtime.reload() çağırır. reload() dosyaları
 *      DİSKTEN yeniden okur, yani git pull'dan sonra yeni sürüm yüklenir.
 *
 * Aynı sürüm için bir kez denenir (storage'da tutulur): git pull henüz
 * yapılmadıysa sonsuz yeniden yükleme döngüsüne girmeyelim.
 */

const MANIFEST_URL =
  'https://raw.githubusercontent.com/Emoshhh/Colonist-Resource-Tracker/' +
  'claude/colonist-opponent-resource-tracker-sgde1g/extension/manifest.json';
const ALARM = 'colonist-tracker-update-check';
const CHECK_EVERY_MIN = 180;

async function checkForUpdate() {
  const local = chrome.runtime.getManifest().version;
  let remote = null;
  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    remote = (await res.json()).version;
  } catch (err) {
    console.log('[colonist-tracker] sürüm kontrolü yapılamadı:', err && err.message);
    return;
  }
  if (!remote || remote === local) return;

  const { triedVersion } = await chrome.storage.local.get('triedVersion');
  if (triedVersion === remote) {
    // Uzak sürüm yeni ama disk hâlâ eski: güncelleme betiği henüz çalışmamış.
    console.log(`[colonist-tracker] ${remote} sürümü var, klasör güncellenmeyi bekliyor`);
    return;
  }
  await chrome.storage.local.set({ triedVersion: remote });
  console.log(`[colonist-tracker] ${local} -> ${remote}: yeniden yükleniyor`);
  chrome.runtime.reload();
}

if (chrome.alarms) {
  chrome.alarms.create(ALARM, { periodInMinutes: CHECK_EVERY_MIN, delayInMinutes: 2 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) checkForUpdate();
  });
}
