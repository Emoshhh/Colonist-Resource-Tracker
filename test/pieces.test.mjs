/**
 * Kalan yapı taşı takibi (yol 15, köy 5, şehir 4).
 *
 * İnce kural: şehir var olan bir KÖYÜN üstüne kurulur, yani köy taşı stoğa
 * geri döner. Ayrıca kurulumdaki ve yol yapımı kartıyla kurulan yollar
 * bedavadır ama taşı yine harcar.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../extension/src/core/game.js';
import { toVector, PIECE_SUPPLY } from '../extension/src/core/resources.js';

const left = (g, name) => g.report().players.find((p) => p.name === name).pieces;

function richGame(names = ['A']) {
  const g = new Game(names);
  g.setupPhase = false;
  for (const n of names) g.tracker.gain(n, toVector({ lumber: 20, brick: 20, wool: 20, grain: 20, ore: 20 }));
  return g;
}

test('başlangıçta herkes tam stokla başlar', () => {
  const g = new Game(['A', 'B']);
  assert.deepEqual(left(g, 'A'), { road: 15, settlement: 5, city: 4 });
  assert.deepEqual(left(g, 'B'), PIECE_SUPPLY);
});

test('yol ve köy stoktan düşer', () => {
  const g = richGame();
  g.applyEvent({ kind: 'build', player: 'A', item: 'road' });
  g.applyEvent({ kind: 'build', player: 'A', item: 'road' });
  g.applyEvent({ kind: 'build', player: 'A', item: 'settlement' });
  assert.deepEqual(left(g, 'A'), { road: 13, settlement: 4, city: 4 });
});

test('şehir kurulunca köy taşı geri döner', () => {
  const g = richGame();
  g.applyEvent({ kind: 'build', player: 'A', item: 'settlement' });
  assert.equal(left(g, 'A').settlement, 4);

  g.applyEvent({ kind: 'build', player: 'A', item: 'city' });
  assert.equal(left(g, 'A').city, 3);
  assert.equal(left(g, 'A').settlement, 5, 'köy taşı stoğa dönmeli');
});

test('köy stoğu başlangıç sayısını aşamaz', () => {
  const g = richGame();
  // (gerçekte olmaz ama motor taşmamalı)
  for (let i = 0; i < 3; i += 1) g.applyEvent({ kind: 'build', player: 'A', item: 'city' });
  assert.equal(left(g, 'A').settlement, 5);
  assert.equal(left(g, 'A').city, 1);
});

test('stok eksiye düşmez', () => {
  const g = richGame();
  for (let i = 0; i < 20; i += 1) g.applyEvent({ kind: 'build', player: 'A', item: 'road' });
  assert.equal(left(g, 'A').road, 0);
});

test('kurulumdaki bedava yerleştirmeler de taş harcar', () => {
  const g = new Game(['A']);
  assert.equal(g.setupPhase, true);
  g.applyEvent({ kind: 'place', player: 'A', item: 'settlement' });
  g.applyEvent({ kind: 'place', player: 'A', item: 'road' });
  assert.deepEqual(left(g, 'A'), { road: 14, settlement: 4, city: 4 });
  // kurulumda kaynak düşülmediği de doğrulanıyor
  assert.equal(g.report().players[0].totalMax, 0);
});

test('yol yapımı kartının bedava yolları da taş harcar', () => {
  const g = richGame();
  const before = g.report().players[0].totalMax;

  g.applyEvent({ kind: 'playDev', player: 'A', card: 'roadbuilding' });
  g.applyEvent({ kind: 'build', player: 'A', item: 'road' });
  g.applyEvent({ kind: 'build', player: 'A', item: 'road' });

  assert.equal(left(g, 'A').road, 13, 'taş harcanmalı');
  assert.equal(g.report().players[0].totalMax, before, 'kaynak harcanmamalı');
});

test('taş sayımı kaynak sayımından bağımsız çalışır', () => {
  // Kaynağı yetmeyen bir inşa çelişki üretir ama taş yine de düşülür:
  // taşı geri almanın yolu yok, sayı da panelden doğrulanamıyor.
  const g = new Game(['A']);
  g.setupPhase = false;
  g.applyEvent({ kind: 'build', player: 'A', item: 'road' });
  assert.equal(g.tracker.desyncs.length, 1, 'kaynağı yoktu, çelişki yazılmalı');
  assert.equal(left(g, 'A').road, 14);
});
