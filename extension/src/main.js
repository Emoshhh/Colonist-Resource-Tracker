/**
 * Giriş noktası: log'u izle -> olayları çöz -> durumu güncelle -> paneli çiz.
 */

import { Game } from './core/game.js';
import { parseMessage, playersIn, avatarOf } from './core/parser.js';
import { LogWatcher, findOwnUsername } from './dom/log-reader.js';
import { readPlayerPanel } from './dom/player-panel.js';
import { imageToResource, isDevCardImage, isHiddenCardImage } from './core/resources.js';
import { Overlay } from './ui/overlay.js';

const DEBUG = false;
const ME_KEY = 'colonist-tracker-me';

let game = new Game();
let me = null;
let manualMe = null;
let pendingRender = false;

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

  lines.push('', '--- hesaplanan eller (kesin alt sınır + bilinmeyen) ---');
  for (const p of rep.players) {
    const cells = p.res.map((c) => `${c.res[0].toUpperCase()}${c.min}${c.certain ? '' : '+'}`).join(' ');
    lines.push(`${p.name}: ${cells} · ? ${p.unknown} · toplam ${p.totalMax} · GK ${p.devCards}`);
  }
  return lines.join('\n');
}

const overlay = new Overlay({
  onReset: () => {
    game = new Game();
    botPlayers.clear();
    humanPlayers.clear();
    syncSig = '';
    syncHits = 0;
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
  onCopyDebug: () => {
    const payload = [
      debugSummary(),
      '',
      `--- tanınmayan satırlar (${game.unknownMessages.length}) ---`,
      ...game.unknownMessages,
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
  requestAnimationFrame(() => {
    pendingRender = false;
    overlay.setPanelRows(refreshPanel());
    overlay.render(game.report());
  });
}

function panelSignature(rows) {
  return rows.map((r) => `${r.name}:${r.cards}:${r.devCards}`).join('|') + `#${msgSeq}`;
}

function panelSyncTick() {
  const rows = refreshPanel();
  if (!rows.length) {
    syncSig = '';
    syncHits = 0;
    return;
  }
  const sig = panelSignature(rows);
  if (sig !== syncSig) {
    syncSig = sig;
    syncHits = 1;
    return;
  }
  if (syncHits >= SYNC_STABLE) return; // bu imza için zaten eşitlendi
  syncHits += 1;
  if (syncHits < SYNC_STABLE) return;

  const fixes = game.syncWithPanel(rows);
  if (fixes.length) {
    console.log('[colonist-tracker] sayım oyun panelinden düzeltildi', fixes);
    scheduleRender();
  }
}

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
  game.applyEvent(event);
  scheduleRender();
}

const watcher = new LogWatcher({
  onMessage: handleMessage,
  onGap: (missed) => {
    game.noteMissed(missed);
    scheduleRender();
  },
  onReset: () => {
    game = new Game();
    botPlayers.clear();
    humanPlayers.clear();
    syncSig = '';
    syncHits = 0;
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
  scheduleRender();
  console.log('[colonist-tracker] hazır');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
