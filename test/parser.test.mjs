import test from 'node:test';
import assert from 'node:assert/strict';

import { parseMessage, playersIn, flatText } from '../extension/src/core/parser.js';

const P = (v) => ({ t: 'player', v });
const T = (v) => ({ t: 'text', v });
const I = (v) => ({ t: 'img', v: `https://colonist.io/dist/images/${v}.svg` });

const ctx = { players: ['Ali', 'Veli'], me: 'Ali' };

test('zar atışı', () => {
  const ev = parseMessage([P('Ali'), T('rolled:'), I('dice_3'), I('dice_4')], ctx);
  assert.equal(ev.kind, 'roll');
  assert.equal(ev.total, 7);
  assert.equal(ev.player, 'Ali');
});

test('zar dağıtımı', () => {
  const ev = parseMessage([P('Veli'), T('got:'), I('card_ore'), I('card_ore'), I('card_grain')], ctx);
  assert.equal(ev.kind, 'gain');
  assert.equal(ev.player, 'Veli');
  assert.deepEqual(ev.res, { ore: 2, grain: 1 });
});

test('kart atma', () => {
  const ev = parseMessage([P('Veli'), T('discarded:'), I('card_wool'), I('card_brick')], ctx);
  assert.equal(ev.kind, 'lose');
  assert.deepEqual(ev.res, { wool: 1, brick: 1 });
});

test('banka takası', () => {
  const ev = parseMessage(
    [
      P('Veli'),
      T('gave bank:'),
      I('card_wool'),
      I('card_wool'),
      I('card_wool'),
      I('card_wool'),
      T('and took'),
      I('card_ore'),
    ],
    ctx,
  );
  assert.equal(ev.kind, 'tradeBank');
  assert.deepEqual(ev.gave, { wool: 4 });
  assert.deepEqual(ev.took, { ore: 1 });
});

test('yıl bereketi banka takasıyla karışmaz', () => {
  const ev = parseMessage([P('Veli'), T('took from bank:'), I('card_ore'), I('card_grain')], ctx);
  assert.equal(ev.kind, 'gain');
  assert.equal(ev.reason, 'yearOfPlenty');
  assert.deepEqual(ev.res, { ore: 1, grain: 1 });
});

test('oyuncular arası takas (eski biçim)', () => {
  const ev = parseMessage(
    [
      P('Ali'),
      T('wants to give:'),
      I('card_lumber'),
      T('for:'),
      I('card_ore'),
      I('card_ore'),
      T('traded with:'),
      P('Veli'),
    ],
    ctx,
  );
  assert.equal(ev.kind, 'tradePlayer');
  assert.equal(ev.from, 'Ali');
  assert.equal(ev.to, 'Veli');
  assert.deepEqual(ev.gave, { lumber: 1 });
  assert.deepEqual(ev.took, { ore: 2 });
});

test('oyuncular arası takas (yeni biçim)', () => {
  const ev = parseMessage(
    [P('Ali'), T('gave:'), I('card_brick'), T('and got:'), I('card_wool'), T('from:'), P('Veli')],
    ctx,
  );
  assert.equal(ev.kind, 'tradePlayer');
  assert.equal(ev.from, 'Ali');
  assert.equal(ev.to, 'Veli');
  assert.deepEqual(ev.gave, { brick: 1 });
  assert.deepEqual(ev.took, { wool: 1 });
});

test('gizli çalma', () => {
  const ev = parseMessage([P('Ali'), T('stole'), I('card_rescardback'), T('from:'), P('Veli')], ctx);
  assert.equal(ev.kind, 'stealUnknown');
  assert.equal(ev.thief, 'Ali');
  assert.equal(ev.victim, 'Veli');
});

test('görünen çalma', () => {
  const ev = parseMessage([P('Ali'), T('stole'), I('card_ore'), T('from:'), P('Veli')], ctx);
  assert.equal(ev.kind, 'stealKnown');
  assert.equal(ev.res, 'ore');
});

test('tekel (eski biçim, miktar bilinmiyor)', () => {
  const ev = parseMessage([P('Ali'), T('stole all of:'), I('card_grain')], ctx);
  assert.equal(ev.kind, 'monopoly');
  assert.equal(ev.res, 'grain');
  assert.equal(ev.amount, null);
});

test('tekel (kart ikonu ve miktar ile)', () => {
  const ev = parseMessage(
    [P('Ali'), T('used'), I('card_monopoly'), T('and stole 5'), I('card_ore')],
    ctx,
  );
  assert.equal(ev.kind, 'monopoly');
  assert.equal(ev.res, 'ore');
  assert.equal(ev.amount, 5);
  assert.equal(ev.usedCard, true);
});

test('gelişim kartı alma', () => {
  const ev = parseMessage([P('Veli'), T('bought'), I('card_devcardback')], ctx);
  assert.equal(ev.kind, 'buy');
  assert.equal(ev.item, 'devcard');
});

test('şövalye oynama', () => {
  const ev = parseMessage([P('Veli'), T('used'), I('card_knight')], ctx);
  assert.equal(ev.kind, 'playDev');
  assert.equal(ev.card, 'knight');
});

test('inşa ve bedava yerleştirme ayrışır', () => {
  const built = parseMessage([P('Veli'), T('built a'), I('settlement')], ctx);
  assert.equal(built.kind, 'build');
  assert.equal(built.item, 'settlement');

  const placed = parseMessage([P('Veli'), T('placed a'), I('road')], ctx);
  assert.equal(placed.kind, 'place');
  assert.equal(placed.item, 'road');
});

test('kurulum bitiş işareti', () => {
  const ev = parseMessage([T('Giving out starting resources')], ctx);
  assert.equal(ev.kind, 'setupDone');
});

test('tanınmayan satır metniyle birlikte döner', () => {
  const ev = parseMessage([P('Ali'), T('did something brand new')], ctx);
  assert.equal(ev.kind, 'unknown');
  assert.match(ev.text, /brand new/);
});

test('boşluklu oyuncu adları metinden çıkarılabilir', () => {
  const parts = [T('Kral Arthur got:'), I('card_ore')];
  assert.deepEqual(playersIn(parts, ['Kral Arthur', 'Ali']), ['Kral Arthur']);
  const ev = parseMessage(parts, { players: ['Kral Arthur', 'Ali'] });
  assert.equal(ev.kind, 'gain');
  assert.equal(ev.player, 'Kral Arthur');
});

test('flatText görselleri atlar', () => {
  assert.equal(flatText([P('Ali'), T('got:'), I('card_ore')]), 'Ali got:');
});
