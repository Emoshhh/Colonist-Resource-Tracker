/**
 * Canlı oyundan kopyalanmış log satırlarının UÇTAN UCA testi:
 * ham HTML -> elementToParts -> parseMessage -> Game.
 *
 * Fixture elle yazılmadı, oyundan olduğu gibi alındı (test/fixtures/live-rows.html).
 * Böylece colonist'in gerçek biçimlendirmesi (boş span'ler, "(+1 VP)" eki,
 * çift boşluk, prob_/generated_tile_ ikonları) teste dahil olur.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseHtml, queryAll } from './helpers/html.mjs';
import { elementToParts, hasContent } from '../extension/src/dom/log-reader.js';
import { parseMessage, playersIn } from '../extension/src/core/parser.js';
import { Game } from '../extension/src/core/game.js';

const FIXTURE = readFileSync(
  fileURLToPath(new URL('./fixtures/live-rows.html', import.meta.url)),
  'utf8',
);

/** data-index -> satır elemanı */
function rows() {
  const out = new Map();
  for (const el of queryAll(parseHtml(FIXTURE), '[data-index]')) {
    out.set(el.getAttribute('data-index'), el);
  }
  return out;
}

const ROWS = rows();
const partsOf = (idx) => elementToParts(ROWS.get(idx));
const eventOf = (idx, ctx = {}) => parseMessage(partsOf(idx), { players: ['Emosh', 'TheBigLion'], ...ctx });

test('fixture beklenen satırları içeriyor', () => {
  assert.deepEqual([...ROWS.keys()].sort((a, b) => a - b), [
    '19',
    '113',
    '114',
    '115',
    '116',
    '117',
    '118',
    '119',
    '120',
  ]);
});

test('4 buğday -> 1 odun banka takası', () => {
  const ev = eventOf('113');
  assert.equal(ev.kind, 'tradeBank');
  assert.equal(ev.player, 'Emosh');
  assert.deepEqual(ev.gave, { grain: 4 });
  assert.deepEqual(ev.took, { lumber: 1 });
});

test('"(+1 VP)" eki inşa satırını bozmuyor', () => {
  for (const [idx, who] of [
    ['114', 'Emosh'],
    ['120', 'TheBigLion'],
  ]) {
    const ev = eventOf(idx);
    assert.equal(ev.kind, 'build', idx);
    assert.equal(ev.item, 'settlement', idx);
    assert.equal(ev.player, who, idx);
  }
});

test('<hr> ayırıcı satırı olay üretmez', () => {
  assert.equal(hasContent(partsOf('115')), false);
});

test('zar satırı ikonlardan okunur', () => {
  const ev = eventOf('116');
  assert.equal(ev.kind, 'roll');
  assert.equal(ev.total, 7);
});

test('haydut satırları kaynak hareketi sayılmaz', () => {
  // 117: "Friendly Robber is active..."  118: "moved Robber to <prob_5> <wool tile>"
  // 118'deki generated_tile_wool ikonu YÜN KARTI sanılmamalı.
  assert.equal(eventOf('117').kind, 'ignore');
  assert.equal(eventOf('118').kind, 'ignore');
});

test('"Player has no cards" yok sayılır (boş elden çalma denemesi)', () => {
  const ev = eventOf('119');
  assert.equal(ev.kind, 'ignore');
});

test('gelişim kartı alımı tanınır', () => {
  const ev = eventOf('19');
  assert.equal(ev.kind, 'buy');
  assert.equal(ev.item, 'devcard');
  assert.equal(ev.player, 'TheBigLion');
});

test('satır dizisi baştan sona işlendiğinde tanınmayan satır kalmaz', () => {
  const game = new Game();
  game.setupPhase = false;
  // Motorun elenmemesi için oyunculara bol kaynak ver (bu test tanımayı ölçüyor).
  for (const name of ['Emosh', 'TheBigLion']) {
    game.addPlayer(name);
    game.tracker.gain(name, [9, 9, 9, 9, 9]);
  }

  for (const idx of ['113', '114', '115', '116', '117', '118', '119', '120']) {
    const parts = partsOf(idx);
    if (!hasContent(parts)) continue;
    for (const name of playersIn(parts, game.players)) {
      if (name && !/^you$/i.test(name)) game.addPlayer(name);
    }
    game.applyEvent(parseMessage(parts, { players: game.players, me: 'Emosh' }));
  }

  assert.deepEqual(game.unknownMessages, []);
  assert.equal(game.tracker.desyncs.length, 0);
  assert.equal(game.rollCount, 1);
});
