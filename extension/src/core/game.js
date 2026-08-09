/**
 * Olay -> durum uygulayıcı.
 * Parser'dan gelen olayları Tracker üzerinde işler, oyun bağlamını
 * (kurulum aşaması, bedava yollar, zar istatistiği) tutar.
 */

import { Tracker } from './tracker.js';
import { COSTS, toVector } from './resources.js';

export class Game {
  constructor(players = []) {
    this.tracker = new Tracker(players);
    this.setupPhase = true;
    this.freeRoads = 0;
    this.rolls = new Array(13).fill(0);
    this.rollCount = 0;
    this.unknownMessages = [];
    this.missed = 0;
    this.unresolvedYou = 0;
    this.lastEvent = null;
    this.corrections = [];
  }

  /**
   * Oyunun kendi oyuncu paneliyle sayımı eşitle.
   *
   * Panel kart TÜRÜNÜ söylemez ama SAYIYI kesin söyler. Log'da bir satır
   * kaçtıysa (ya da metni tanınmadıysa) fark buradan görülür ve kapatılır:
   *   panelde az  -> o kadar kart türü bilinmeden çıkarılır (7'de atma, kaçan harcama)
   *   panelde çok -> o kadar kart türü bilinmeden eklenir  (kaçan kazanç)
   * Eklenen/çıkarılan kartların türü dallandırıldığı için sonraki hamleler
   * bunları yine kendiliğinden çözer.
   *
   * rows: [{ name, cards, devCards }]  (dom/player-panel.js çıktısı)
   * Dönüş: uygulanan düzeltmeler.
   */
  syncWithPanel(rows, { maxDiff = 12 } = {}) {
    const applied = [];
    if (!Array.isArray(rows) || !rows.length) return applied;

    const totals = new Map();
    for (const p of this.tracker.report().players) totals.set(p.name, p.totalMax);

    for (const row of rows) {
      if (!row || !this.tracker.hasPlayer(row.name)) continue;

      if (typeof row.devCards === 'number' && row.devCards >= 0) {
        const mine = this.tracker.devCards.get(row.name) || 0;
        if (mine !== row.devCards) {
          this.tracker.setDevCards(row.name, row.devCards);
          applied.push({
            player: row.name,
            kind: 'dev',
            from: mine,
            to: row.devCards,
            atRoll: this.rollCount,
          });
        }
      }

      if (typeof row.cards !== 'number' || row.cards < 0) continue;
      const mine = totals.get(row.name);
      if (typeof mine !== 'number') continue;
      const diff = row.cards - mine;
      if (!diff || Math.abs(diff) > maxDiff) continue;

      if (diff < 0) this.tracker.loseUnknown(row.name, -diff);
      else this.tracker.gainUnknown(row.name, diff);
      applied.push({
        player: row.name,
        kind: 'cards',
        from: mine,
        to: row.cards,
        atRoll: this.rollCount,
      });
    }

    if (applied.length) {
      this.corrections.push(...applied);
      if (this.corrections.length > 50) this.corrections.splice(0, this.corrections.length - 50);
    }
    return applied;
  }

  /**
   * Sanal kaydırıcı yüzünden okunamayan satır sayısı.
   * (Oyuna sonradan bağlanıldığında ya da log hızlı akıp satırlar
   * DOM'dan çıktığında olur — sayım bu noktadan sonra eksik kalabilir.)
   */
  noteMissed(count) {
    this.missed += count;
    // Satır kaçırdıysak oyun çoktan başlamıştır.
    if (count > 0) this.setupPhase = false;
  }

  get players() {
    return this.tracker.players;
  }

  addPlayer(name) {
    this.tracker.addPlayer(name);
  }

  /**
   * Kurulum yalnızca yerleştirme ve başlangıç kaynaklarıyla sürer;
   * bunların dışındaki her olay oyunun başladığını gösterir. (Zar satırı
   * kaçırılsa bile inşa maliyetleri düşülmeye devam etsin diye.)
   */
  _noteGameStarted(ev) {
    if (!this.setupPhase) return;
    if (ev.kind === 'place' || ev.kind === 'ignore' || ev.kind === 'unknown') return;
    if (ev.kind === 'gain' && ev.reason === 'starting') return;
    this.setupPhase = false;
  }

  applyEvent(ev) {
    if (!ev) return;
    this.lastEvent = ev;
    this._noteGameStarted(ev);
    const t = this.tracker;

    switch (ev.kind) {
      case 'roll':
        if (ev.total >= 2 && ev.total <= 12) {
          this.rolls[ev.total] += 1;
          this.rollCount += 1;
        }
        break;

      case 'setupDone':
        this.setupPhase = false;
        break;

      case 'gain':
        t.gain(ev.player, toVector(ev.res));
        break;

      case 'lose':
        t.lose(ev.player, toVector(ev.res));
        break;

      case 'tradeBank':
        t.lose(ev.player, toVector(ev.gave));
        t.gain(ev.player, toVector(ev.took));
        break;

      case 'tradePlayer':
        t.transfer(ev.from, ev.to, toVector(ev.gave));
        t.transfer(ev.to, ev.from, toVector(ev.took));
        break;

      case 'stealKnown':
        t.stealKnown(ev.thief, ev.victim, ev.res);
        break;

      case 'stealUnknown':
        t.stealUnknown(ev.thief, ev.victim);
        break;

      case 'monopoly':
        t.monopoly(ev.player, ev.res, ev.amount);
        // Kart oynama satırı ayrı geliyorsa sayaç orada düşülür.
        if (ev.usedCard) t.devCardPlayed(ev.player);
        break;

      case 'buy':
        if (ev.item === 'devcard') {
          t.lose(ev.player, toVector(COSTS.devcard));
          t.devCardBought(ev.player);
        }
        break;

      case 'playDev':
        if (ev.card === 'roadbuilding') this.freeRoads += 2;
        t.devCardPlayed(ev.player);
        break;

      // Colonist hem "built a City" hem "placed a Road" yazabiliyor;
      // ikisi de aynı kuralla işlenir: kurulumda ve yol yapımı kartında bedava.
      case 'build':
      case 'place': {
        if (this.setupPhase) break;
        if (ev.item === 'road' && this.freeRoads > 0) {
          this.freeRoads -= 1;
          break;
        }
        const cost = COSTS[ev.item];
        if (cost) t.lose(ev.player, toVector(cost));
        break;
      }

      case 'stealUnresolved':
        // "You stole from X" — kendi adımız bilinmediği için işlenemedi.
        this.unresolvedYou += 1;
        break;

      case 'unknown':
        if (ev.text) {
          this.unknownMessages.push(ev.text);
          if (this.unknownMessages.length > 200) this.unknownMessages.shift();
        }
        break;

      default:
        break;
    }
  }

  report() {
    const rep = this.tracker.report();
    rep.rolls = this.rolls;
    rep.rollCount = this.rollCount;
    rep.setupPhase = this.setupPhase;
    rep.unknownCount = this.unknownMessages.length;
    rep.missed = this.missed;
    rep.unresolvedYou = this.unresolvedYou;
    rep.corrections = this.corrections.length;
    rep.pruned = this.tracker.pruned;
    return rep;
  }
}
