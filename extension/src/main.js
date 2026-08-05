/**
 * Giriş noktası: log'u izle -> olayları çöz -> durumu güncelle -> paneli çiz.
 */

import { Game } from './core/game.js';
import { parseMessage, playersIn } from './core/parser.js';
import { LogWatcher, findOwnUsername } from './dom/log-reader.js';
import { Overlay } from './ui/overlay.js';

const DEBUG = false;

let game = new Game();
let me = null;
let pendingRender = false;

const overlay = new Overlay({
  onReset: () => {
    game = new Game();
    watcher.seen = new WeakSet();
    watcher.flush();
    scheduleRender();
  },
  onCopyDebug: () => {
    const payload = [
      '--- tanınmayan satırlar ---',
      ...game.unknownMessages,
      '',
      '--- ham log (HTML) ---',
      watcher.dump(),
    ].join('\n');
    navigator.clipboard
      .writeText(payload)
      .then(() => console.log('[colonist-tracker] hata ayıklama dökümü panoya kopyalandı'))
      .catch((err) => console.warn('[colonist-tracker] kopyalama başarısız', err));
  },
});

function scheduleRender() {
  if (pendingRender) return;
  pendingRender = true;
  requestAnimationFrame(() => {
    pendingRender = false;
    overlay.render(game.report());
  });
}

function handleMessage(parts) {
  // Mesajda geçen oyuncuları kaydet (sıra = log'da görülme sırası)
  for (const name of playersIn(parts, game.players)) {
    if (name && name !== 'You') game.addPlayer(name);
  }

  const event = parseMessage(parts, { players: game.players, me });
  if (DEBUG) console.debug('[colonist-tracker]', event, parts);
  game.applyEvent(event);
  scheduleRender();
}

const watcher = new LogWatcher({
  onMessage: handleMessage,
  onReset: () => {
    game = new Game();
    me = findOwnUsername();
    overlay.setMe(me);
    scheduleRender();
  },
  onStatus: (state) => overlay.setStatus(state),
});

function boot() {
  overlay.mount();
  overlay.setStatus('waiting');
  me = findOwnUsername();
  overlay.setMe(me);
  watcher.start();
  scheduleRender();
  console.log('[colonist-tracker] hazır');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
