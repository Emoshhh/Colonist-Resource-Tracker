/**
 * Giriş noktası: log'u izle -> olayları çöz -> durumu güncelle -> paneli çiz.
 */

import { Game } from './core/game.js';
import { parseMessage, playersIn, avatarOf } from './core/parser.js';
import { LogWatcher, findOwnUsername } from './dom/log-reader.js';
import { readPlayerPanel, findPlayerPanel } from './dom/player-panel.js';
import {
  imageToResource,
  imageToBuilding,
  isDevCardImage,
  isHiddenCardImage,
} from './core/resources.js';
import { Overlay } from './ui/overlay.js';

const DEBUG = false;
const ME_KEY = 'colonist-tracker-me';

let game = new Game();
let me = null;
let manualMe = null;
let pendingRender = false;
let renderTimer = null;

/**
 * "You stole from X" satırlarını işleyebilmek için kendi adımızı bilmek gerekir.
 * Colonist bunu log'da yazmıyor; ama mesaj avatarı botu insandan ayırıyor.
 * Bot olmayan tek oyuncu varsa o biziz. Birden fazlaysa kullanıcı panelden seçer.
 */
const botPlayers = new Set();
const humanPlayers = new Set();

/** Oyunun kendi oyuncu panelinden okunan satırlar (bağımsız doğrulama kaynağı). */
let panelRows = [];

/**
 * Panelle eşitleme, sayılar OTURDUKTAN sonra yapılır: panel ile log birbirine
 * göre birkaç yüz ms gecikebilir, anlık farka bakıp düzeltmek durumu bozardı.
 * Bu yüzden aynı sayılar üst üste birkaç kez görülmeli ve o sırada yeni bir
 * log satırı işlenmemiş olmalı.
 */
const SYNC_TICK_MS = 900;
const SYNC_STABLE = 3;
let msgSeq = 0;
let syncSig = '';
let syncHits = 0;
let forceSync = false;

function refreshPanel() {
  try {
    panelRows = readPlayerPanel();
  } catch {
    panelRows = [];
  }
  return panelRows;
}

try {
  manualMe = localStorage.getItem(ME_KEY);
} catch {
  manualMe = null;
}

/**
 * Panel başlığında oyunun kendi kart görsellerini kullanabilmek için
 * log'da geçen ikon adreslerini topla. Dosya adlarındaki build hash'i
 * sürümle değiştiğinden sabit adres yerine görüleni kullanmak daha sağlam.
 */
function collectIcons(parts) {
  const found = {};
  for (const part of parts) {
    if (part.t !== 'img' || !part.v) continue;
    const res = imageToResource(part.v);
    if (res) found[res] = part.v;
    else if (isDevCardImage(part.v)) found.devcard = part.v;
    else if (isHiddenCardImage(part.v)) found.unknown = part.v;
    else {
      // Yol/köy/şehir görselleri oyuncu rengine göre değişiyor; başlıkta
      // ilk görüleni kullanmak yeterli, bir daha güncellemiyoruz.
      const item = imageToBuilding(part.v);
      if (item && !overlay.icons[item]) found[item] = part.v;
    }
  }
  if (Object.keys(found).length) overlay.setIcons(found);
}

function noteAvatar(parts) {
  const kind = avatarOf(parts);
  const player = parts.find((p) => p.t === 'player');
  if (!kind || !player) return;
  if (kind === 'bot') botPlayers.add(player.v);
  else humanPlayers.add(player.v);
}

function resolveMe() {
  if (manualMe && game.players.includes(manualMe)) return manualMe;
  // En güvenilir kaynak: oyunun kendi panelindeki "currentUser" satırı.
  const own = panelRows.find((r) => r.isMe);
  if (own) return own.name;
  const candidates = [...humanPlayers].filter((n) => !botPlayers.has(n));
  if (candidates.length === 1) return candidates[0];
  return findOwnUsername();
}

/** Panel okunamıyor ve birden fazla insan varsa kendi adımızı çıkaramayız. */
function meIsAmbiguous() {
  if (manualMe) return false;
  if (panelRows.some((r) => r.isMe)) return false;
  return [...humanPlayers].filter((n) => !botPlayers.has(n)).length > 1;
}

/** Kendi adımızı hangi yoldan bulduk? Döküme yazılır, teşhis için önemli. */
function meSource() {
  if (manualMe && game.players.includes(manualMe)) return 'elle seçildi';
  if (panelRows.some((r) => r.isMe)) return 'oyun paneli (currentUser)';
  const candidates = [...humanPlayers].filter((n) => !botPlayers.has(n));
  if (candidates.length === 1) return 'avatar (tek insan oyuncu)';
  return 'profil adı / bulunamadı';
}

/**
 * Kim hangi zarı attı, düz metin tablo. Oyunun kendi istatistik ekranı yalnız
 * toplam dağılımı gösteriyor; oyuncu kırılımı hiçbir yerde yok, bu yüzden hem
 * hata ayıklama dökümüne hem maç sonu kaydına aynı tablo yazılır.
 */
function diceTableLines(rep) {
  if (!rep.rollsByPlayer || !rep.rollsByPlayer.size) return [];
  const lines = ['', '--- zar dağılımı (kim ne attı) ---'];
  const nums = [];
  for (let n = 2; n <= 12; n += 1) nums.push(String(n).padStart(3));
  lines.push('oyuncu'.padEnd(16) + nums.join('') + '  top.');
  for (const [name, arr] of rep.rollsByPlayer) {
    const total = arr.reduce((a, b) => a + b, 0);
    const cells = [];
    for (let n = 2; n <= 12; n += 1) cells.push(String(arr[n]).padStart(3));
    lines.push(name.slice(0, 15).padEnd(16) + cells.join('') + String(total).padStart(6));
  }
  const all = [];
  for (let n = 2; n <= 12; n += 1) all.push(String(rep.rolls[n]).padStart(3));
  lines.push('TOPLAM'.padEnd(16) + all.join('') + String(rep.rollCount).padStart(6));
  return lines;
}

/**
 * Dökümün başına durum özeti. Ham log tek başına "satır tanındı mı"yı
 * gösteriyor ama "sayım tuttu mu, ben kimim, kaç düzeltme yapıldı"yı
 * göstermiyordu — teşhis için asıl gereken bunlar.
 */
function debugSummary() {
  const rep = game.report();
  const lines = [
    '--- durum ---',
    `ben: ${me || '(çözülemedi)'}  [${meSource()}]`,
    `oyuncular: ${game.players.join(', ') || '(yok)'}`,
    `zar: ${rep.rollCount} · dünya: ${rep.worlds} · kurulum: ${rep.setupPhase ? 'evet' : 'hayır'}`,
    `okunamayan satır: ${rep.missed} · çelişki: ${rep.desyncs} · ` +
      `işlenemeyen "sen": ${rep.unresolvedYou} · panel düzeltmesi: ${rep.corrections}`,
    '',
    '--- oyun paneli (bağımsız kaynak) ---',
  ];

  if (!panelRows.length) lines.push('(panel okunamadı)');

  // Panelde olmayan oyuncu eşitlenemez, yani sessizce düzeltmesiz kalır.
  // Bunu ayrıca söylemek gerekiyor: satır listesinde yokluk göze çarpmıyor.
  const missingFromPanel = game.players.filter((n) => !panelRows.some((r) => r.name === n));
  if (missingFromPanel.length) {
    lines.push(`⚠ PANELDE BULUNAMAYAN OYUNCU: ${missingFromPanel.join(', ')}`);
    lines.push('   (bu oyuncular panelden doğrulanamıyor ve düzeltilemiyor)');
  }

  for (const row of panelRows) {
    const mine = rep.players.find((p) => p.name === row.name);
    const cmp = mine
      ? `hesap ${mine.totalMax}/${mine.devCards}${
          mine.totalMax === row.cards && mine.devCards === row.devCards ? ' ✓' : ' ✗ UYUŞMUYOR'
        }`
      : 'hesapta yok';
    lines.push(`${row.name}${row.isMe ? ' (ben)' : ''}: panel ${row.cards}/${row.devCards} · ${cmp}`);
  }

  // Düzeltmelerin DÖKÜMÜ: yalnız sayısını görmek "neden" sorusuna cevap vermiyor.
  // Kim, hangi yönde, kaç kart, kaçıncı zarda — asıl teşhis bilgisi bu.
  if (game.corrections.length) {
    const shown = game.corrections.slice(-15);
    const dev = game.corrections.filter((c) => c.kind === 'dev').length;
    lines.push(
      '',
      `--- panel düzeltmeleri (${game.corrections.length} tane: ` +
        `${game.corrections.length - dev} kart, ${dev} gelişim kartı) ---`,
    );
    if (shown.length < game.corrections.length) lines.push(`(son ${shown.length} tanesi)`);
    for (const c of shown) {
      const what = c.kind === 'dev' ? 'GK' : 'kart';
      const dir = c.to > c.from ? '+' : '-';
      lines.push(
        `zar ${c.atRoll ?? '?'} · ${c.player} · ${what} ${c.from} -> ${c.to} (${dir}${Math.abs(c.to - c.from)})`,
      );
    }
  }

  lines.push(...diceTableLines(rep));

  lines.push('', '--- hesaplanan eller (kesin alt sınır + bilinmeyen) ---');
  for (const p of rep.players) {
    const cells = p.res.map((c) => `${c.res[0].toUpperCase()}${c.min}${c.certain ? '' : '+'}`).join(' ');
    const pc = p.pieces || {};
    lines.push(
      `${p.name}: ${cells} · ? ${p.unknown} · toplam ${p.totalMax} · GK ${p.devCards}` +
        ` · yol ${pc.road} köy ${pc.settlement} şehir ${pc.city}`,
    );
  }
  return lines.join('\n');
}

/**
 * Oyuncu panelinin ham HTML'i. Panelden bir oyuncu okunamadığında sebebini
 * ancak işaretlemeyi görerek anlayabiliyoruz; bunu her seferinde kullanıcıdan
 * elle istemek yerine döküme koyuyoruz.
 */
function panelHtml() {
  try {
    const el = findPlayerPanel(document);
    if (!el) return '(panel elemanı bulunamadı)';
    const html = el.outerHTML || '';
    const LIMIT = 20000;
    return html.length > LIMIT ? html.slice(0, LIMIT) + `\n…(${html.length} karakterden kırpıldı)` : html;
  } catch (err) {
    return `(panel okunamadı: ${err && err.message})`;
  }
}

/* ------------------------------------------------------------------ kayıt */

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}${p(d.getMinutes())}`
  );
}

/** Dosya adı: tarih + oyuncular. Dosya sisteminin sevmediği karakterler atılır. */
function logFileName() {
  const who = game.players.join('-vs-').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60);
  return `${stamp()}${who ? '_' + who : ''}.txt`;
}

/** Taranan satırları, başlık ve zar tablosuyla birlikte kaydedilecek metne çevirir. */
function fullLogText(scan) {
  const rep = game.report();
  const head = [
    `# colonist maç kaydı — ${new Date().toLocaleString('tr-TR')}`,
    `# oyuncular: ${game.players.join(', ') || '(bilinmiyor)'}`,
    `# ben: ${me || '(çözülemedi)'}`,
    `# satır: ${scan.rows.length}` +
      (scan.gaps ? ` · log'da ${scan.gaps} satırlık boşluk (kaydırıcı silmiş)` : ''),
    `# zar: ${rep.rollCount}`,
  ];
  if (scan.note) head.push(`# not: ${scan.note}`);

  const body = scan.rows.map((r) =>
    r.idx >= 0 ? `[${String(r.idx).padStart(4)}] ${r.text}` : `[   ?] ${r.text}`,
  );

  return [...head, ...diceTableLines(rep), '', '--- log ---', ...body, ''].join('\n');
}

/**
 * Dosyayı indirilenlere yazar. İçerik betiği `chrome.downloads`'u doğrudan
 * kullanamıyor, bu yüzden iş servis işçisine (background.js) yollanır; o da
 * "colonist-logs" alt klasörüne kaydeder. Uzantı bağlamı yoksa (ör. testte)
 * eski usul <a download> ile indirilenlerin köküne düşer.
 */
function saveLogFile(name, text) {
  const msg = { type: 'colonist-tracker:save-log', name, text };
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          const err = chrome.runtime.lastError;
          if (err) reject(new Error(err.message));
          else if (res && res.ok) resolve(res);
          else reject(new Error((res && res.error) || 'kaydedilemedi'));
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  const a = document.createElement('a');
  a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  return Promise.resolve({ ok: true, path: name });
}

/**
 * Tüm log'u tara, dosyaya yaz, panoya kopyala.
 * @param {'button'|'gameover'} how
 */
async function dumpFullLog(how = 'button') {
  const scan = await watcher.collectAllRows();
  if (!scan.rows.length) {
    overlay.flash('Log satırı okunamadı.');
    return null;
  }

  const text = fullLogText(scan);
  const name = logFileName();
  console.log(`[colonist-tracker] maç kaydı (${scan.rows.length} satır)\n` + text);

  let saved = null;
  try {
    saved = await saveLogFile(name, text);
  } catch (err) {
    console.warn('[colonist-tracker] dosya kaydedilemedi', err);
  }

  if (how === 'button') {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.warn('[colonist-tracker] panoya kopyalanamadı', err);
    }
  }

  const where = saved && saved.path ? saved.path : name;
  overlay.flash(
    `${scan.rows.length} satır alındı` +
      (saved ? ` · kaydedildi: ${where}` : ' · dosya kaydedilemedi (konsolda var)') +
      (how === 'button' ? ' · panoya kopyalandı' : ''),
    6000,
  );
  return text;
}

const overlay = new Overlay({
  onReset: () => {
    game = new Game();
    botPlayers.clear();
    humanPlayers.clear();
    syncSig = '';
    syncHits = 0;
    gameOverSaved = false;
    watcher.rescan();
    scheduleRender();
  },
  onPickMe: (name) => {
    manualMe = manualMe === name ? null : name;
    try {
      if (manualMe) localStorage.setItem(ME_KEY, manualMe);
      else localStorage.removeItem(ME_KEY);
    } catch {
      /* yok say */
    }
    me = resolveMe();
    overlay.setMe(me, meIsAmbiguous());
    scheduleRender();
  },
  onDumpFullLog: () => dumpFullLog('button'),
  onCopyDebug: () => {
    const payload = [
      debugSummary(),
      '',
      `--- tanınmayan satırlar (${game.unknownMessages.length}) ---`,
      ...game.unknownMessages,
      '',
      '--- oyuncu paneli (ham HTML) ---',
      panelHtml(),
      '',
      '--- ham log (HTML) ---',
      watcher.dump(),
    ].join('\n');
    // Pano çalışmazsa diye konsola da bas.
    console.log('[colonist-tracker] hata ayıklama dökümü:\n' + payload);
    navigator.clipboard
      .writeText(payload)
      .then(() => console.log('[colonist-tracker] döküm panoya kopyalandı'))
      .catch((err) => console.warn('[colonist-tracker] panoya kopyalanamadı', err));
  },
});

function scheduleRender() {
  if (pendingRender) return;
  pendingRender = true;

  const paint = () => {
    if (!pendingRender) return;
    pendingRender = false;
    clearTimeout(renderTimer);
    overlay.setPanelRows(refreshPanel());
    overlay.render(game.report());
  };

  // Arka plandaki sekmede requestAnimationFrame HİÇ çalışmaz. Yalnız ona
  // güvenilirse pendingRender sonsuza kadar true kalır ve sekmeye dönene
  // dek hiçbir çizim planlanmaz. Bu yüzden zamanlayıcı yedeği var.
  requestAnimationFrame(paint);
  renderTimer = setTimeout(paint, 250);
}

function panelSignature(rows) {
  return rows.map((r) => `${r.name}:${r.cards}:${r.devCards}`).join('|') + `#${msgSeq}`;
}

function applyPanelSync(rows) {
  const fixes = game.syncWithPanel(rows);
  if (fixes.length) {
    console.log('[colonist-tracker] sayım oyun panelinden düzeltildi', fixes);
    scheduleRender();
  }
}

function panelSyncTick() {
  const rows = refreshPanel();
  if (!rows.length) {
    syncSig = '';
    syncHits = 0;
    return;
  }
  const sig = panelSignature(rows);

  // Kaçan satır bilindiğinde bekleme yok: paneldeki sayılar tek doğru kaynak.
  if (forceSync) {
    forceSync = false;
    syncSig = sig;
    syncHits = SYNC_STABLE;
    applyPanelSync(rows);
    return;
  }

  if (sig !== syncSig) {
    syncSig = sig;
    syncHits = 1;
    return;
  }
  if (syncHits >= SYNC_STABLE) return; // bu imza için zaten eşitlendi
  syncHits += 1;
  if (syncHits < SYNC_STABLE) return;

  applyPanelSync(rows);
}

/**
 * Maç sonu satırı ("… won the game!"). Parser bunu yok sayıyor (olay değil),
 * ama kaydı tam o anda almak gerekiyor: birkaç saniye sonra yeni maç başlarsa
 * log sıfırlanır ve maçın istatistiği bir daha hiçbir yerden okunamaz.
 */
const GAME_OVER_RE = /\b(won|wins) the game\b/i;
let gameOverSaved = false;

function handleMessage(parts) {
  msgSeq += 1;
  // Mesajda geçen oyuncuları kaydet (sıra = log'da görülme sırası)
  for (const name of playersIn(parts, game.players)) {
    if (name && !/^you$/i.test(name)) game.addPlayer(name);
  }

  collectIcons(parts);
  noteAvatar(parts);
  refreshPanel();
  me = resolveMe();
  overlay.setMe(me, meIsAmbiguous());

  const event = parseMessage(parts, { players: game.players, me });
  if (DEBUG) console.debug('[colonist-tracker]', event, parts);
  // Çelişki = hesabımız gerçekle çakıştı. Boşlukta olduğu gibi beklemeden
  // panelin sayılarına dönülür; yoksa tek bir hatadan çelişki zinciri doğuyor.
  if (game.applyEvent(event)) {
    forceSync = true;
    setTimeout(panelSyncTick, 400);
  }

  const text = parts
    .filter((p) => p.t === 'text')
    .map((p) => p.v)
    .join(' ');
  if (!gameOverSaved && GAME_OVER_RE.test(text)) {
    gameOverSaved = true;
    // Kazanma satırından sonra birkaç satır daha düşebiliyor; önce otursun.
    setTimeout(() => {
      dumpFullLog('gameover').catch((err) =>
        console.warn('[colonist-tracker] maç sonu kaydı alınamadı', err),
      );
    }, 1500);
  }

  scheduleRender();
}

const watcher = new LogWatcher({
  onMessage: handleMessage,
  onGap: (missed) => {
    game.noteMissed(missed);
    // Satır kaçtığını KESİN biliyoruz; "acaba panel mi geride kaldı" diye
    // beklemenin anlamı yok. Yine de flush() döngüsü bitsin diye kısa bir
    // gecikme: eşitleme, henüz işlenmemiş satırların üstüne binmemeli.
    forceSync = true;
    setTimeout(panelSyncTick, 400);
    scheduleRender();
  },
  onReset: () => {
    game = new Game();
    botPlayers.clear();
    humanPlayers.clear();
    syncSig = '';
    syncHits = 0;
    gameOverSaved = false;
    me = resolveMe();
    overlay.setMe(me, meIsAmbiguous());
    scheduleRender();
  },
  onStatus: (state) => overlay.setStatus(state),
});

function boot() {
  overlay.mount();
  overlay.setStatus('waiting');
  me = resolveMe();
  overlay.setMe(me, meIsAmbiguous());
  watcher.start();
  setInterval(panelSyncTick, SYNC_TICK_MS);
  // Sekme geri gelince paneli de beklemeden tazele (watcher log'u kendi okuyor).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    scheduleRender();
  });
  scheduleRender();
  console.log('[colonist-tracker] hazır');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
