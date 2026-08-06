/**
 * Canlı panel. Oyunun üstünde sabit duran, sürüklenebilir bir tablo.
 */

import { RESOURCES, RES_LABEL, RES_COLOR, DEFAULT_CARD_ICONS } from '../core/resources.js';

const STORAGE_KEY = 'colonist-tracker-ui';

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function loadUiState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveUiState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* yok say */
  }
}

export class Overlay {
  constructor({ onReset, onCopyDebug, onPickMe } = {}) {
    this.onReset = onReset || (() => {});
    this.onCopyDebug = onCopyDebug || (() => {});
    this.onPickMe = onPickMe || (() => {});
    this.ui = loadUiState();
    this.showRolls = this.ui.showRolls ?? true;
    this.showProbabilities = this.ui.showProbabilities ?? false;
    this.root = null;
    this.me = null;
    this.icons = {};
  }

  /** Log'da görülen gerçek kart görsellerini kullan (hash'ler sürümle değişiyor). */
  setIcons(icons) {
    let changed = false;
    for (const [key, url] of Object.entries(icons)) {
      if (url && this.icons[key] !== url) {
        this.icons[key] = url;
        changed = true;
      }
    }
    return changed;
  }

  mount() {
    if (this.root) return;
    const root = el('div', 'ct-root');
    root.id = 'colonist-tracker';

    // --- başlık
    const header = el('div', 'ct-header');
    const title = el('div', 'ct-title', 'Kaynak Takibi');
    const status = el('span', 'ct-status');
    title.appendChild(status);

    const actions = el('div', 'ct-actions');
    const rollsBtn = el('button', 'ct-btn', '🎲');
    rollsBtn.title = 'Zar istatistiğini göster/gizle';
    rollsBtn.onclick = () => {
      this.showRolls = !this.showRolls;
      this.ui.showRolls = this.showRolls;
      saveUiState(this.ui);
      this.rollsBox.style.display = this.showRolls ? '' : 'none';
    };
    const probBtn = el('button', 'ct-btn', '%');
    probBtn.title = 'Olasılıklı görünüm: kesin sayı yerine beklenen değer göster';
    probBtn.onclick = () => {
      this.showProbabilities = !this.showProbabilities;
      this.ui.showProbabilities = this.showProbabilities;
      saveUiState(this.ui);
      probBtn.classList.toggle('ct-btn-on', this.showProbabilities);
      if (this.lastReport) this.render(this.lastReport);
    };
    probBtn.classList.toggle('ct-btn-on', this.showProbabilities);

    const resetBtn = el('button', 'ct-btn', '⟲');
    resetBtn.title = 'Sayacı sıfırla ve log’u baştan oku';
    resetBtn.onclick = () => this.onReset();
    const debugBtn = el('button', 'ct-btn', '⧉');
    debugBtn.title = 'Tanınmayan log satırlarını panoya kopyala';
    debugBtn.onclick = () => this.onCopyDebug();
    const minBtn = el('button', 'ct-btn', '–');
    minBtn.title = 'Küçült';
    minBtn.onclick = () => this.toggleCollapse();

    actions.append(probBtn, rollsBtn, resetBtn, debugBtn, minBtn);
    header.append(title, actions);

    // --- gövde
    const body = el('div', 'ct-body');
    this.table = el('table', 'ct-table');
    body.appendChild(this.table);

    this.warn = el('div', 'ct-warn');
    this.warn.style.display = 'none';
    body.appendChild(this.warn);

    this.rollsBox = el('div', 'ct-rolls');
    this.rollsBox.style.display = this.showRolls ? '' : 'none';
    body.appendChild(this.rollsBox);

    this.footer = el('div', 'ct-footer');
    body.appendChild(this.footer);

    root.append(header, body);
    document.body.appendChild(root);

    this.root = root;
    this.statusEl = status;
    this.bodyEl = body;

    if (this.ui.left !== undefined && this.ui.top !== undefined) {
      root.style.left = this.ui.left + 'px';
      root.style.top = this.ui.top + 'px';
      root.style.right = 'auto';
    }
    if (this.ui.collapsed) this.toggleCollapse(true);

    this._makeDraggable(header);
  }

  toggleCollapse(force) {
    const collapsed = force !== undefined ? force : !this.root.classList.contains('ct-collapsed');
    this.root.classList.toggle('ct-collapsed', collapsed);
    this.ui.collapsed = collapsed;
    saveUiState(this.ui);
  }

  _makeDraggable(handle) {
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let dragging = false;

    const onMove = (e) => {
      if (!dragging) return;
      const left = Math.max(0, originLeft + e.clientX - startX);
      const top = Math.max(0, originTop + e.clientY - startY);
      this.root.style.left = left + 'px';
      this.root.style.top = top + 'px';
      this.root.style.right = 'auto';
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      this.ui.left = parseInt(this.root.style.left, 10);
      this.ui.top = parseInt(this.root.style.top, 10);
      saveUiState(this.ui);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      const rect = this.root.getBoundingClientRect();
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      originLeft = rect.left;
      originTop = rect.top;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  setStatus(state) {
    this.status = state;
    if (!this.statusEl) return;
    const map = {
      connected: ['#48c774', 'Log’a bağlandı'],
      waiting: ['#ffb020', 'Oyun log’u bekleniyor'],
      error: ['#ff5c5c', 'Hata'],
    };
    const [color, tip] = map[state] || map.waiting;
    this.statusEl.style.background = color;
    this.statusEl.title = tip;
  }

  /**
   * @param {string|null} name  çözülen kendi adımız
   * @param {boolean} ambiguous birden fazla insan oyuncu var, seçim gerekiyor
   */
  setMe(name, ambiguous = false) {
    this.me = name;
    this.ambiguous = ambiguous;
  }

  /** report(): Game#report() çıktısı */
  render(report) {
    if (!this.root) return;
    this.lastReport = report;
    this._renderTable(report);
    this._renderRolls(report);

    const problems = [];
    if (report.unresolvedYou) {
      problems.push(`${report.unresolvedYou} "sen" satırı işlenemedi — kendi adına tıkla`);
    }
    if (report.missed) problems.push(`${report.missed} satır okunamadı (sayım eksik olabilir)`);
    if (report.desyncs) problems.push(`${report.desyncs} log satırı hesapla çelişti`);
    if (report.unknownCount) problems.push(`${report.unknownCount} satır tanınmadı`);
    this.warn.textContent = problems.length ? '⚠ ' + problems.join(' · ') : '';
    this.warn.style.display = problems.length ? '' : 'none';

    const certainty = report.worlds === 1 ? 'kesin' : `${report.worlds} olası dağılım`;
    const setup = report.setupPhase ? ' · kurulum' : '';
    this.footer.textContent = `${certainty}${setup}`;

    // Birden fazla insan oyuncu varsa "you" satırları için seçim gerekir.
    if (!this.me && this.ambiguous && report.players.length) {
      this.footer.textContent += ' · ';
      const pick = el('span', 'ct-hint', 'kendini seç ↑');
      pick.title = 'Log seninle ilgili satırları "you" diye yazar.\nKendi adına tıklayarak eşle.';
      this.footer.appendChild(pick);
    }
  }

  /**
   * Başlık hücresi: oyunun kendi kart görseli.
   * Görsel yoksa ya da yüklenemezse renkli harf rozetine düşer.
   */
  _resourceIcon(res) {
    const src = this.icons[res] || DEFAULT_CARD_ICONS[res];
    const chip = () => {
      const node = el('span', 'ct-chip', RES_LABEL[res][0]);
      node.style.background = RES_COLOR[res];
      node.title = RES_LABEL[res];
      return node;
    };
    if (!src) return chip();

    const img = el('img', 'ct-icon');
    img.src = src;
    img.alt = RES_LABEL[res];
    img.title = RES_LABEL[res];
    img.addEventListener('error', () => {
      const parent = img.parentNode;
      if (parent) parent.replaceChild(chip(), img);
    });
    return img;
  }

  _renderTable(report) {
    const table = this.table;
    table.textContent = '';

    const head = el('tr', 'ct-row ct-head');
    head.appendChild(el('th', 'ct-th ct-name', ''));
    RESOURCES.forEach((res) => {
      const th = el('th', 'ct-th');
      th.appendChild(this._resourceIcon(res));
      head.appendChild(th);
    });

    const unknownTh = el('th', 'ct-th');
    if (this.icons.unknown) {
      const img = el('img', 'ct-icon');
      img.src = this.icons.unknown;
      img.alt = 'Bilinmeyen';
      unknownTh.appendChild(img);
    } else {
      unknownTh.textContent = '?';
    }
    unknownTh.title = 'Türü bilinmeyen kartlar (çalınanlar)';
    unknownTh.classList.add('ct-unknown');
    head.appendChild(unknownTh);

    head.appendChild(el('th', 'ct-th', 'Σ'));

    const devTh = el('th', 'ct-th');
    if (this.icons.devcard) {
      const devImg = el('img', 'ct-icon');
      devImg.src = this.icons.devcard;
      devImg.alt = 'Gelişim kartı';
      devImg.title = 'Elindeki oynanmamış gelişim kartı';
      devTh.appendChild(devImg);
    } else {
      devTh.textContent = 'GK';
      devTh.title = 'Gelişim kartı';
    }
    head.appendChild(devTh);
    table.appendChild(head);

    if (!report.players.length) {
      const tr = el('tr', 'ct-row');
      const td = el('td', 'ct-td ct-empty');
      td.colSpan = 9;
      td.textContent =
        this.status === 'connected'
          ? 'Log’a bağlandı, ilk hamle bekleniyor…'
          : 'Oyun log’u bulunamadı — bir oyuna gir, sonra ⟲’ye bas';
      tr.appendChild(td);
      table.appendChild(tr);
      return;
    }

    report.players.forEach((player) => {
      const tr = el('tr', 'ct-row');
      const name = el('td', 'ct-td ct-name', player.name);
      if (player.name === this.me) name.classList.add('ct-me');
      name.title = `${player.name}\n(tıkla: "ben buyum" olarak işaretle)`;
      name.addEventListener('click', () => this.onPickMe(player.name));
      tr.appendChild(name);

      player.res.forEach((cell) => {
        const td = el('td', 'ct-td');
        if (this.showProbabilities && !cell.certain) {
          // olasılıklı görünüm: beklenen değer + aralık
          td.classList.add('ct-uncertain');
          td.textContent = cell.mean.toFixed(1);
          td.appendChild(el('span', 'ct-range', `${cell.min}-${cell.max}`));
          td.style.background = `rgba(255, 176, 32, ${0.1 + 0.3 * cell.p})`;
        } else {
          // kesin görünüm: garanti alt sınır (fazlası "?" sütununda)
          td.textContent = String(cell.min);
          if (cell.min === 0) td.classList.add('ct-zero');
          if (!cell.certain) td.classList.add('ct-maybe');
        }
        td.title = cell.certain
          ? `${RES_LABEL[cell.res]}: kesin ${cell.min}`
          : `${RES_LABEL[cell.res]}: kesin ${cell.min}, en fazla ${cell.max}\n` +
            `beklenen ${cell.mean.toFixed(2)} · en az 1 bulundurma %${Math.round(cell.p * 100)}`;
        tr.appendChild(td);
      });

      const unknown = el('td', 'ct-td ct-unknown', String(player.unknown));
      if (!player.unknown) unknown.classList.add('ct-zero');
      unknown.title = player.unknown
        ? `${player.unknown} kartın türü bilinmiyor (çalınan kartlar).\n` +
          'Rakip harcama yaptıkça bu sayı kendiliğinden çözülür.'
        : 'Kimliği bilinmeyen kart yok — tüm el kesin.';
      tr.appendChild(unknown);

      const total = el('td', 'ct-td ct-total', String(player.totalMax));
      total.title = `toplam kart (${player.known} kesin + ${player.unknown} bilinmeyen)`;
      tr.appendChild(total);

      const dev = el('td', 'ct-td ct-dev', String(player.devCards));
      dev.title = 'elindeki oynanmamış gelişim kartı';
      tr.appendChild(dev);

      table.appendChild(tr);
    });
  }

  _renderRolls(report) {
    const box = this.rollsBox;
    box.textContent = '';
    if (!report.rollCount) {
      box.appendChild(el('div', 'ct-rolls-empty', 'Henüz zar atılmadı'));
      return;
    }
    const max = Math.max(...report.rolls.slice(2, 13));
    const bars = el('div', 'ct-bars');
    for (let n = 2; n <= 12; n++) {
      const count = report.rolls[n];
      const col = el('div', 'ct-bar-col');
      const bar = el('div', 'ct-bar');
      bar.style.height = `${max ? (count / max) * 34 : 0}px`;
      bar.title = `${n}: ${count} kez`;
      col.append(bar, el('div', 'ct-bar-label', String(n)));
      bars.appendChild(col);
    }
    box.appendChild(bars);
    box.appendChild(el('div', 'ct-rolls-meta', `${report.rollCount} zar`));
  }
}
