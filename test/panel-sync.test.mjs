/**
 * Oyunun kendi paneliyle sayım eşitleme testleri.
 *
 * Asıl derdi: 7 gelip biri kart attığında o satırı okuyamazsak (metin
 * değişmişse ya da satır kaçmışsa) sayım yüksek kalır. Panel "kaç kart"
 * kaldığını kesin yazdığı için farkı türü bilinmeyen kart olarak kapatıyoruz.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../extension/src/core/game.js';
import { Tracker } from '../extension/src/core/tracker.js';
import { toVector } from '../extension/src/core/resources.js';

const cell = (rep, name, res) => rep.players.find((p) => p.name === name).res.find((r) => r.res === res);
const of = (rep, name) => rep.players.find((p) => p.name === name);

test('loseUnknown eldeki kartların bileşimine göre dallanır', () => {
  const t = new Tracker(['A']);
  t.gain('A', toVector({ lumber: 2, brick: 1 }));
  t.loseUnknown('A', 1);
  const a = of(t.report(), 'A');
  assert.equal(a.totalMax, 2);
  assert.equal(a.totalMin, 2);
  // 3 karttan biri gitti: odun 1-2, tuğla 0-1 arasında
  const rep = t.report();
  assert.deepEqual([cell(rep, 'A', 'lumber').min, cell(rep, 'A', 'lumber').max], [1, 2]);
  assert.deepEqual([cell(rep, 'A', 'brick').min, cell(rep, 'A', 'brick').max], [0, 1]);
  assert.equal(a.unknown, 1); // 1 kesin odun + türü belirsiz 1 kart
});

test('loseUnknown tek türlü eli belirsizleştirmez', () => {
  const t = new Tracker(['A']);
  t.gain('A', toVector({ ore: 3 }));
  t.loseUnknown('A', 2);
  const rep = t.report();
  assert.equal(cell(rep, 'A', 'ore').min, 1);
  assert.equal(cell(rep, 'A', 'ore').max, 1);
  assert.equal(of(rep, 'A').unknown, 0);
});

test('elde olmayan kadar kart atılamaz (durum korunur, desync yazılır)', () => {
  const t = new Tracker(['A']);
  t.gain('A', toVector({ wool: 1 }));
  const ok = t.loseUnknown('A', 3);
  assert.equal(ok, false);
  assert.equal(t.desyncs.length, 1);
  assert.equal(of(t.report(), 'A').totalMax, 1); // bozulmadı
});

test('gainUnknown kart sayısını artırır ama hiçbir kaynağın alt sınırını artırmaz', () => {
  const t = new Tracker(['A']);
  t.gain('A', toVector({ grain: 1 }));
  t.gainUnknown('A', 2);
  const rep = t.report();
  const a = of(rep, 'A');
  assert.equal(a.totalMax, 3);
  assert.equal(a.known, 1); // yalnız bilinen buğday
  assert.equal(a.unknown, 2);
  for (const r of ['lumber', 'brick', 'wool', 'ore']) {
    assert.equal(cell(rep, 'A', r).min, 0);
  }
});

test('kaçan kart atma satırı panelden kapanır', () => {
  const g = new Game(['Cuda']);
  g.setupPhase = false;
  g.tracker.gain('Cuda', toVector({ lumber: 4, brick: 4 }));
  assert.equal(of(g.report(), 'Cuda').totalMax, 8);

  // 7 geldi, Cuda 4 kart attı ama satırı okuyamadık; panel 4 diyor.
  const fixes = g.syncWithPanel([{ name: 'Cuda', cards: 4, devCards: 0 }]);
  assert.equal(fixes.length, 1);
  assert.deepEqual(fixes[0], { player: 'Cuda', kind: 'cards', from: 8, to: 4 });

  const cuda = of(g.report(), 'Cuda');
  assert.equal(cuda.totalMax, 4);
  assert.equal(cuda.totalMin, 4);
  assert.equal(g.report().corrections, 1);
});

test('düzeltmeden sonra sonraki hamleler belirsizliği yine çözer', () => {
  const g = new Game(['Cuda']);
  g.setupPhase = false;
  g.tracker.gain('Cuda', toVector({ lumber: 3, ore: 3 }));
  g.syncWithPanel([{ name: 'Cuda', cards: 4, devCards: 0 }]); // 2 kart atıldı, türü bilinmiyor

  let cuda = of(g.report(), 'Cuda');
  assert.equal(cuda.totalMax, 4);
  assert.ok(cuda.unknown > 0);

  // Elinde hiç tuğla yoktu: yol yapması imkânsız, durum korunur ve desync yazılır.
  g.applyEvent({ kind: 'build', player: 'Cuda', item: 'road' }); // 1 odun + 1 tuğla
  assert.equal(g.tracker.desyncs.length, 1);
  assert.equal(of(g.report(), 'Cuda').totalMax, 4); // bozulmadı

  // 3 taşı bankaya verebildiyse atılan 2 kartın ikisi de odundu.
  g.applyEvent({ kind: 'tradeBank', player: 'Cuda', gave: { ore: 3 }, took: { brick: 1 } });
  cuda = of(g.report(), 'Cuda');
  assert.equal(cuda.totalMax, 2); // 4 - 3 + 1
  // 3 taş verebildiyse atılan 2 kartın ikisi de odundu
  const rep = g.report();
  assert.equal(cell(rep, 'Cuda', 'ore').min, 0);
  assert.equal(cell(rep, 'Cuda', 'ore').max, 0);
  assert.equal(cell(rep, 'Cuda', 'lumber').min, 1);
  assert.equal(cell(rep, 'Cuda', 'brick').min, 1);
});

test('panelde fazla kart varsa kaçan kazanç bilinmeyen olarak eklenir', () => {
  const g = new Game(['Emosh']);
  g.setupPhase = false;
  g.tracker.gain('Emosh', toVector({ wool: 1 }));
  g.syncWithPanel([{ name: 'Emosh', cards: 3, devCards: 0 }]);
  const e = of(g.report(), 'Emosh');
  assert.equal(e.totalMax, 3);
  assert.equal(e.known, 1);
  assert.equal(e.unknown, 2);
});

test('gelişim kartı sayısı panelden kesinlenir', () => {
  const g = new Game(['Emosh']);
  g.tracker.devCardBought('Emosh');
  const fixes = g.syncWithPanel([{ name: 'Emosh', cards: 0, devCards: 3 }]);
  assert.deepEqual(fixes, [{ player: 'Emosh', kind: 'dev', from: 1, to: 3 }]);
  assert.equal(of(g.report(), 'Emosh').devCards, 3);
});

test('tanınmayan oyuncu ve aşırı fark yok sayılır', () => {
  const g = new Game(['Emosh']);
  g.setupPhase = false;
  g.tracker.gain('Emosh', toVector({ ore: 1 }));
  assert.deepEqual(g.syncWithPanel([{ name: 'Kimse', cards: 9, devCards: 0 }]), []);
  assert.deepEqual(g.syncWithPanel([{ name: 'Emosh', cards: 40, devCards: 0 }]), []);
  assert.equal(of(g.report(), 'Emosh').totalMax, 1);
});

test('dünya kırpması sessizce yapılmaz, sayaca yazılır', () => {
  const t = new Tracker(['A', 'B']);
  t.worldCap = 3; // gerçekte 4000; testte kırpmayı zorlamak için düşürüldü
  t.gain('A', toVector({ lumber: 2, brick: 2, wool: 2, grain: 2, ore: 2 }));
  t.gainUnknown('A', 2); // 15 farklı dünya -> 3'e kırpılır
  assert.ok(t.pruned > 0, 'kırpma sayacı artmalı');
  assert.equal(t.report().pruned, t.pruned);
});

test('sayılar tutuyorsa hiçbir şey yapılmaz', () => {
  const g = new Game(['Emosh']);
  g.setupPhase = false;
  g.tracker.gain('Emosh', toVector({ ore: 2 }));
  assert.deepEqual(g.syncWithPanel([{ name: 'Emosh', cards: 2, devCards: 0 }]), []);
  assert.equal(g.report().corrections, 0);
});
