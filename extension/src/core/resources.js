/**
 * Kaynak sabitleri ve maliyet tabloları.
 * Bu dosya DOM'a dokunmaz; Node testlerinden doğrudan import edilebilir.
 */

export const RESOURCES = ['lumber', 'brick', 'wool', 'grain', 'ore'];

export const RES_INDEX = RESOURCES.reduce((acc, r, i) => {
  acc[r] = i;
  return acc;
}, {});

/** Panelde gösterilen Türkçe isimler. */
export const RES_LABEL = {
  lumber: 'Odun',
  brick: 'Tuğla',
  wool: 'Koyun',
  grain: 'Buğday',
  ore: 'Maden',
};

/** Panelde kullanılan renkler (colonist kart renklerine yakın). */
export const RES_COLOR = {
  lumber: '#2f7d32',
  brick: '#c0562a',
  wool: '#7cb342',
  grain: '#d9a520',
  ore: '#6b7b8c',
};

/** colonist.io ikon dosya adı -> kaynak. */
export const IMAGE_TO_RESOURCE = {
  card_lumber: 'lumber',
  card_brick: 'brick',
  card_wool: 'wool',
  card_grain: 'grain',
  card_ore: 'ore',
  // Colonist zaman zaman farklı adlandırma kullanabiliyor; toleranslı olalım.
  lumber: 'lumber',
  brick: 'brick',
  wool: 'wool',
  grain: 'grain',
  ore: 'ore',
  card_wood: 'lumber',
  card_sheep: 'wool',
  card_wheat: 'grain',
  card_stone: 'ore',
};

/** Kapalı kart ikonu (çalınan kart, bilinmeyen kaynak). */
export const HIDDEN_CARD_IMAGES = ['card_rescardback', 'rescardback', 'cardback'];

export const DEV_CARD_IMAGES = ['card_devcardback', 'devcardback'];

export const COSTS = {
  road: { lumber: 1, brick: 1 },
  settlement: { lumber: 1, brick: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  devcard: { wool: 1, grain: 1, ore: 1 },
};

export function emptyHand() {
  return [0, 0, 0, 0, 0];
}

/** {ore: 2, grain: 1} -> [0,0,0,1,2] */
export function toVector(obj) {
  const v = emptyHand();
  for (const [res, n] of Object.entries(obj || {})) {
    if (RES_INDEX[res] === undefined) continue;
    v[RES_INDEX[res]] += n;
  }
  return v;
}

/** [0,0,0,1,2] -> {grain: 1, ore: 2} */
export function toObject(vec) {
  const out = {};
  RESOURCES.forEach((res, i) => {
    if (vec[i]) out[res] = vec[i];
  });
  return out;
}

export function vectorSum(vec) {
  return vec.reduce((a, b) => a + b, 0);
}

/** İkon adının içinde geçebilecek kaynak sözcükleri. */
const RESOURCE_TOKENS = {
  lumber: 'lumber',
  wood: 'lumber',
  brick: 'brick',
  clay: 'brick',
  wool: 'wool',
  sheep: 'wool',
  grain: 'grain',
  wheat: 'grain',
  ore: 'ore',
  stone: 'ore',
};

/**
 * İkon adını normalize eder.
 * Colonist dosya adlarına build hash'i ekliyor:
 *   ".../settlement_blue.bad4cdb43d65c329deda.svg" -> "settlement_blue"
 */
export function normalizeImageName(raw) {
  if (!raw) return '';
  let base = String(raw).split('?')[0].split('#')[0].split('/').pop() || '';
  base = base.replace(/\.(svg|png|jpg|jpeg|webp|gif)$/i, '');
  base = base.replace(/\.[0-9a-f]{8,}$/i, '');
  return base.toLowerCase();
}

export function imageToResource(raw) {
  const name = normalizeImageName(raw);
  if (!name) return null;
  if (IMAGE_TO_RESOURCE[name]) return IMAGE_TO_RESOURCE[name];
  for (const token of name.split(/[^a-z0-9]+/)) {
    if (RESOURCE_TOKENS[token]) return RESOURCE_TOKENS[token];
  }
  return null;
}

/** Mesaj başındaki avatar/profil ikonları kaynak değildir. */
export function isAvatarImage(raw) {
  const name = normalizeImageName(raw);
  return /^(icon_bot|avatar|icon_user|profile)/.test(name);
}

export function isHiddenCardImage(raw) {
  const name = normalizeImageName(raw);
  return HIDDEN_CARD_IMAGES.some((h) => name.includes(h));
}

export function isDevCardImage(raw) {
  const name = normalizeImageName(raw);
  return DEV_CARD_IMAGES.some((d) => name.includes(d));
}
