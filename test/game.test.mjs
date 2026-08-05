import test from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../extension/src/core/game.js';
import { parseMessage, playersIn } from '../extension/src/core/parser.js';

const P = (v) => ({ t: 'player', v });
const T = (v) => ({ t: 'text', v });
const I = (v) => ({ t: 'img', v: `https://colonist.io/dist/images/${v}.svg` });

/** main.js'teki akışın aynısı: oyuncuları kaydet -> ayrıştır -> uygula. */
function feed(game, parts) {
  for (const name of playersIn(parts, game.players)) game.addPlayer(name);
  game.applyEvent(parseMessage(parts, { players: game.players }));
}

function cell(report, player, res) {
  return report.players.find((p) => p.name === player).res.find((r) => r.res === res);
}

test('uçtan uca: kurulum, inşa, takas, çalma ve çözülme', () => {
  const g = new Game();

  // Kurulum: yerleşimler bedava
  feed(g, [P('Ali'), T('placed a'), I('settlement')]);
  feed(g, [P('Veli'), T('placed a'), I('settlement')]);
  feed(g, [T('Giving out starting resources')]);
  feed(g, [P('Ali'), T('got:'), I('card_lumber'), I('card_brick')]);
  feed(g, [P('Veli'), T('got:'), I('card_ore'), I('card_wool')]);

  let rep = g.report();
  assert.deepEqual(g.players, ['Ali', 'Veli']);
  assert.equal(cell(rep, 'Ali', 'lumber').min, 1);
  assert.equal(rep.desyncs, 0);

  // Zar
  feed(g, [P('Ali'), T('rolled:'), I('dice_3'), I('dice_4')]);
  assert.equal(g.report().rolls[7], 1);

  // İnşa maliyeti düşülür
  feed(g, [P('Ali'), T('built a'), I('road')]);
  rep = g.report();
  assert.equal(cell(rep, 'Ali', 'lumber').max, 0);
  assert.equal(cell(rep, 'Ali', 'brick').max, 0);
  assert.equal(rep.desyncs, 0);

  // Ali'nin eli boş: çalma Veli'den olmalı ve iki dalda belirsiz kalır
  feed(g, [P('Ali'), T('stole'), I('card_rescardback'), T('from:'), P('Veli')]);
  rep = g.report();
  assert.equal(rep.worlds, 2);
  assert.equal(cell(rep, 'Ali', 'ore').min, 0);
  assert.equal(cell(rep, 'Ali', 'ore').max, 1);

  // Veli madenini bankaya veremez (tek kart) ama koyununu attıysa
  // Ali'nin çaldığı kart maden olmak zorundadır.
  feed(g, [P('Veli'), T('discarded:'), I('card_wool')]);
  rep = g.report();
  assert.equal(rep.worlds, 1);
  assert.equal(cell(rep, 'Ali', 'ore').min, 1);
  assert.equal(cell(rep, 'Veli', 'ore').max, 0);
  assert.equal(rep.desyncs, 0);
});

test('yol yapımı kartı iki yolu bedava yapar', () => {
  const g = new Game();
  feed(g, [T('Giving out starting resources')]);
  feed(g, [P('Ali'), T('got:'), I('card_lumber'), I('card_brick')]);
  feed(g, [P('Ali'), T('used'), I('card_roadbuilding')]);
  feed(g, [P('Ali'), T('built a'), I('road')]);
  feed(g, [P('Ali'), T('built a'), I('road')]);

  const rep = g.report();
  assert.equal(rep.desyncs, 0, 'bedava yollar kaynak düşürmemeli');
  assert.equal(cell(rep, 'Ali', 'lumber').min, 1);
  assert.equal(cell(rep, 'Ali', 'brick').min, 1);

  // Üçüncü yol artık maliyetli
  feed(g, [P('Ali'), T('built a'), I('road')]);
  const rep2 = g.report();
  assert.equal(cell(rep2, 'Ali', 'lumber').max, 0);
});

test('gelişim kartı sayacı alım ve oynamayı izler', () => {
  const g = new Game();
  feed(g, [T('Giving out starting resources')]);
  feed(g, [P('Veli'), T('got:'), I('card_ore'), I('card_wool'), I('card_grain')]);
  feed(g, [P('Veli'), T('bought'), I('card_devcardback')]);

  let rep = g.report();
  assert.equal(rep.players.find((p) => p.name === 'Veli').devCards, 1);
  assert.equal(cell(rep, 'Veli', 'ore').max, 0);

  feed(g, [P('Veli'), T('used'), I('card_knight')]);
  rep = g.report();
  assert.equal(rep.players.find((p) => p.name === 'Veli').devCards, 0);
});

test('tanınmayan satırlar durumu bozmadan biriktirilir', () => {
  const g = new Game();
  feed(g, [T('Giving out starting resources')]);
  feed(g, [P('Ali'), T('got:'), I('card_ore')]);
  feed(g, [P('Ali'), T('completely unexpected new log line')]);
  const rep = g.report();
  assert.equal(rep.unknownCount, 1);
  assert.equal(cell(rep, 'Ali', 'ore').min, 1);
  assert.equal(rep.desyncs, 0);
});
