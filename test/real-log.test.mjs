/**
 * Canlı oyundan alınan gerçek log satırlarıyla regresyon testleri.
 * (colonist güncel sürümü iki nokta kullanmıyor: "Emosh got 🌲")
 *
 * Her satır iki biçimde denenir:
 *  A) oyuncu adı ayrı bir renkli span içinde
 *  B) oyuncu adı düz metnin parçası  -> ad çıkarımı sezgisel yapılır
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../extension/src/core/game.js';
import { parseMessage, playersIn } from '../extension/src/core/parser.js';

const P = (v) => ({ t: 'player', v });
const T = (v) => ({ t: 'text', v });
const I = (v) => ({ t: 'img', v: `https://colonist.io/dist/images/${v}.svg` });

function parseBoth(spanParts, ctx = {}) {
  const a = parseMessage(spanParts, ctx);
  // B biçimi: player parçalarını metne göm
  const merged = [];
  for (const part of spanParts) {
    if (part.t === 'player') {
      const last = merged[merged.length - 1];
      if (last && last.t === 'text') last.v += ' ' + part.v;
      else merged.push({ t: 'text', v: part.v });
    } else if (part.t === 'text') {
      const last = merged[merged.length - 1];
      if (last && last.t === 'text') last.v += ' ' + part.v;
      else merged.push({ t: 'text', v: part.v });
    } else {
      merged.push(part);
    }
  }
  const b = parseMessage(merged, ctx);
  return [a, b];
}

test('"Buford placed a Settlement"', () => {
  for (const ev of parseBoth([P('Buford'), T('placed a Settlement'), I('settlement_blue')])) {
    assert.equal(ev.kind, 'place');
    assert.equal(ev.item, 'settlement');
    assert.equal(ev.player, 'Buford');
  }
});

test('"Buford received starting resources"', () => {
  for (const ev of parseBoth([
    P('Buford'),
    T('received starting resources'),
    I('card_brick'),
    I('card_lumber'),
    I('card_lumber'),
  ])) {
    assert.equal(ev.kind, 'gain');
    assert.equal(ev.player, 'Buford');
    assert.deepEqual(ev.res, { brick: 1, lumber: 2 });
  }
});

test('"Buford rolled" iki zar', () => {
  for (const ev of parseBoth([P('Buford'), T('rolled'), I('dice_2'), I('dice_5')])) {
    assert.equal(ev.kind, 'roll');
    assert.equal(ev.total, 7);
  }
});

test('"Emosh got 🌲" — iki nokta olmadan', () => {
  for (const ev of parseBoth([P('Emosh'), T('got'), I('card_lumber')])) {
    assert.equal(ev.kind, 'gain');
    assert.equal(ev.player, 'Emosh');
    assert.deepEqual(ev.res, { lumber: 1 });
  }
});

test('"Buford wants to give ... for ..." teklifi yok sayılır', () => {
  for (const ev of parseBoth(
    [P('Buford'), T('wants to give'), I('card_wool'), T('for'), I('card_brick')],
    { players: ['Buford', 'Lili'] },
  )) {
    assert.equal(ev.kind, 'ignore', 'teklif kaynak transferi değildir');
  }
});

test('"Hewart gave 🌾 and got 🧱 from Lili"', () => {
  const parts = [
    P('Hewart'),
    T('gave'),
    I('card_grain'),
    T('and got'),
    I('card_brick'),
    T('from'),
    P('Lili'),
  ];
  for (const ev of parseBoth(parts, { players: ['Hewart', 'Lili'] })) {
    assert.equal(ev.kind, 'tradePlayer');
    assert.equal(ev.from, 'Hewart');
    assert.equal(ev.to, 'Lili');
    assert.deepEqual(ev.gave, { grain: 1 });
    assert.deepEqual(ev.took, { brick: 1 });
  }
});

test('bilinen isim yokken bile takas tarafları çıkarılır', () => {
  const parts = [T('Hewart gave'), I('card_grain'), T('and got'), I('card_brick'), T('from Lili')];
  assert.deepEqual(playersIn(parts, []), ['Hewart', 'Lili']);
  const ev = parseMessage(parts, {});
  assert.equal(ev.kind, 'tradePlayer');
  assert.equal(ev.to, 'Lili');
});

test('gizli çalma ve tekel birbirine karışmaz', () => {
  const steal = parseMessage(
    [P('Buford'), T('stole'), I('card_rescardback'), T('from'), P('Lili')],
    { players: ['Buford', 'Lili'] },
  );
  assert.equal(steal.kind, 'stealUnknown');

  const mono = parseMessage(
    [P('Buford'), T('stole 3'), I('card_ore'), T('from all players')],
    { players: ['Buford', 'Lili'] },
  );
  assert.equal(mono.kind, 'monopoly');
  assert.equal(mono.res, 'ore');
  assert.equal(mono.amount, 3);
});

test('ekran görüntüsündeki açılış sırası uçtan uca işlenir', () => {
  const g = new Game();
  const feed = (parts) => {
    for (const name of playersIn(parts, g.players)) g.addPlayer(name);
    g.applyEvent(parseMessage(parts, { players: g.players }));
  };

  feed([P('Buford'), T('placed a Settlement'), I('settlement_blue')]);
  feed([P('Buford'), T('received starting resources'), I('card_brick'), I('card_lumber'), I('card_lumber')]);
  feed([P('Buford'), T('placed a Road'), I('road_blue')]);
  feed([P('Buford'), T('rolled'), I('dice_2'), I('dice_5')]);
  feed([P('Emosh'), T('got'), I('card_brick')]);
  feed([P('Lili'), T('got'), I('card_lumber'), I('card_brick')]);
  feed([P('Buford'), T('wants to give'), I('card_lumber'), T('for'), I('card_brick')]);
  feed([P('Buford'), T('gave'), I('card_lumber'), T('and got'), I('card_brick'), T('from'), P('Lili')]);

  const rep = g.report();
  const cell = (p, r) => rep.players.find((x) => x.name === p).res.find((x) => x.res === r);

  assert.deepEqual(g.players, ['Buford', 'Emosh', 'Lili']);
  assert.equal(rep.desyncs, 0, 'hiçbir satır çelişki üretmemeli');
  assert.equal(rep.unknownCount, 0, 'tüm satırlar tanınmalı');

  assert.equal(cell('Buford', 'lumber').min, 1, '2 odun aldı, 1 tanesini takas etti');
  assert.equal(cell('Buford', 'brick').min, 2, 'başlangıçtaki 1 + takastan 1');
  assert.equal(cell('Lili', 'lumber').min, 2, 'zardan 1 + takastan 1');
  assert.equal(cell('Lili', 'brick').max, 0, 'tek tuğlasını takasta verdi');
  assert.equal(cell('Emosh', 'brick').min, 1);
  assert.equal(rep.rolls[7], 1);
  assert.equal(rep.setupPhase, false);
});
