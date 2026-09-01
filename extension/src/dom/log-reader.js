/**
 * colonist.io DOM adaptörü: oyun log'unu bulur ve mesajları
 * parser'ın anladığı "parça" dizisine çevirir.
 *
 * İki önemli ayrıntı:
 *  - Colonist id/class isimlerine build hash'i ekliyor, bu yüzden log kutusu
 *    önce önek seçicileriyle, bulunamazsa içeriğe bakılarak aranır.
 *  - Log bir SANAL KAYDIRICI: yalnızca görünen ~8 satır DOM'da durur ve
 *    düğümler geri dönüştürülür. Bu yüzden satırlar düğüm kimliğiyle değil
 *    `data-index` sırasıyla takip edilir; atlanan satırlar da raporlanır.
 */

import { isAvatarImage, avatarKind } from '../core/resources.js';

/**
 * Colonist class adlarına build hash'i ekliyor ("virtualScroller-lSkdkGJi"),
 * bu yüzden seçiciler önek eşlemesiyle yazılır ve içerikle doğrulanır.
 */
export const LOG_SELECTORS = [
  '#game-log-text',
  '[class*="virtualScroller"]',
  '[id*="game-log"]',
  '[class*="game-log"]',
];

/** Bir log satırında geçmesi beklenen fiiller. */
const LOG_LINE_RE =
  /\b(rolled|placed a|received starting resources|got|built a|bought|stole|discarded|gave|took|used|moved robber|wants to give)\b/i;

/**
 * Nadir görülen ve kalıbı doğrulanması gereken satırlar.
 * Sanal kaydırıcı bunları birkaç saniye sonra siliyor; hata ayıklama dökümünde
 * elimizde kalsın diye geçerken ham HTML'leri saklanır.
 */
const ARCHIVE_RE = /\b(discarded|used|bought|stole|monopoly|took from bank|development card)\b/i;
const ARCHIVE_LIMIT = 60;

/**
 * "Yeni oyun başladı" kararı için eşikler.
 *
 * Sanal kaydırıcıda görünen sıra numaralarının aniden düşmesinin İKİ sebebi var:
 * gerçekten yeni oyun başlamıştır ya da kullanıcı log'u yukarı kaydırıp geçmişe
 * bakmaktadır. İkincisini yeni oyun sanmak felaket: sayım sıfırlanır ve geri
 * dönüldüğünde aradaki bütün satırlar "okunamadı" diye raporlanır.
 *
 * Bu yüzden sıfırlama üç şartın hepsini ister:
 *   - kaydırıcı en altta (kullanıcı geçmişe bakmıyor)
 *   - düşük numaralar üst üste birkaç yoklama boyunca sürüyor
 *   - en yüksek numara gerçekten başlangıç bölgesinde
 */
const NEW_GAME_POLLS = 4; // ~2.8 sn
const NEW_GAME_MAX_INDEX = 30;
const SCROLL_BOTTOM_SLACK = 60; // px

/** Bu eleman gerçekten log kutusu mu? (sohbet kutusu da sanal kaydırıcı olabilir) */
function looksLikeLog(el, minHits = 2) {
  if (!el || el.children.length < 2) return false;
  let hits = 0;
  const kids = el.children;
  for (let i = 0; i < Math.min(kids.length, 60); i++) {
    const t = kids[i].textContent;
    if (t && t.length <= 200 && LOG_LINE_RE.test(t)) hits++;
  }
  return hits >= minHits;
}

function bySelectors(root) {
  for (const sel of LOG_SELECTORS) {
    for (const el of root.querySelectorAll(sel)) {
      if (looksLikeLog(el)) return el;
    }
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

/** Sadece avatardan ibaret satırlar (ör. <hr> ayırıcı) olay üretmez. */
export function hasContent(parts) {
  return parts.some((p) => p.t === 'text' || p.t === 'img' || p.t === 'player');
}

/**
 * Bir log mesajı elemanını parçalara ayırır.
 * @returns {Array<{t:'text'|'img'|'player'|'avatar', v:string}>}
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
        const src = child.getAttribute('src') || '';
        const alt = child.getAttribute('alt') || '';
        // Mesaj başındaki avatar kaynak değil; ama bot mu insan mı olduğunu
        // söylüyor — "You stole from X" satırlarında kimin sen olduğunu
        // bulmak için bu bilgi kullanılıyor.
        if (isAvatarImage(src) || alt === 'bot' || alt === 'Player avatar') {
          const kind = avatarKind(src) || (alt === 'bot' ? 'bot' : 'human');
          parts.push({ t: 'avatar', v: kind });
          continue;
        }
        parts.push({ t: 'img', v: src || alt || child.className || '' });
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
  constructor({ onMessage, onReset, onStatus, onGap } = {}) {
    this.onMessage = onMessage || (() => {});
    this.onReset = onReset || (() => {});
    this.onStatus = onStatus || (() => {});
    this.onGap = onGap || (() => {});
    this.logEl = null;
    this.seen = new WeakSet();
    this.lastIndex = -1;
    this.lastCount = 0;
    this.archive = [];
    this.observer = null;
    this.timer = null;
    this.restartStreak = 0;
  }

  /** Satırların kaydığı asıl kutu (log elemanının kendisi ya da bir atası). */
  _scroller() {
    let el = this.logEl;
    for (let i = 0; el && i < 4; i += 1) {
      if (el.scrollHeight > el.clientHeight + 20) return el;
      el = el.parentElement;
    }
    return null;
  }

  /** Kullanıcı log'u yukarı kaydırmış, geçmişe bakıyor mu? */
  isBrowsingHistory() {
    const sc = this._scroller();
    if (!sc) return false;
    return sc.scrollHeight - sc.scrollTop - sc.clientHeight > SCROLL_BOTTOM_SLACK;
  }

  /**
   * Numaralar düştü — yeni oyun mu, yoksa kullanıcı yukarı mı kaydırdı?
   * Emin olamadığımız her durumda "hayır" deriz: yanlış sıfırlama, geç
   * sıfırlamadan çok daha pahalı (⟲ ile elle sıfırlamak zaten mümkün).
   */
  _looksLikeNewGame(maxIdx) {
    const dropped = maxIdx >= 0 && maxIdx + 5 < this.lastIndex;
    if (!dropped || this.isBrowsingHistory()) {
      this.restartStreak = 0;
      return false;
    }
    this.restartStreak += 1;
    return maxIdx <= NEW_GAME_MAX_INDEX && this.restartStreak >= NEW_GAME_POLLS;
  }

  /**
   * Log'u hemen tara. Sekme geri gelince çağrılır: arka plandaki sekmede
   * tarayıcı setInterval'i dakikada bire kadar kısıyor, bu yüzden yalnız
   * yoklamaya güvenmek geri dönüşü saniyelerce geciktirirdi.
   */
  wake() {
    this._ensureLog();
    this.flush();
  }

  start() {
    // Sanal kaydırıcıda mutasyonlar kaçabildiği için düzenli yoklama da yapılır.
    this.timer = setInterval(() => {
      this._ensureLog();
      this.flush();
    }, 700);

    // Sekme geri geldiğinde beklemeden oku.
    this._onWake = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      this.wake();
    };
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', this._onWake);
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('focus', this._onWake);
    }

    this._ensureLog();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.observer) this.observer.disconnect();
    if (this._onWake) {
      if (typeof document !== 'undefined' && document.removeEventListener) {
        document.removeEventListener('visibilitychange', this._onWake);
      }
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('focus', this._onWake);
      }
      this._onWake = null;
    }
    this.timer = null;
    this.observer = null;
  }

  _ensureLog() {
    // Mevcut kutu hâlâ sayfada mı?
    if (this.logEl && !document.contains(this.logEl)) this.logEl = null;

    if (this.logEl) {
      // Sıra numaraları başa döndüyse yeni oyun başlamış OLABİLİR.
      const maxIdx = this._rows().reduce((m, r) => Math.max(m, r.idx), -1);
      if (this._looksLikeNewGame(maxIdx)) this._reset();
      return;
    }

    const el = findLogElement();
    if (!el) {
      this.onStatus('waiting');
      return;
    }

    this.logEl = el;
    if (this.observer) this.observer.disconnect();
    this._reset();
    this.onStatus('connected');

    this.observer = new MutationObserver(() => this.flush());
    this.observer.observe(el, { childList: true, subtree: true, characterData: true });
    this.flush();
  }

  _reset() {
    this.seen = new WeakSet();
    this.lastIndex = -1;
    this.archive = [];
    this.restartStreak = 0;
    this.onReset();
  }

  /** Nadir satırların ham HTML'ini sakla (kaydırıcı silmeden önce). */
  _archiveRow(el, idx) {
    const text = el.textContent || '';
    if (!ARCHIVE_RE.test(text)) return;
    this.archive.push({ idx, html: el.outerHTML });
    if (this.archive.length > ARCHIVE_LIMIT) this.archive.shift();
  }

  /** Log kutusunu yeniden ara (panelde ⟲ düğmesi). */
  rescan() {
    this.logEl = null;
    this._ensureLog();
  }

  /** Görünen satırlar, sıra numarasıyla. */
  _rows() {
    if (!this.logEl) return [];
    return Array.from(this.logEl.children).map((el) => {
      const raw = el.getAttribute && el.getAttribute('data-index');
      const idx = raw === null || raw === undefined ? NaN : Number(raw);
      return { el, idx };
    });
  }

  /**
   * Henüz işlenmemiş mesajları sırayla yollar.
   * Sıra numarası varsa ona güvenilir (düğümler geri dönüştürüldüğü için şart),
   * yoksa düğüm kimliğiyle çalışılır.
   */
  flush() {
    if (!this.logEl) return;
    const rows = this._rows();
    const indexed = rows.filter((r) => Number.isFinite(r.idx));

    if (!indexed.length) {
      for (const { el } of rows) {
        if (this.seen.has(el)) continue;
        this.seen.add(el);
        const parts = elementToParts(el);
        if (hasContent(parts)) this.onMessage(parts, el);
      }
      return;
    }

    indexed.sort((a, b) => a.idx - b.idx);
    for (const { el, idx } of indexed) {
      if (idx <= this.lastIndex) continue;
      const missed = this.lastIndex < 0 ? idx : idx - this.lastIndex - 1;
      if (missed > 0) this.onGap(missed);
      this.lastIndex = idx;
      this._archiveRow(el, idx);
      const parts = elementToParts(el);
      if (hasContent(parts)) this.onMessage(parts, el);
    }
  }

  /** Hata ayıklama dökümü: seçilen kutu + görünen satırların ham HTML'i. */
  dump() {
    if (!this.logEl) return 'log kutusu bulunamadı';
    const desc =
      `<${this.logEl.tagName.toLowerCase()} id="${this.logEl.id}" class="${this.logEl.className}">` +
      ` — görünen ${this.logEl.children.length} satır, son işlenen index ${this.lastIndex}`;
    const rows = Array.from(this.logEl.children)
      .slice(0, 25)
      .map((c) => c.outerHTML)
      .join('\n\n');

    const archived = this.archive.length
      ? `\n\n--- arşivlenen nadir satırlar (${this.archive.length}) ---\n\n` +
        this.archive.map((r) => `[${r.idx}] ${r.html}`).join('\n\n')
      : '\n\n--- arşivlenen nadir satır yok ---';

    return `${desc}\n\n${rows}${archived}`;
  }
}
