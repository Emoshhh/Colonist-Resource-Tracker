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
    this.lastEvent = null;
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
    return rep;
  }
}
