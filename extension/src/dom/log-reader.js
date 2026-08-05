/**
 * colonist.io DOM adaptörü: oyun log'unu bulur ve mesajları
 * parser'ın anladığı "parça" dizisine çevirir.
 *
 * Colonist id/class isimlerini değiştirdiğinde çalışmaya devam etmesi için
 * log kutusu önce bilinen seçicilerle, bulunamazsa içeriğe bakılarak aranır.
 */

export const LOG_SELECTORS = [
  '#game-log-text',
  '.game-log-text',
  '[id*="game-log"]',
  '[class*="game-log"]',
  '[class*="message-post"]',
];

/** Bir log satırında geçmesi beklenen fiiller. */
const LOG_LINE_RE =
  /\b(rolled|placed a|received starting resources|got|built a|bought|stole|discarded|gave|took|used|moved robber|wants to give)\b/i;

function bySelectors(root) {
  for (const sel of LOG_SELECTORS) {
    let el = root.querySelector(sel);
    if (!el) continue;
    // "message-post" tek bir satırı işaret eder; kapsayıcısını al.
    if (sel.includes('message-post') && el.parentElement) el = el.parentElement;
    if (el.children.length >= 1) return el;
  }
  return null;
}

/** İçeriğe bakarak log kutusunu tahmin eder: en çok log satırı içeren en dar eleman. */
export function discoverLogElement(root = document) {
  const body = root.body || root;
  if (!body || !body.getElementsByTagName) return null;

  let best = null;
  let bestHits = 0;
  let bestSize = Infinity;

  for (const el of body.getElementsByTagName('*')) {
    const kids = el.children;
    if (kids.length < 3) continue;

    let hits = 0;
    const limit = Math.min(kids.length, 60);
    for (let i = 0; i < limit; i++) {
      const text = kids[i].textContent;
      if (text && text.length <= 200 && LOG_LINE_RE.test(text)) hits++;
    }
    if (hits < 3) continue;

    const size = el.getElementsByTagName('*').length;
    if (hits > bestHits || (hits === bestHits && size < bestSize)) {
      best = el;
      bestHits = hits;
      bestSize = size;
    }
  }
  return best;
}

export function findLogElement(root = document) {
  return bySelectors(root) || discoverLogElement(root);
}

export function findOwnUsername(root = document) {
  const el =
    root.querySelector('#header_profile_username') ||
    root.querySelector('[class*="header_profile_username"]');
  return el ? el.textContent.trim() : null;
}

function inlineBackgroundUrl(el) {
  const bg = el.style && el.style.backgroundImage;
  if (!bg) return null;
  const m = bg.match(/url\(["']?(.*?)["']?\)/);
  return m ? m[1] : null;
}

/** CSS sınıfıyla çizilen ikonlar için hesaplanmış arka planı da dener. */
function computedBackgroundUrl(el) {
  if (typeof getComputedStyle !== 'function') return null;
  if (el.children.length || (el.textContent || '').trim()) return null;
  try {
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === 'none') return null;
    const m = bg.match(/url\(["']?(.*?)["']?\)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function looksLikePlayerName(el) {
  if (el.style && el.style.color) return true;
  const cls = String(el.className || '');
  return /semibold|player-?name|username/i.test(cls);
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
        parts.push({
          t: 'img',
          v: child.getAttribute('src') || child.getAttribute('alt') || child.className || '',
        });
        continue;
      }

      const bg = inlineBackgroundUrl(child) || computedBackgroundUrl(child);
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
 * Yeni oyun başladığında (log kutusu değiştiğinde ya da sıfırlandığında) onReset çağrılır.
 */
export class LogWatcher {
  constructor({ onMessage, onReset, onStatus } = {}) {
    this.onMessage = onMessage || (() => {});
    this.onReset = onReset || (() => {});
    this.onStatus = onStatus || (() => {});
    this.logEl = null;
    this.seen = new WeakSet();
    this.lastCount = 0;
    this.observer = null;
    this.timer = null;
  }

  start() {
    this.timer = setInterval(() => this._ensureLog(), 1500);
    this._ensureLog();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.observer) this.observer.disconnect();
    this.timer = null;
    this.observer = null;
  }

  _ensureLog() {
    // Mevcut kutu hâlâ sayfada mı?
    if (this.logEl && !document.contains(this.logEl)) this.logEl = null;

    if (this.logEl) {
      // Log boşaldıysa yeni oyun başlamıştır.
      const count = this.logEl.children.length;
      if (count < this.lastCount && count <= 3) {
        this.seen = new WeakSet();
        this.onReset();
      }
      this.lastCount = count;
      return;
    }

    const el = findLogElement();
    if (!el) {
      this.onStatus('waiting');
      return;
    }

    this.logEl = el;
    this.seen = new WeakSet();
    this.lastCount = el.children.length;
    if (this.observer) this.observer.disconnect();
    this.onReset();
    this.onStatus('connected');

    this.observer = new MutationObserver(() => this.flush());
    this.observer.observe(el, { childList: true, subtree: true });
    this.flush();
  }

  /** Log kutusunu yeniden ara (panelde ⟲ düğmesi). */
  rescan() {
    this.logEl = null;
    this.seen = new WeakSet();
    this.lastCount = 0;
    this._ensureLog();
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

  /** Hata ayıklama dökümü: seçilen kutu + ilk satırların ham HTML'i. */
  dump() {
    if (!this.logEl) return 'log kutusu bulunamadı';
    const desc = `<${this.logEl.tagName.toLowerCase()} id="${this.logEl.id}" class="${this.logEl.className}"> (${this.logEl.children.length} satır)`;
    const rows = Array.from(this.logEl.children)
      .slice(0, 25)
      .map((c) => c.outerHTML)
      .join('\n');
    return `${desc}\n\n${rows}`;
  }
}
