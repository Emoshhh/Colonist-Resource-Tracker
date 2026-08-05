/**
 * Canlı panel. Oyunun üstünde sabit duran, sürüklenebilir bir tablo.
 */

import { RESOURCES, RES_LABEL, RES_COLOR } from '../core/resources.js';

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
  constructor({ onReset, onCopyDebug } = {}) {
    this.onReset = onReset || (() => {});
    this.onCopyDebug = onCopyDebug || (() => {});
    this.ui = loadUiState();
    this.showRolls = this.ui.showRolls ?? true;
    this.root = null;
    this.me = null;
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
    const resetBtn = el('button', 'ct-btn', '⟲');
    resetBtn.title = 'Sayacı sıfırla ve log’u baştan oku';
    resetBtn.onclick = () => this.onReset();
    const debugBtn = el('button', 'ct-btn', '⧉');
    debugBtn.title = 'Tanınmayan log satırlarını panoya kopyala';
    debugBtn.onclick = () => this.onCopyDebug();
    const minBtn = el('button', 'ct-btn', '–');
    minBtn.title = 'Küçült';
    minBtn.onclick = () => this.toggleCollapse();

    actions.append(rollsBtn, resetBtn, debugBtn, minBtn);
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

  setMe(name) {
    this.me = name;
  }

  /** report(): Game#report() çıktısı */
  render(report) {
    if (!this.root) return;
    this._renderTable(report);
    this._renderRolls(report);

    const problems = [];
    if (report.desyncs) problems.push(`${report.desyncs} log satırı hesapla çelişti`);
    if (report.unknownCount) problems.push(`${report.unknownCount} satır tanınmadı`);
    this.warn.textContent = problems.length ? '⚠ ' + problems.join(' · ') : '';
    this.warn.style.display = problems.length ? '' : 'none';

    const certainty = report.worlds === 1 ? 'kesin' : `${report.worlds} olası dağılım`;
    this.footer.textContent = `${certainty}${report.setupPhase ? ' · kurulum' : ''}`;
  }

  _renderTable(report) {
    const table = this.table;
    table.textContent = '';

    const head = el('tr', 'ct-row ct-head');
    head.appendChild(el('th', 'ct-th ct-name', ''));
    RESOURCES.forEach((res) => {
      const th = el('th', 'ct-th');
      const chip = el('span', 'ct-chip', RES_LABEL[res][0]);
      chip.style.background = RES_COLOR[res];
      chip.title = RES_LABEL[res];
      th.appendChild(chip);
      head.appendChild(th);
    });
    head.appendChild(el('th', 'ct-th', 'Σ'));
    head.appendChild(el('th', 'ct-th', 'GK'));
    table.appendChild(head);

    report.players.forEach((player) => {
      const tr = el('tr', 'ct-row');
      const name = el('td', 'ct-td ct-name', player.name);
      if (player.name === this.me) name.classList.add('ct-me');
      name.title = player.name;
      tr.appendChild(name);

      player.res.forEach((cell) => {
        const td = el('td', 'ct-td');
        if (cell.certain) {
          td.textContent = String(cell.min);
          if (cell.min === 0) td.classList.add('ct-zero');
          td.title = 'kesin';
        } else {
          td.classList.add('ct-uncertain');
          td.textContent = cell.mean.toFixed(1);
          const range = el('span', 'ct-range', `${cell.min}-${cell.max}`);
          td.appendChild(range);
          td.title =
            `en az ${cell.min}, en fazla ${cell.max}\n` +
            `beklenen ${cell.mean.toFixed(2)}\n` +
            `en az 1 tane bulundurma: %${Math.round(cell.p * 100)}`;
          td.style.background = `rgba(255, 176, 32, ${0.10 + 0.30 * cell.p})`;
        }
        tr.appendChild(td);
      });

      const total = el('td', 'ct-td ct-total', String(player.totalMax));
      total.title = 'toplam kart';
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
