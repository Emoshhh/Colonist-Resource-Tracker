/**
 * Oyuncu paneli okuyucu (log'dan bağımsız ikinci kaynak).
 *
 * Panel kart TÜRLERİNİ göstermez — onları yalnızca log'dan çıkarabiliyoruz.
 * Ama iki şeyi kesin verir:
 *   1. Her oyuncunun toplam kart ve gelişim kartı sayısı  -> sayımı doğrulamak için
 *   2. Hangi satırın "sen" olduğu (currentUser)           -> "You stole..." satırları için
 *
 * Class adlarında build hash'i olduğundan seçiciler önek/veri niteliği ile yazılır:
 *   <div class="... playerRow-RMhJ5mpg" data-player-color="1">
 *     <div class="username-M7Jbo6j0">Carie49985693</div>        (kendinde: usernameLarge-...)
 *     <div data-resource-card="true">    ... <div class="count-...">5</div>
 *     <div data-development-card="true"> ... <div class="count-...">2</div>
 *     <div class="... currentUser-JOam6Xvt">                     (yalnız kendi satırında)
 */

export const PANEL_SELECTORS = [
  '[data-player-information-container="true"]',
  '[class*="gamePlayerInformationContainer"]',
  '[class*="playerInformationContainer"]',
];

export function findPlayerPanel(root = document) {
  for (const sel of PANEL_SELECTORS) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/** Eşleşen elemanları toplar; eşleşenin içine inmez (satırlar iç içe değil). */
function collect(el, pred, out) {
  for (const child of el.childNodes || []) {
    if (child.nodeType !== 1) continue;
    if (pred(child)) out.push(child);
    else collect(child, pred, out);
  }
}

function find(el, pred) {
  for (const child of el.childNodes || []) {
    if (child.nodeType !== 1) continue;
    if (pred(child)) return child;
    const hit = find(child, pred);
    if (hit) return hit;
  }
  return null;
}

const hasClass = (re) => (el) => re.test(String(el.className || ''));
const hasAttr = (name) => (el) => !!el.getAttribute && el.getAttribute(name) !== null;

function firstNumber(text) {
  const m = String(text || '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

/**
 * Başarım rozetleri: en büyük ordu (oynanmış şövalye) ve en uzun yol (uzunluk).
 * Hangisinin hangisi olduğu rozetin ikonundan anlaşılır; sayı yanındaki
 * achievementCount kutusunda durur.
 *
 *   <div class="... achievementItem-frxefOzP">
 *     <img class="icon-..." src=".../icon_largest_army.<hash>.svg">
 *     <div class="achievementCount-...">0</div>
 */
function readAchievements(row) {
  const items = [];
  collect(row, hasClass(/achievementItem/i), items);

  let knights = null;
  let roadLength = null;
  for (const item of items) {
    const img = find(item, (el) => el.tagName === 'IMG');
    const src = img && img.getAttribute ? img.getAttribute('src') || '' : '';
    const countEl = find(item, hasClass(/achievementCount/i));
    const n = countEl ? firstNumber(countEl.textContent) : null;
    if (n === null) continue;
    if (/largest_army|army/i.test(src)) knights = n;
    else if (/longest_road|road/i.test(src)) roadLength = n;
  }
  return { knights, roadLength };
}

/** Bir oyuncu satırını oku. */
function readRow(row) {
  const nameEl = find(row, hasClass(/username/i));
  const name = nameEl ? nameEl.textContent.trim() : '';
  if (!name) return null;

  const resEl = find(row, hasAttr('data-resource-card'));
  const devEl = find(row, hasAttr('data-development-card'));

  // Dikkat: kapsayıcının sınıfı "victoryPointsContainer-..." — araya tire
  // girmediği için /victoryPoints-/ yalnız sayının durduğu span'i yakalar.
  const vpEl = find(row, hasClass(/victoryPoints-/));

  return {
    name,
    cards: resEl ? firstNumber(resEl.textContent) : null,
    devCards: devEl ? firstNumber(devEl.textContent) : null,
    vp: vpEl ? firstNumber(vpEl.textContent) : null,
    ...readAchievements(row),
    isMe: !!find(row, hasClass(/currentUser/i)),
  };
}

/** Panel elemanından oyuncu satırlarını çıkar (DOM API'si gerektirmez, testlenebilir). */
export function readPlayerRows(panelEl) {
  if (!panelEl) return [];
  const rows = [];
  collect(panelEl, hasClass(/playerRow/i), rows);
  return rows.map(readRow).filter(Boolean);
}

export function readPlayerPanel(root = document) {
  return readPlayerRows(findPlayerPanel(root));
}
