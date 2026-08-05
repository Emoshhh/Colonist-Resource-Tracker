/**
 * colonist.io DOM adaptörü: oyun log'unu bulur ve mesajları
 * parser'ın anladığı "parça" dizisine çevirir.
 */

export const LOG_SELECTORS = [
  '#game-log-text',
  '.game-log-text',
  '[id*="game-log"]',
  '[class*="game-log"]',
];

export function findLogElement(root = document) {
  for (const sel of LOG_SELECTORS) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

export function findOwnUsername(root = document) {
  const el =
    root.querySelector('#header_profile_username') ||
    root.querySelector('[class*="header_profile_username"]');
  return el ? el.textContent.trim() : null;
}

function backgroundImageUrl(el) {
  const bg = el.style && el.style.backgroundImage;
  if (!bg) return null;
  const m = bg.match(/url\(["']?(.*?)["']?\)/);
  return m ? m[1] : null;
}

function looksLikePlayerName(el) {
  if (!el.style) return false;
  if (el.style.color) return true;
  const cls = String(el.className || '');
  return /semibold|player-?name|bold/i.test(cls);
}

/**
 * Bir log mesajı elemanını parçalara ayırır.
 * @returns {Array<{t:'text'|'img'|'player', v:string}>}
 */
export function elementToParts(el) {
  const parts = [];

  const pushText = (raw) => {
    const v = String(raw).replace(/\s+/g, ' ');
    if (!v.trim()) return;
    const last = parts[parts.length - 1];
    if (last && last.t === 'text') last.v += ' ' + v.trim();
    else parts.push({ t: 'text', v: v.trim() });
  };

  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        pushText(child.nodeValue);
        continue;
      }
      if (child.nodeType !== 1) continue;

      if (child.tagName === 'IMG') {
        parts.push({ t: 'img', v: child.getAttribute('src') || child.getAttribute('alt') || '' });
        continue;
      }

      const bg = backgroundImageUrl(child);
      if (bg) {
        parts.push({ t: 'img', v: bg });
        continue;
      }

      if (looksLikePlayerName(child) && !child.querySelector('img')) {
        const name = child.textContent.trim();
        if (name) {
          parts.push({ t: 'player', v: name });
          continue;
        }
      }

      walk(child);
    }
  };

  walk(el);
  return parts;
}

/**
 * Log'a eklenen yeni mesajları izler.
 * Yeni bir oyun başladığında (log elemanı değiştiğinde) onReset çağrılır.
 */
export class LogWatcher {
  constructor({ onMessage, onReset, onStatus } = {}) {
    this.onMessage = onMessage || (() => {});
    this.onReset = onReset || (() => {});
    this.onStatus = onStatus || (() => {});
    this.logEl = null;
    this.seen = new WeakSet();
    this.observer = null;
    this.timer = null;
  }

  start() {
    this.timer = setInterval(() => this._ensureLog(), 1000);
    this._ensureLog();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.observer) this.observer.disconnect();
    this.timer = null;
    this.observer = null;
  }

  _ensureLog() {
    const el = findLogElement();
    if (!el) {
      if (this.logEl) {
        this.logEl = null;
        this.onStatus('waiting');
      }
      return;
    }
    if (el === this.logEl) return;

    // Yeni log elemanı = yeni oyun
    this.logEl = el;
    this.seen = new WeakSet();
    if (this.observer) this.observer.disconnect();
    this.onReset();
    this.onStatus('connected');

    this.observer = new MutationObserver(() => this.flush());
    this.observer.observe(el, { childList: true, subtree: true });
    this.flush();
  }

  /** Henüz işlenmemiş mesajları sırayla yollar. */
  flush() {
    if (!this.logEl) return;
    for (const child of Array.from(this.logEl.children)) {
      if (this.seen.has(child)) continue;
      this.seen.add(child);
      const parts = elementToParts(child);
      if (parts.length) this.onMessage(parts, child);
    }
  }

  /** Hata ayıklama için ham log dökümü. */
  dump() {
    if (!this.logEl) return '';
    return Array.from(this.logEl.children)
      .map((c) => c.innerHTML)
      .join('\n');
  }
}
