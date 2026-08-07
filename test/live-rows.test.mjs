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
import { parseMessage, playersIn, avatarOf } from '../extension/src/core/parser.js';
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

const INFO_LINES = readFileSync(
  fileURLToPath(new URL('./fixtures/live-info-lines.txt', import.meta.url)),
  'utf8',
)
  .split('\n')
  .filter((l) => l.trim());

test('fixture beklenen satırları içeriyor', () => {
  assert.deepEqual(
    [...ROWS.keys()].sort((a, b) => a - b),
    ['19', '113', '114', '115', '116', '117', '118', '119', '120', '124', '126', '167', '221', '222', '229', '252', '315', '413', '446'],
  );
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

// 7 gelince atılan kartların GERÇEK satırı. Uzun süre canlı görülemediği için
// kalıp doğrulanamıyordu; bu iki satır artık kaydı tutuyor: "<Ad> discarded <ikonlar>".
test('kart atma satırı gerçek metniyle tanınır', () => {
  const rival = eventOf('252');
  assert.equal(rival.kind, 'lose');
  assert.equal(rival.reason, 'discard');
  assert.equal(rival.player, 'TheBigLion');
  assert.deepEqual(rival.res, { ore: 2, wool: 2, lumber: 1 });

  const mine = eventOf('315');
  assert.equal(mine.kind, 'lose');
  assert.equal(mine.player, 'Emosh');
  assert.deepEqual(mine.res, { lumber: 4, brick: 1 });
});

test('şövalye / tekel / yol yapımı kartları tooltip içinden okunur', () => {
  assert.deepEqual(eventOf('124'), { kind: 'playDev', player: 'Emosh', card: 'knight' });
  assert.deepEqual(eventOf('221'), { kind: 'playDev', player: 'TheBigLion', card: 'monopoly' });
  assert.deepEqual(eventOf('229'), { kind: 'playDev', player: 'Emosh', card: 'roadbuilding' });
});

test('tekel satırı miktarıyla okunur', () => {
  const ev = eventOf('222');
  assert.equal(ev.kind, 'monopoly');
  assert.equal(ev.player, 'TheBigLion');
  assert.equal(ev.res, 'grain');
  assert.equal(ev.amount, 4);
});

test('"sen" içeren çalma satırları kendi adımızla çözülür', () => {
  const iStole = eventOf('126', { me: 'Emosh' });
  assert.deepEqual(iStole, {
    kind: 'stealKnown',
    thief: 'Emosh',
    victim: 'TheBigLion',
    res: 'ore',
  });

  const stolenFromMe = eventOf('167', { me: 'Emosh' });
  assert.deepEqual(stolenFromMe, {
    kind: 'stealKnown',
    thief: 'TheBigLion',
    victim: 'Emosh',
    res: 'lumber',
  });
});

// Oyuncu bağlantısını kaybedince yerine bot geçiyor: aynı ad, bot avatarı.
// Satırın işlenmesi değişmemeli, yalnız avatar 'bot' olarak raporlanmalı.
test('bot devraldığında satırlar aynı şekilde işlenir', () => {
  assert.equal(avatarOf(partsOf('413')), 'bot');
  assert.equal(eventOf('413', { me: 'Emosh' }).kind, 'stealKnown');

  assert.equal(avatarOf(partsOf('446')), 'bot');
  const gain = eventOf('446');
  assert.equal(gain.kind, 'gain');
  assert.deepEqual(gain.res, { ore: 2, grain: 1 });
});

test('bağlantı / bot bilgilendirme satırları yok sayılır', () => {
  for (const text of INFO_LINES) {
    const ev = parseMessage([{ t: 'text', v: text }], { players: ['Emosh', 'TheBigLion'] });
    assert.equal(ev.kind, 'ignore', text);
  }
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
