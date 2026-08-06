/**
 * Rakip el takibi — olasılıklı "paralel dünya" modeli.
 *
 * Colonist log'u, rastgele hırsızlık (haydut/şövalye) dışındaki her şeyi
 * açıkça yazar. Bu yüzden belirsizliğin tek kaynağı çalınan kartlardır.
 * Her belirsiz çalma sonrası olası el dağılımlarını ("dünya") dallandırıyoruz;
 * sonraki hamleler imkânsız dünyaları eleyince belirsizlik kendiliğinden çözülür.
 *
 * Dünya = tüm oyuncuların elleri; anahtar olarak düz string kullanılır,
 * böylece aynı sonuca varan dallar otomatik birleşir.
 */

import { RESOURCES, RES_INDEX, emptyHand, vectorSum } from './resources.js';

const EPSILON = 1e-9;
const R = RESOURCES.length;

function encode(hands) {
  let out = '';
  for (let p = 0; p < hands.length; p++) {
    if (p) out += '|';
    out += hands[p].join(',');
  }
  return out;
}

function decode(key, playerCount) {
  if (playerCount === 0) return [];
  const parts = key.split('|');
  const hands = new Array(parts.length);
  for (let p = 0; p < parts.length; p++) {
    const nums = parts[p].split(',');
    const hand = new Array(R);
    for (let i = 0; i < R; i++) hand[i] = Number(nums[i]);
    hands[p] = hand;
  }
  return hands;
}

function cloneHands(hands) {
  return hands.map((h) => h.slice());
}

export class Tracker {
  constructor(players = []) {
    this.players = [];
    this.devCards = new Map(); // oyuncu -> elindeki (oynanmamış) gelişim kartı sayısı
    this.worlds = new Map();
    this.desyncs = [];
    this.history = [];
    this.worldCap = 4000;
    this.worlds.set(encode([]), 1);
    players.forEach((p) => this.addPlayer(p));
  }

  // ---------------------------------------------------------------- oyuncular

  hasPlayer(name) {
    return this.players.includes(name);
  }

  addPlayer(name) {
    if (!name || this.hasPlayer(name)) return this.players.indexOf(name);
    this.players.push(name);
    this.devCards.set(name, 0);
    const next = new Map();
    for (const [key, w] of this.worlds) {
      const hands = decode(key, this.players.length - 1);
      hands.push(emptyHand());
      next.set(encode(hands), w);
    }
    this.worlds = next;
    return this.players.length - 1;
  }

  /** Bilinmeyen oyuncuyu otomatik ekler, indeksini döner. */
  idx(name) {
    const i = this.players.indexOf(name);
    if (i >= 0) return i;
    return this.addPlayer(name);
  }

  // ------------------------------------------------------------------ çekirdek

  /**
   * fn(hands, weight) -> [[hands, weight], ...]  (boş dizi = dünya imkânsız)
   * Sonuç boşsa durum korunur ve desync kaydedilir (parser hatasına karşı sigorta).
   */
  _apply(label, fn) {
    const next = new Map();
    for (const [key, w] of this.worlds) {
      const hands = decode(key, this.players.length);
      const outs = fn(hands, w);
      for (const [nh, nw] of outs) {
        if (nw <= EPSILON) continue;
        const k = encode(nh);
        next.set(k, (next.get(k) || 0) + nw);
      }
    }

    if (next.size === 0) {
      this.desyncs.push({ label, at: this.history.length });
      return false;
    }

    let total = 0;
    for (const w of next.values()) total += w;
    if (total <= EPSILON) {
      this.desyncs.push({ label, at: this.history.length });
      return false;
    }

    let worlds = next;
    if (worlds.size > this.worldCap) {
      const kept = [...worlds.entries()].sort((a, b) => b[1] - a[1]).slice(0, this.worldCap);
      worlds = new Map(kept);
      total = kept.reduce((a, [, w]) => a + w, 0);
    }

    for (const [k, w] of worlds) worlds.set(k, w / total);
    this.worlds = worlds;
    return true;
  }

  // --------------------------------------------------------------- işlemler

  /** Kesin kazanç (bankadan, zar dağıtımı, yıl bereketi...). */
  gain(player, vec) {
    const p = this.idx(player);
    this.history.push({ op: 'gain', player, vec });
    return this._apply(`${player} +${vec}`, (hands, w) => {
      const h = cloneHands(hands);
      for (let i = 0; i < R; i++) h[p][i] += vec[i];
      return [[h, w]];
    });
  }

  /** Kesin kayıp (inşa, satın alma, atma, bankaya verme). Yetersiz dünyalar elenir. */
  lose(player, vec) {
    const p = this.idx(player);
    this.history.push({ op: 'lose', player, vec });
    return this._apply(`${player} -${vec}`, (hands, w) => {
      const h = cloneHands(hands);
      for (let i = 0; i < R; i++) {
        h[p][i] -= vec[i];
        if (h[p][i] < 0) return [];
      }
      return [[h, w]];
    });
  }

  /** İki oyuncu arasında içeriği bilinen takas. */
  transfer(from, to, vec) {
    const a = this.idx(from);
    const b = this.idx(to);
    this.history.push({ op: 'transfer', from, to, vec });
    return this._apply(`${from} -> ${to} ${vec}`, (hands, w) => {
      const h = cloneHands(hands);
      for (let i = 0; i < R; i++) {
        h[a][i] -= vec[i];
        if (h[a][i] < 0) return [];
        h[b][i] += vec[i];
      }
      return [[h, w]];
    });
  }

  /** Kaynağı görünmeyen çalma: kurbanın elindeki her kart için dallanır. */
  stealUnknown(thief, victim) {
    const t = this.idx(thief);
    const v = this.idx(victim);
    this.history.push({ op: 'stealUnknown', thief, victim });
    return this._apply(`${thief} <- ? <- ${victim}`, (hands, w) => {
      const total = vectorSum(hands[v]);
      if (total === 0) return []; // çalma olduysa kurbanın eli boş olamaz
      const outs = [];
      for (let i = 0; i < R; i++) {
        const c = hands[v][i];
        if (!c) continue;
        const h = cloneHands(hands);
        h[v][i] -= 1;
        h[t][i] += 1;
        outs.push([h, (w * c) / total]);
      }
      return outs;
    });
  }

  /**
   * Kaynağı görünen çalma (sen çaldığında/senden çalındığında log gösterir).
   * Bayes güncellemesi: ağırlık, o kartın çekilme olasılığıyla çarpılır.
   */
  stealKnown(thief, victim, res) {
    const t = this.idx(thief);
    const v = this.idx(victim);
    const ri = RES_INDEX[res];
    this.history.push({ op: 'stealKnown', thief, victim, res });
    return this._apply(`${thief} <- ${res} <- ${victim}`, (hands, w) => {
      const c = hands[v][ri];
      if (!c) return [];
      const total = vectorSum(hands[v]);
      const h = cloneHands(hands);
      h[v][ri] -= 1;
      h[t][ri] += 1;
      return [[h, (w * c) / total]];
    });
  }

  /**
   * Tekel. amount biliniyorsa çok güçlü bir kısıt: diğerlerinin toplamı
   * tam olarak amount olmalı — uyuşmayan dünyalar elenir.
   */
  monopoly(player, res, amount = null) {
    const p = this.idx(player);
    const ri = RES_INDEX[res];
    this.history.push({ op: 'monopoly', player, res, amount });
    return this._apply(`${player} monopoly ${res}`, (hands, w) => {
      let taken = 0;
      for (let i = 0; i < hands.length; i++) {
        if (i === p) continue;
        taken += hands[i][ri];
      }
      if (amount !== null && taken !== amount) return [];
      const h = cloneHands(hands);
      for (let i = 0; i < h.length; i++) {
        if (i === p) continue;
        h[i][ri] = 0;
      }
      h[p][ri] += taken;
      return [[h, w]];
    });
  }

  // ------------------------------------------------------------ gelişim kartı

  devCardBought(player) {
    this.idx(player);
    this.devCards.set(player, (this.devCards.get(player) || 0) + 1);
  }

  devCardPlayed(player) {
    this.idx(player);
    this.devCards.set(player, Math.max(0, (this.devCards.get(player) || 0) - 1));
  }

  // ------------------------------------------------------------------- rapor

  /**
   * Oyuncu başına kaynak tahmini:
   *  min/max  -> kesin alt/üst sınır
   *  mean     -> beklenen değer
   *  p        -> en az 1 tane bulundurma olasılığı
   *  certain  -> min === max
   *
   * Ayrıca oyuncu başına:
   *  known    -> kesin bilinen kart sayısı (min'lerin toplamı)
   *  unknown  -> elinde olduğu kesin ama türü bilinmeyen kart sayısı
   *              (toplam - kesin bilinen). Çalınan kartlar burada durur.
   */
  report() {
    const players = this.players.map((name, p) => {
      const res = RESOURCES.map((r, i) => ({
        res: r,
        min: Infinity,
        max: -Infinity,
        mean: 0,
        p: 0,
        certain: false,
        _i: i,
      }));
      let totalMin = Infinity;
      let totalMax = -Infinity;

      for (const [key, w] of this.worlds) {
        const hands = decode(key, this.players.length);
        const hand = hands[p];
        const sum = vectorSum(hand);
        if (sum < totalMin) totalMin = sum;
        if (sum > totalMax) totalMax = sum;
        for (let i = 0; i < R; i++) {
          const c = hand[i];
          const cell = res[i];
          if (c < cell.min) cell.min = c;
          if (c > cell.max) cell.max = c;
          cell.mean += w * c;
          if (c > 0) cell.p += w;
        }
      }

      res.forEach((cell) => {
        if (!Number.isFinite(cell.min)) {
          cell.min = 0;
          cell.max = 0;
        }
        cell.certain = cell.min === cell.max;
        delete cell._i;
      });

      const known = res.reduce((sum, cell) => sum + cell.min, 0);
      const total = Number.isFinite(totalMax) ? totalMax : 0;

      return {
        name,
        res,
        devCards: this.devCards.get(name) || 0,
        totalMin: Number.isFinite(totalMin) ? totalMin : 0,
        totalMax: total,
        known,
        unknown: Math.max(0, total - known),
      };
    });

    return {
      players,
      worlds: this.worlds.size,
      desyncs: this.desyncs.length,
    };
  }

  /** Tek dünyalı, tamamen kesin bir durum mu? */
  isCertain() {
    return this.worlds.size === 1;
  }
}
