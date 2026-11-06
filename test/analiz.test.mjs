/**
 * Maç kaydı çözümleyici (tools/analiz.mjs).
 * Fixture: gerçek bir 1v1 maçın kaydından kısaltılmış parça.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseMatch } from '../tools/analiz.mjs';

const LOG = `# colonist maç kaydı — 06.11.2026 01:19:54
# oyuncular: FFILHO, Emosh
# ben: Emosh
# satır: 20
# zar: 4

--- log ---
[   2] FFILHO placed a Settlement [Köy]
[   9] Emosh received starting resources [Maden] [Odun] [Koyun]
[  16] FFILHO rolled [zar 3] [zar 3]
[  17] FFILHO got [Tuğla]
[  18] Emosh got [Tuğla] [Tuğla]
[  19] FFILHO built a Road [Yol]
[  21] Emosh rolled [zar 1] [zar 6]
[  22] Emosh moved Robber [?] to [?] [?]
[  23] You stole [Odun] from FFILHO
[  24] Emosh built a Settlement [Köy] ( +1 VP )
[  30] FFILHO rolled [zar 4] [zar 3]
[  31] [?] [?] is blocked by the Robber. No resources produced
[  32] FFILHO moved Robber [?] to [?] [?]
[  33] FFILHO stole [Maden] from you
[  34] FFILHO gave bank [Buğday] [Buğday] [Buğday] [Buğday] and took [Koyun]
[  40] Emosh rolled [zar 3] [zar 4]
[  41] Emosh discarded [Buğday] [Tuğla]
[  42] Emosh gave bank [Koyun] [Koyun] and took [Odun]
[  43] Emosh bought [gelişim kartı]
[  44] Emosh used Knight [?]
[  45] Emosh built a City [Şehir] ( +1 VP )
[  50] [?] Emosh won the game! [?]
`;

const m = parseMatch(LOG, 'test');
const who = (n) => m.players.find((p) => p.name === n);

test('başlık ve kazanan okunur', () => {
  assert.equal(m.me, 'Emosh');
  assert.equal(m.winner, 'Emosh');
  assert.equal(m.rollNo, 4);
  assert.deepEqual(m.players.map((p) => p.name), ['FFILHO', 'Emosh']);
});

test('zarlar atan oyuncuya yazılır', () => {
  assert.equal(who('FFILHO').rolls[6], 1);
  assert.equal(who('FFILHO').rolls[7], 1);
  assert.equal(who('Emosh').rolls[7], 2);
  assert.equal(who('Emosh').rollCount, 2);
});

test('üretim sayılır, başlangıç kaynakları karışmaz', () => {
  assert.equal(who('Emosh').gained['Tuğla'], 2);
  assert.equal(who('Emosh').gainedTotal, 2, 'başlangıçtaki 3 kart üretime girmemeli');
  assert.equal(who('Emosh').starting['Maden'], 1);
  assert.equal(who('FFILHO').gainedTotal, 1);
});

test('"you" satırları doğru oyuncuya bağlanır', () => {
  // "You stole [Odun] from FFILHO" -> çalan Emosh
  assert.equal(who('Emosh').stoleFrom['FFILHO'], 1);
  assert.equal(who('FFILHO').robbedBy['Emosh'], 1);
  // "FFILHO stole [Maden] from you" -> kurban Emosh
  assert.equal(who('FFILHO').stoleFrom['Emosh'], 1);
  assert.equal(who('Emosh').lostCards['Maden'], 1);
});

test('inşa, gelişim kartı ve atılan kart sayılır', () => {
  const e = who('Emosh');
  assert.equal(e.builds['köy'], 1);
  assert.equal(e.builds['şehir'], 1);
  assert.equal(e.devBought, 1);
  assert.equal(e.devUsed['Knight'], 1);
  assert.equal(e.discarded, 2);
  assert.equal(who('FFILHO').builds['yol'], 1);
});

test('takas oranı verilen/alınan karttan çıkar', () => {
  assert.deepEqual(who('Emosh').trades, [{ verdi: ['Koyun', 'Koyun'], aldi: ['Odun'] }]);
  assert.equal(who('FFILHO').trades[0].verdi.length, 4);
});

test('haydutla engellenen üretim o turun zarını atana yazılır', () => {
  assert.equal(who('FFILHO').blocked, 1);
  assert.equal(who('Emosh').blocked, 0);
});

/* ---------------------------------------- haydudun engellediği üretim
 * Log "X is blocked by the Robber" derken KİMİN engellendiğini yazmıyor.
 * Aynı sayı engelsiz geldiğinde kimin ne aldığına bakıp geri çıkarıyoruz.
 */
const ROBBER_LOG = `# colonist maç kaydı — 06.11.2026 10:00:00
# oyuncular: Ali, Veli
# ben: Veli

--- log ---
[  10] Ali rolled [zar 2] [zar 3]
[  11] Ali got [Maden] [Maden]
[  12] Veli got [Odun]
[  20] Veli rolled [zar 1] [zar 4]
[  21] Ali got [Maden] [Maden]
[  22] Veli got [Odun]
[  30] Ali rolled [zar 4] [zar 1]
[  31] [?] [?] is blocked by the Robber. No resources produced
[  32] Veli got [Odun]
[  40] Veli rolled [zar 6] [zar 6]
[  41] Veli got [Buğday]
`;

test('engellenen üretim, aynı sayının engelsiz gelişinden çıkarılır', () => {
  const r = parseMatch(ROBBER_LOG, 'robber');
  const ali = r.players.find((p) => p.name === 'Ali');
  const veli = r.players.find((p) => p.name === 'Veli');

  // 5 geldiğinde Ali 2 maden alıyordu; engelli gelişte hiç almadı.
  assert.equal(ali.robberLost['Maden'], 2);
  assert.equal(ali.robberLostTotal, 2);
  assert.equal(ali.robberBlockedRolls, 1);
  // Veli o atışta odununu almaya devam etti: kaybı yok.
  assert.equal(veli.robberLostTotal, 0);
});

test('örneği olmayan sayı "hesaplanamadı" sayılır, uydurulmaz', () => {
  const log = ROBBER_LOG.replace('[  30] Ali rolled [zar 4] [zar 1]', '[  30] Ali rolled [zar 6] [zar 5]');
  const r = parseMatch(log, 'robber2');
  const ali = r.players.find((p) => p.name === 'Ali');
  assert.equal(ali.robberLostTotal, 0);
  assert.ok(ali.robberUnknown >= 1, 'hesaplanamayan atış işaretlenmeli');
});

test('arazi bilindiğinde kayıp yalnız o kaynağa yazılır', () => {
  const log = ROBBER_LOG.replace(
    '[  31] [?] [?] is blocked by the Robber. No resources produced',
    '[  31] [arazi Odun] [sayı 5] is blocked by the Robber. No resources produced',
  );
  const r = parseMatch(log, 'robber3');
  const ali = r.players.find((p) => p.name === 'Ali');
  // Engellenen arazi odun; Ali'nin maden kaybı bu atışa yazılamaz.
  assert.equal(ali.robberLost['Maden'], 0);
});

test('eksik log\'da zar tablosu başlıktan tamamlanır', () => {
  const log = `# colonist maç kaydı — 06.11.2026 11:00:00
# oyuncular: Ali, Veli
# ben: Veli
# zar: 40

--- zar dağılımı (kim ne attı) ---
oyuncu            2  3  4  5  6  7  8  9 10 11 12  top.
Ali               1  2  2  3  4  3  2  2  1  0  0    20
Veli              0  1  3  4  3  4  2  1  1  1  0    20

--- log ---
[  10] Ali rolled [zar 2] [zar 3]
[  11] Ali got [Maden]
`;
  const r = parseMatch(log, 'kısmi');
  assert.equal(r.partial, true, 'eksik log işaretlenmeli');
  assert.equal(r.bodyRolls, 1);
  assert.equal(r.rollNo, 40);
  assert.equal(r.players.find((p) => p.name === 'Ali').rolls[6], 4);
});
