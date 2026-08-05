/**
 * Log satırı -> oyun olayı çevirici.
 *
 * Girdi, DOM'dan bağımsız "parça" dizisidir:
 *   [{ t:'player', v:'Ahmet' }, { t:'text', v:'got:' }, { t:'img', v:'card_ore' }]
 * Böylece parser saf fonksiyon olarak test edilebilir.
 *
 * Colonist metinleri değiştirdiğinde tek düzeltme noktası: SNIPPETS.
 */

import { imageToResource, isHiddenCardImage, isDevCardImage, normalizeImageName, toVector } from './resources.js';

export const SNIPPETS = {
  setupDone: ['giving out starting resources'],
  placeInitial: ['turn to place'],
  got: ['got:', 'received:'],
  discarded: ['discarded'],
  yearOfPlenty: ['took from bank:', 'took from bank'],
  bankGave: ['gave bank:', 'gave bank'],
  bankTook: ['and took'],
  tradeGiveStart: ['wants to give:', 'gave:', 'traded:'],
  tradeBoundary: ['for:', 'and got:'],
  monopoly: ['stole all of', 'used monopoly', 'monopoly'],
  stole: ['stole'],
  from: ['from'],
  bought: ['bought'],
  built: ['built a', 'built'],
  placed: ['placed a', 'placed'],
  used: ['used'],
};

const BUILD_IMAGES = {
  road: 'road',
  settlement: 'settlement',
  city: 'city',
};

const DEV_PLAY_IMAGES = {
  card_knight: 'knight',
  knight: 'knight',
  card_monopoly: 'monopoly',
  card_yearofplenty: 'yearofplenty',
  card_roadbuilding: 'roadbuilding',
  card_road_building: 'roadbuilding',
  card_victorypoint: 'victorypoint',
};

// --------------------------------------------------------------- yardımcılar

export function flatText(parts) {
  return parts
    .map((p) => (p.t === 'img' ? ' ' : p.v))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lower(parts) {
  return flatText(parts).toLowerCase();
}

function has(parts, needles) {
  const text = lower(parts);
  return needles.some((n) => text.includes(n));
}

/** İlk eşleşen metin parçasının indeksini döner. */
function findMarker(parts, needles, from = 0) {
  for (let i = from; i < parts.length; i++) {
    if (parts[i].t !== 'text') continue;
    const low = parts[i].v.toLowerCase();
    for (const n of needles) {
      if (low.includes(n)) return i;
    }
  }
  return -1;
}

function imagesIn(parts, from = 0, to = parts.length) {
  const out = [];
  for (let i = Math.max(0, from); i < Math.min(parts.length, to); i++) {
    if (parts[i].t === 'img') out.push(normalizeImageName(parts[i].v));
  }
  return out;
}

/** Görsel listesinden kaynak vektörü üretir; kaynak olmayan ikonlar atlanır. */
function resourcesFrom(images) {
  const counts = {};
  let hidden = 0;
  for (const img of images) {
    const res = imageToResource(img);
    if (res) counts[res] = (counts[res] || 0) + 1;
    else if (isHiddenCardImage(img)) hidden += 1;
  }
  return { vec: toVector(counts), obj: counts, hidden };
}

/**
 * Mesajdaki oyuncu adları. Öncelik DOM'dan gelen renkli span'ler;
 * yoksa bilinen isimlerle metin taraması yapılır (boşluklu isimler için gerekli).
 */
export function playersIn(parts, known = []) {
  const tagged = parts.filter((p) => p.t === 'player').map((p) => p.v.trim()).filter(Boolean);
  if (tagged.length) return tagged;

  const text = flatText(parts);
  const found = [];
  const sorted = [...known].sort((a, b) => b.length - a.length);
  const used = [];
  for (const name of sorted) {
    let at = -1;
    while ((at = text.indexOf(name, at + 1)) >= 0) {
      if (used.some(([s, e]) => at < e && at + name.length > s)) continue;
      used.push([at, at + name.length]);
      found.push([at, name]);
    }
  }
  return found.sort((a, b) => a[0] - b[0]).map(([, name]) => name);
}

function firstNumber(text) {
  const m = text.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

// ------------------------------------------------------------------- parser

/**
 * @param {Array<{t:'text'|'img'|'player', v:string}>} parts
 * @param {{players?: string[], me?: string}} ctx
 * @returns {object} kind alanına sahip olay; tanınmayan satırlar için {kind:'unknown'}
 */
export function parseMessage(parts, ctx = {}) {
  if (!parts || !parts.length) return { kind: 'unknown' };
  const known = ctx.players || [];
  const text = lower(parts);
  const names = playersIn(parts, known);
  const actor = names[0] || null;
  const images = imagesIn(parts);

  // 1) Zar
  const dice = images.filter((i) => /^dice_\d/.test(i)).map((i) => Number(i.match(/^dice_(\d+)/)[1]));
  if (dice.length >= 2) {
    return { kind: 'roll', player: actor, total: dice.reduce((a, b) => a + b, 0), dice };
  }

  // 2) Kurulum bitti işareti
  if (has(parts, SNIPPETS.setupDone)) return { kind: 'setupDone' };

  // 3) Tekel (içinde "stole" geçtiği için hırsızlıktan önce bakılmalı)
  const monopolyCard = images.some((i) => i === 'card_monopoly' || i === 'monopoly');
  if (has(parts, SNIPPETS.monopoly) || monopolyCard) {
    const { obj } = resourcesFrom(images);
    const res = Object.keys(obj)[0] || null;
    if (actor && res) {
      // Miktarı yalnızca "stole"dan sonraki kısımda ara ki rakamlı
      // oyuncu adları yanlış okunmasın.
      const tail = flatText(parts).slice(text.lastIndexOf('stole') + 1);
      const amount = firstNumber(text.includes('stole') ? tail : '');
      return {
        kind: 'monopoly',
        player: actor,
        res,
        amount: amount ?? null,
        usedCard: monopolyCard,
      };
    }
  }

  // 4) Yıl bereketi ("took from bank", banka takasındaki "and took"tan önce)
  if (has(parts, SNIPPETS.yearOfPlenty)) {
    const at = findMarker(parts, SNIPPETS.yearOfPlenty);
    const { obj } = resourcesFrom(imagesIn(parts, at + 1));
    if (actor && Object.keys(obj).length) {
      return { kind: 'gain', player: actor, res: obj, reason: 'yearOfPlenty' };
    }
  }

  // 5) Banka / liman takası
  if (has(parts, SNIPPETS.bankGave) && has(parts, SNIPPETS.bankTook)) {
    const gaveAt = findMarker(parts, SNIPPETS.bankGave);
    const tookAt = findMarker(parts, SNIPPETS.bankTook, gaveAt + 1);
    if (actor && gaveAt >= 0 && tookAt > gaveAt) {
      const gave = resourcesFrom(imagesIn(parts, gaveAt + 1, tookAt)).obj;
      const took = resourcesFrom(imagesIn(parts, tookAt + 1)).obj;
      return { kind: 'tradeBank', player: actor, gave, took };
    }
  }

  // 6) Oyuncular arası takas ("and got:" içerdiği için kazançtan önce bakılmalı)
  const tradeStartAt = findMarker(parts, SNIPPETS.tradeGiveStart);
  if (names.length >= 2 && tradeStartAt >= 0 && !has(parts, SNIPPETS.stole)) {
    const boundaryAt = findMarker(parts, SNIPPETS.tradeBoundary, tradeStartAt + 1);
    if (boundaryAt > tradeStartAt) {
      const gave = resourcesFrom(imagesIn(parts, tradeStartAt + 1, boundaryAt)).obj;
      const took = resourcesFrom(imagesIn(parts, boundaryAt + 1)).obj;
      if (Object.keys(gave).length && Object.keys(took).length) {
        return { kind: 'tradePlayer', from: names[0], to: names[1], gave, took };
      }
    }
  }

  // 7) Zar dağıtımı / kazanç
  if (has(parts, SNIPPETS.got)) {
    const at = findMarker(parts, SNIPPETS.got);
    const { obj } = resourcesFrom(imagesIn(parts, at + 1));
    if (actor && Object.keys(obj).length) {
      return { kind: 'gain', player: actor, res: obj, reason: 'got' };
    }
  }

  // 8) Kart atma (7 gelince)
  if (has(parts, SNIPPETS.discarded)) {
    const at = findMarker(parts, SNIPPETS.discarded);
    const { obj } = resourcesFrom(imagesIn(parts, at + 1));
    if (actor && Object.keys(obj).length) {
      return { kind: 'lose', player: actor, res: obj, reason: 'discard' };
    }
  }

  // 9) Hırsızlık
  if (has(parts, SNIPPETS.stole)) {
    const { obj, hidden } = resourcesFrom(images);
    const res = Object.keys(obj)[0] || null;
    let thief = names[0] || null;
    let victim = names[1] || null;
    if (!victim && ctx.me) {
      // "You stole ... from X" / "X stole ... from you"
      const stoleIdx = text.indexOf('stole');
      const youIdx = text.indexOf('you');
      if (youIdx >= 0 && youIdx < stoleIdx) {
        thief = ctx.me;
        victim = names[0] || null;
      } else if (youIdx > stoleIdx) {
        thief = names[0] || null;
        victim = ctx.me;
      }
    }
    if (thief && victim && thief !== victim) {
      if (res && !hidden) return { kind: 'stealKnown', thief, victim, res };
      return { kind: 'stealUnknown', thief, victim };
    }
  }

  // 10) Gelişim kartı satın alma
  if (has(parts, SNIPPETS.bought) && images.some(isDevCardImage)) {
    if (actor) return { kind: 'buy', player: actor, item: 'devcard' };
  }

  // 11) Gelişim kartı oynama
  if (has(parts, SNIPPETS.used)) {
    const played = images.map((i) => DEV_PLAY_IMAGES[i]).find(Boolean);
    if (actor && played) return { kind: 'playDev', player: actor, card: played };
    if (actor && text.includes('road building')) return { kind: 'playDev', player: actor, card: 'roadbuilding' };
  }

  // 12) İnşa (maliyetli)
  if (has(parts, SNIPPETS.built)) {
    const item = images.map((i) => BUILD_IMAGES[i]).find(Boolean);
    if (actor && item) return { kind: 'build', player: actor, item };
  }

  // 13) Yerleştirme (kurulum / yol yapımı — bedava)
  if (has(parts, SNIPPETS.placed)) {
    const item = images.map((i) => BUILD_IMAGES[i]).find(Boolean);
    if (actor && item) return { kind: 'place', player: actor, item };
  }

  // 14) Teklif satırları vb. — bilinçli olarak yok sayılır
  if (has(parts, ['wants to give', 'is trading', 'rolled', 'moved robber', 'turn to place', 'placed'])) {
    return { kind: 'ignore', player: actor };
  }

  return { kind: 'unknown', player: actor, text: flatText(parts) };
}
