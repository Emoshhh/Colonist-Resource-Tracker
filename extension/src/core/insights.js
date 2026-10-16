/**
 * Ham sayıları KARARA çeviren saf fonksiyonlar.
 *
 * Buradaki her şey log sayımı ile oyunun kendi panelinden okunan sayıların
 * birleştirilmesiyle çıkar; DOM'a da zamana da bağlı değil, doğrudan test edilir.
 */

/** Standart Catan gelişim kartı destesi. */
export const DEV_DECK = {
  total: 25,
  knight: 14,
  victorypoint: 5,
  roadbuilding: 2,
  yearofplenty: 2,
  monopoly: 2,
};

/** Ödül eşikleri. */
export const LARGEST_ARMY_MIN = 3;
export const LONGEST_ROAD_MIN = 5;

const WIN_VP = 10;

/**
 * Rakip bu tur kazanabilir mi?
 *
 * Colonist rakiplerin GİZLİ zafer puanı kartlarını açık puana katmıyor; kendi
 * satırında ise katıyor. Yani bir rakibin gerçek puanı, panelde yazandan
 * elindeki oynanmamış gelişim kartı kadar fazla olabilir (her biri zafer
 * puanı kartı çıkabilir, destede toplam 5 tane var).
 *
 * @param {object} player  report().players[i]
 * @param {object} panelRow dom/player-panel.js satırı
 * @returns {null|{publicVP, hidden, maxVP, canWin, away}}
 */
export function winThreat(player, panelRow) {
  if (!panelRow || typeof panelRow.vp !== 'number') return null;

  const publicVP = panelRow.vp;
  const held =
    typeof panelRow.devCards === 'number' ? panelRow.devCards : player.devCards || 0;

  // Kendi satırımızda gizli puan zaten açık puana dahil.
  const hidden = panelRow.isMe ? 0 : Math.min(held, DEV_DECK.victorypoint);
  const maxVP = publicVP + hidden;

  return {
    publicVP,
    hidden,
    maxVP,
    canWin: maxVP >= WIN_VP,
    away: Math.max(0, WIN_VP - maxVP),
  };
}

/**
 * Taş sayımını zafer puanından doğrula.
 *
 * Açık puan = köy + 2x şehir + 2 (en uzun yol) + 2 (en büyük ordu).
 * Yani panelde yazan puandan yapıların getirdiğini çıkarınca geriye yalnız
 * ödüller kalmalı: 0, 2 ya da 4. Başka bir şey çıkıyorsa bizim yapı sayımımız
 * yanlıştır (bir inşa satırı kaçmış olabilir).
 *
 * Kendi satırımızda gizli zafer puanı kartları da açık puana eklendiği için
 * artık 0..4 yerine 0..9 arası her şey normal; o yüzden yalnız imkânsız
 * değerler (negatif ya da 9 üstü) işaretlenir.
 *
 * @returns {null|{ok, unexplained, settlements, cities}}
 */
export function pieceCheck(player, panelRow) {
  if (!panelRow || typeof panelRow.vp !== 'number') return null;
  const left = player.pieces;
  if (!left) return null;

  const settlements = 5 - left.settlement;
  const cities = 4 - left.city;
  if (settlements < 0 || cities < 0) return null;

  const unexplained = panelRow.vp - (settlements + 2 * cities);
  const ok = panelRow.isMe
    ? unexplained >= 0 && unexplained <= 4 + DEV_DECK.victorypoint
    : [0, 2, 4].includes(unexplained);

  return { ok, unexplained, settlements, cities };
}

/**
 * Destede kaç gelişim kartı kaldı ve şövalyeler nerede.
 *
 * Çekilen kart sayısı log'dan kesin biliniyor. Şövalyenin kaçının oynandığı da
 * biliniyor; ama ellerde duran oynanmamış kartların kaçının şövalye olduğu
 * bilinmiyor, bu yüzden destedeki şövalye sayısı bir ARALIK olarak verilir.
 */
export function deckState(report, panelRows = []) {
  const bought = report.devBought || 0;
  const left = Math.max(0, DEV_DECK.total - bought);

  let knightsPlayed = 0;
  let held = 0;
  for (const p of report.players) {
    const row = panelRows.find((r) => r.name === p.name);
    // Panelin "en büyük ordu" rozeti oynanmış şövalyeyi sayar; kendi
    // sayımımızdan daha güvenilir, varsa o kullanılır.
    knightsPlayed += typeof row?.knights === 'number' ? row.knights : p.knightsPlayed || 0;
    held += typeof row?.devCards === 'number' ? row.devCards : p.devCards || 0;
  }

  const knightsMax = Math.max(0, DEV_DECK.knight - knightsPlayed);
  return {
    total: DEV_DECK.total,
    left,
    bought,
    knightsPlayed,
    // Ellerde duran kartların hepsi şövalye olsaydı destede en az bu kadar kalırdı.
    knightsMin: Math.max(0, knightsMax - held),
    knightsMax: Math.min(knightsMax, left),
  };
}

/** En büyük ordu / en uzun yol yarışının durumu (eşitlikte ödül el değiştirmez). */
export function awardRace(panelRows = []) {
  const pick = (key, min) => {
    let best = null;
    for (const row of panelRows) {
      const n = row[key];
      if (typeof n !== 'number' || n < min) continue;
      if (!best || n > best.count) best = { name: row.name, count: n };
      else if (n === best.count) best = { ...best, tied: true };
    }
    return best;
  };
  return {
    army: pick('knights', LARGEST_ARMY_MIN),
    road: pick('roadLength', LONGEST_ROAD_MIN),
  };
}
