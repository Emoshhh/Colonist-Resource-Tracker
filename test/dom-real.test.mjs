/**
 * Canlı oyundan alınan GERÇEK log HTML'i ile DOM katmanı testleri.
 * (Node'da DOM yok; elementToParts'ın kullandığı yüzey taklit ediliyor.)
 *
 * Kaynak: colonist.io, sanal kaydırıcı satırları
 *   <div data-index="5" class="scrollItemContainer-WXX2rkzf">
 *     <div class="feedMessage-O8TLknGe">
 *       <div class="container-... avatar-..."><img alt="bot" src=".../icon_bot.<hash>.svg"></div>
 *       <span class="messagePart-XeUsOgLX">
 *         <span style="font-weight:600;word-break:break-all;color:#285FBD">Melvin</span>
 *         placed a Settlement
 *         <img src=".../settlement_blue.<hash>.svg" alt="settlement" class="lobbyChatTextIcon">
 *       </span>
 *     </div>
 *   </div>
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { elementToParts, hasContent } from '../extension/src/dom/log-reader.js';
import { parseMessage, playersIn } from '../extension/src/core/parser.js';
import { normalizeImageName, imageToResource } from '../extension/src/core/resources.js';
import { Game } from '../extension/src/core/game.js';

const CDN = 'https://cdn.colonist.io/dist/assets';

function textNode(value) {
  return { nodeType: 3, nodeValue: value, childNodes: [] };
}

function element(tag, { style = {}, className = '', attrs = {}, children = [] } = {}) {
  const node = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    style,
    className,
    childNodes: children,
    children: children.filter((c) => c.nodeType === 1),
    getAttribute: (key) => (key in attrs ? attrs[key] : null),
    querySelector: (sel) =>
      sel === 'img' ? children.find((c) => c.tagName === 'IMG') || null : null,
  };
  Object.defineProperty(node, 'textContent', {
    get() {
      const walk = (n) => (n.nodeType === 3 ? n.nodeValue : (n.childNodes || []).map(walk).join(''));
      return children.map(walk).join('');
    },
  });
  return node;
}

const img = (file, alt) =>
  element('img', { className: 'lobbyChatTextIcon', attrs: { src: `${CDN}/${file}`, alt } });

const avatar = () =>
  element('div', {
    className: 'container-k26ZLqas hideBackground-tkyRocbV avatar-yelUykqb',
    children: [
      element('img', {
        className: 'avatarImage-JNCoQelY undefined',
        attrs: { src: `${CDN}/icon_bot.551858c518b9f2f8357a.svg`, alt: 'bot' },
      }),
    ],
  });

const playerSpan = (name, color) =>
  element('span', {
    style: { color, fontWeight: '600' },
    children: [textNode(name)],
  });

/** Gerçek satır iskeleti: avatar + messagePart. */
function row(children) {
  return element('div', {
    className: 'scrollItemContainer-WXX2rkzf',
    attrs: { 'data-index': '5' },
    children: [
      element('div', {
        className: 'feedMessage-O8TLknGe',
        children: [avatar(), element('span', { className: 'messagePart-XeUsOgLX', children })],
      }),
    ],
  });
}

test('build hash içeren ikon adları normalize edilir', () => {
  assert.equal(normalizeImageName(`${CDN}/settlement_blue.bad4cdb43d65c329deda.svg`), 'settlement_blue');
  assert.equal(normalizeImageName(`${CDN}/road_blue.3301e2eed15cae5a6a05.svg`), 'road_blue');
  assert.equal(imageToResource(`${CDN}/card_lumber.aa11bb22cc33dd44.svg`), 'lumber');
  assert.equal(imageToResource(`${CDN}/settlement_blue.bad4cdb43d65c329deda.svg`), null);
  assert.equal(imageToResource(`${CDN}/icon_bot.551858c518b9f2f8357a.svg`), null);
});

test('gerçek satır: "Melvin placed a Settlement"', () => {
  const el = row([
    playerSpan('Melvin', '#285FBD'),
    textNode(' placed a Settlement '),
    img('settlement_blue.bad4cdb43d65c329deda.svg', 'settlement'),
  ]);

  const parts = elementToParts(el);
  assert.deepEqual(
    parts.map((p) => p.t),
    ['avatar', 'player', 'text', 'img'],
    'avatar kaynak değil, ayrı tür olarak işaretlenir',
  );
  assert.equal(parts[1].v, 'Melvin');

  const ev = parseMessage(parts, {});
  assert.equal(ev.kind, 'place');
  assert.equal(ev.item, 'settlement');
  assert.equal(ev.player, 'Melvin');
});

test('gerçek satır: "Melvin placed a Road"', () => {
  const el = row([
    playerSpan('Melvin', '#285FBD'),
    textNode(' placed a Road '),
    img('road_blue.3301e2eed15cae5a6a05.svg', 'road'),
  ]);
  const ev = parseMessage(elementToParts(el), {});
  assert.equal(ev.kind, 'place');
  assert.equal(ev.item, 'road');
});

test('gerçek satır: kaynak dağıtımı ve takas', () => {
  const gotEl = row([
    playerSpan('Melvin', '#285FBD'),
    textNode(' got '),
    img('card_lumber.aa11bb22cc33dd44.svg', 'lumber'),
    img('card_brick.bb22cc33dd44ee55.svg', 'brick'),
  ]);
  const got = parseMessage(elementToParts(gotEl), {});
  assert.equal(got.kind, 'gain');
  assert.deepEqual(got.res, { lumber: 1, brick: 1 });

  const tradeEl = row([
    playerSpan('Melvin', '#285FBD'),
    textNode(' gave '),
    img('card_lumber.aa11bb22cc33dd44.svg', 'lumber'),
    textNode(' and got '),
    img('card_ore.cc33dd44ee55ff66.svg', 'ore'),
    textNode(' from '),
    playerSpan('Lili', '#E27174'),
  ]);
  const trade = parseMessage(elementToParts(tradeEl), { players: ['Melvin', 'Lili'] });
  assert.equal(trade.kind, 'tradePlayer');
  assert.equal(trade.from, 'Melvin');
  assert.equal(trade.to, 'Lili');
  assert.deepEqual(trade.gave, { lumber: 1 });
  assert.deepEqual(trade.took, { ore: 1 });
});

test('ayırıcı satır (<hr>) olay üretmez', () => {
  const el = row([element('hr')]);
  const parts = elementToParts(el);
  assert.deepEqual(parts.map((p) => p.t), ['avatar'], 'sadece avatar kalır');
  assert.equal(hasContent(parts), false);
});

test('sanal kaydırıcıdan gelen satır dizisi uçtan uca işlenir', () => {
  const g = new Game();
  const feed = (children) => {
    const parts = elementToParts(row(children));
    if (!parts.length) return;
    for (const name of playersIn(parts, g.players)) g.addPlayer(name);
    g.applyEvent(parseMessage(parts, { players: g.players }));
  };

  const M = () => playerSpan('Melvin', '#285FBD');
  const L = () => playerSpan('Lili', '#E27174');

  feed([M(), textNode(' placed a Settlement '), img('settlement_blue.bad4cdb43d65c329deda.svg', 'settlement')]);
  feed([
    M(),
    textNode(' received starting resources '),
    img('card_lumber.aa11bb22cc33dd44.svg', 'lumber'),
    img('card_brick.bb22cc33dd44ee55.svg', 'brick'),
    img('card_grain.dd44ee55ff66aa77.svg', 'grain'),
  ]);
  feed([M(), textNode(' placed a Road '), img('road_blue.3301e2eed15cae5a6a05.svg', 'road')]);
  feed([element('hr')]);
  feed([M(), textNode(' rolled '), img('dice_3.ee55ff66aa77bb88.svg', '3'), img('dice_5.ff66aa77bb88cc99.svg', '5')]);
  feed([L(), textNode(' got '), img('card_ore.cc33dd44ee55ff66.svg', 'ore')]);
  feed([M(), textNode(' built a Road '), img('road_blue.3301e2eed15cae5a6a05.svg', 'road')]);

  const rep = g.report();
  const cell = (p, r) => rep.players.find((x) => x.name === p).res.find((x) => x.res === r);

  assert.deepEqual(g.players, ['Melvin', 'Lili']);
  assert.equal(rep.unknownCount, 0, 'tüm satırlar tanınmalı');
  assert.equal(rep.desyncs, 0, 'çelişki olmamalı');
  assert.equal(rep.rolls[8], 1);
  // kurulum yolu bedava, oyun içi yol odun+tuğla götürdü
  assert.equal(cell('Melvin', 'lumber').max, 0);
  assert.equal(cell('Melvin', 'brick').max, 0);
  assert.equal(cell('Melvin', 'grain').min, 1);
  assert.equal(cell('Lili', 'ore').min, 1);
});
