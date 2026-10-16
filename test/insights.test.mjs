/**
 * Panel sayılarını karara çeviren saf mantık.
 *
 * Kritik varsayım: colonist RAKİPLERİN gizli zafer puanı kartlarını açık
 * puana katmıyor, kendi satırında katıyor. Kazanma uyarısı buna dayanıyor.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  winThreat,
  pieceCheck,
  deckState,
  awardRace,
  DEV_DECK,
} from '../extension/src/core/insights.js';
import { Game } from '../extension/src/core/game.js';
import { toVector } from '../extension/src/core/resources.js';

const player = (over = {}) => ({
  name: 'Rakip',
  devCards: 0,
  knightsPlayed: 0,
  pieces: { road: 15, settlement: 5, city: 4 },
  ...over,
});
const row = (over = {}) => ({ name: 'Rakip', cards: 0, devCards: 0, vp: 0, isMe: false, ...over });

// ------------------------------------------------------------ kazanma uyarısı

test('gizli zafer puanı kartları rakibin puanına eklenir', () => {
  const t = winThreat(player({ devCards: 3 }), row({ vp: 8, devCards: 3 }));
  assert.equal(t.publicVP, 8);
  assert.equal(t.hidden, 3, 'elindeki 3 kartın üçü de zafer puanı olabilir');
  assert.equal(t.maxVP, 11);
  assert.equal(t.canWin, true);
  assert.equal(t.away, 0);
});

test('kazanma eşiğine ulaşmayan rakip uyarı üretmez', () => {
  const t = winThreat(player({ devCards: 1 }), row({ vp: 7, devCards: 1 }));
  assert.equal(t.maxVP, 8);
  assert.equal(t.canWin, false);
  assert.equal(t.away, 2);
});

test('kendi satırımızda gizli puan iki kez sayılmaz', () => {
  // Panel bizim zafer puanı kartlarımızı zaten açık puana katıyor.
  const t = winThreat(player({ devCards: 4 }), row({ vp: 9, devCards: 4, isMe: true }));
  assert.equal(t.hidden, 0);
  assert.equal(t.maxVP, 9);
  assert.equal(t.canWin, false);
});

test('gizli puan destedeki zafer puanı kartı sayısıyla sınırlı', () => {
  const t = winThreat(player({ devCards: 9 }), row({ vp: 4, devCards: 9 }));
  assert.equal(t.hidden, DEV_DECK.victorypoint, 'destede 5 zafer puanı kartı var');
  assert.equal(t.maxVP, 9);
});

test('panel zafer puanı okunamazsa uyarı üretilmez', () => {
  assert.equal(winThreat(player(), row({ vp: null })), null);
  assert.equal(winThreat(player(), null), null);
});

// ------------------------------------------------- taş sayımı doğrulaması

test('yapılar zafer puanını açıklıyorsa sayım doğrudur', () => {
  // 1 köy + 1 şehir = 1 + 2 = 3 puan; ödül yok, panelde de 3 yazıyor.
  const p = player({ pieces: { road: 13, settlement: 4, city: 3 } });
  const c = pieceCheck(p, row({ vp: 3 }));
  assert.deepEqual([c.settlements, c.cities], [1, 1]);
  assert.equal(c.unexplained, 0);
  assert.equal(c.ok, true);
});

test('açıklanamayan tek sayı fark kaçan inşa satırını ele verir', () => {
  // Aynı oyuncu panelde 4 puan gösteriyorsa bir köyü daha var ama biz
  // onun inşa satırını kaçırmışız: fark 1, ödülle açıklanamaz.
  const p = player({ pieces: { road: 13, settlement: 4, city: 3 } });
  const c = pieceCheck(p, row({ vp: 4 }));
  assert.equal(c.unexplained, 1);
  assert.equal(c.ok, false);
});

test('ödüller 2 ve 4 puanlık farkı açıklar', () => {
  const p = player({ pieces: { road: 13, settlement: 3, city: 4 } }); // 2 köy
  assert.equal(pieceCheck(p, row({ vp: 2 })).ok, true, 'ödülsüz');
  assert.equal(pieceCheck(p, row({ vp: 4 })).ok, true, 'tek ödül');
  assert.equal(pieceCheck(p, row({ vp: 6 })).ok, true, 'iki ödül');
  assert.equal(pieceCheck(p, row({ vp: 5 })).ok, false, 'tek sayı fark imkânsız');
  assert.equal(pieceCheck(p, row({ vp: 1 })).ok, false, 'negatif fark: sayım şişmiş');
});

test('kendi satırımızda gizli puan kartları farkı büyütebilir', () => {
  const p = player({ pieces: { road: 13, settlement: 3, city: 4 } }); // 2 köy
  // 2 yapı puanı + 2 ödül + 3 gizli kart = 7
  assert.equal(pieceCheck(p, row({ vp: 7, isMe: true })).ok, true);
  assert.equal(pieceCheck(p, row({ vp: 1, isMe: true })).ok, false, 'negatif yine imkânsız');
});

// ------------------------------------------------------------- deste durumu

test('destede kalan kart çekilenden hesaplanır', () => {
  const rep = { devBought: 7, players: [player({ devCards: 2 })] };
  const d = deckState(rep, [row({ devCards: 2, knights: 3 })]);
  assert.equal(d.left, DEV_DECK.total - 7);
  assert.equal(d.knightsPlayed, 3, 'panel rozeti kullanılmalı');
});

test('destedeki şövalye sayısı aralık olarak verilir', () => {
  // 4 şövalye oynanmış, ellerde 2 kart var: destede 14-4=10'un
  // en fazla 10'u, en az 10-2=8'i şövalyedir.
  const rep = { devBought: 6, players: [player({ devCards: 2 })] };
  const d = deckState(rep, [row({ devCards: 2, knights: 4 })]);
  assert.equal(d.knightsMax, Math.min(10, d.left));
  assert.equal(d.knightsMin, 8);
});

test('panel okunamazsa kendi sayacımıza düşülür', () => {
  const rep = { devBought: 3, players: [player({ devCards: 1, knightsPlayed: 2 })] };
  const d = deckState(rep, []);
  assert.equal(d.knightsPlayed, 2);
});

// --------------------------------------------------------------- ödül yarışı

test('en büyük ordu ve en uzun yol eşikleri', () => {
  const rows = [
    row({ name: 'A', knights: 2, roadLength: 6 }),
    row({ name: 'B', knights: 3, roadLength: 4 }),
  ];
  const r = awardRace(rows);
  assert.deepEqual(r.army, { name: 'B', count: 3 }, '3 şövalye eşiği');
  assert.deepEqual(r.road, { name: 'A', count: 6 }, '5 yol eşiği');
});

test('eşik altındaki kimse ödülü almaz', () => {
  const r = awardRace([row({ name: 'A', knights: 2, roadLength: 4 })]);
  assert.equal(r.army, null);
  assert.equal(r.road, null);
});

// -------------------------------------------------- motordaki sayaçlarla uçtan uca

test('motor çekilen kartı ve oynanan şövalyeyi sayar', () => {
  const g = new Game(['A']);
  g.setupPhase = false;
  g.tracker.gain('A', toVector({ wool: 9, grain: 9, ore: 9 }));
  for (let i = 0; i < 3; i += 1) g.applyEvent({ kind: 'buy', player: 'A', item: 'devcard' });
  g.applyEvent({ kind: 'playDev', player: 'A', card: 'knight' });
  g.applyEvent({ kind: 'playDev', player: 'A', card: 'knight' });
  g.applyEvent({ kind: 'playDev', player: 'A', card: 'monopoly' });

  const rep = g.report();
  assert.equal(rep.devBought, 3);
  assert.equal(rep.players[0].knightsPlayed, 2, 'yalnız şövalyeler sayılmalı');
  assert.equal(deckState(rep, []).left, DEV_DECK.total - 3);
});
