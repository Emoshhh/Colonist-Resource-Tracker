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

const overlay = new Overlay({
  onReset: () => {
    game = new Game();
    botPlayers.clear();
    humanPlayers.clear();
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

function handleMessage(parts) {
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
  scheduleRender();
  console.log('[colonist-tracker] hazır');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
