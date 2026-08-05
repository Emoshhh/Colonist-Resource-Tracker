/**
 * Canlı bir botlu oyundan alınan gerçek satırlarla testler.
 * Bu satırlar eklentinin ilk sürümünde ya tanınmamış ya da çelişki üretmişti.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { elementToParts } from '../extension/src/dom/log-reader.js';
import { parseMessage, playersIn, avatarOf } from '../extension/src/core/parser.js';
import { Game } from '../extension/src/core/game.js';

const CDN = 'https://cdn.colonist.io/dist/assets';

const HASH = {
  ore: 'card_ore.117f64dab28e1c987958.svg',
  lumber: 'card_lumber.cf22f8083cf89c2a29e7.svg',
  brick: 'card_brick.5950ea07a7ea01bc54a5.svg',
  wool: 'card_wool.17a6dea8d559949f0ccc.svg',
  grain: 'card_grain.09c9d82146a64bce69b5.svg',
  settlement: 'settlement_black.c687de87c2493d1624ea.svg',
  road: 'road_black.6f85c9480c8f0d89d58a.svg',
  dice5: 'dice_5.e2e4c9085fa4a5ed783a.svg',
  dice3: 'dice_3.bdf9bed70b715ad2ab2c.svg',
  bot: 'icon_bot.551858c518b9f2f8357a.svg',
  human: 'icon_player_loggedin.0269225ae4f7db8480ca.svg',
};

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
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    querySelector: (sel) => (sel === 'img' ? children.find((c) => c.tagName === 'IMG') || null : null),
  };
  Object.defineProperty(node, 'textContent', {
    get() {
      const walk = (n) => (n.nodeType === 3 ? n.nodeValue : (n.childNodes || []).map(walk).join(''));
      return children.map(walk).join('');
    },
  });
  return node;
}

const card = (key, alt) =>
  element('img', { className: 'lobbyChatTextIcon', attrs: { src: `${CDN}/${HASH[key]}`, alt } });

const avatarBot = () =>
  element('div', {
    className: 'container-k26ZLqas hideBackground-tkyRocbV avatar-yelUykqb',
    children: [
      element('img', { className: 'avatarImage-JNCoQelY undefined', attrs: { src: `${CDN}/${HASH.bot}`, alt: 'bot' } }),
    ],
  });

const avatarHuman = () =>
  element('div', {
    className: 'container-k26ZLqas hideBackground-tkyRocbV avatar-yelUykqb',
    children: [
      element('img', {
        className: 'avatarImage-JNCoQelY',
        attrs: { src: `${CDN}/${HASH.human}`, alt: 'Player avatar' },
      }),
    ],
  });

const player = (name, color) => element('span', { style: { color }, children: [textNode(name)] });

const EMOSH = () => player('Emosh', '#3D3D3D');
const CUDA = () => player('Cuda', '#CF4449');
const KAVITA = () => player('Kavita', '#285FBD');

/** Gerçek satır iskeleti. */
function row(children, { bot = true } = {}) {
  return element('div', {
    className: 'scrollItemContainer-WXX2rkzf',
    attrs: { 'data-index': '461' },
    children: [
      element('div', {
        className: 'feedMessage-O8TLknGe',
        children: [
          bot ? avatarBot() : avatarHuman(),
          element('span', { className: 'messagePart-XeUsOgLX', children }),
        ],
      }),
    ],
  });
}

test('avatar botu insandan ayırır ve kaynak sayılmaz', () => {
  const parts = elementToParts(row([CUDA(), textNode(' got '), card('lumber', 'Lumber')]));
  assert.equal(avatarOf(parts), 'bot');
  assert.deepEqual(
    parts.map((p) => p.t),
    ['avatar', 'player', 'text', 'img'],
  );

  const human = elementToParts(row([EMOSH(), textNode(' got '), card('ore', 'Ore')], { bot: false }));
  assert.equal(avatarOf(human), 'human');
});

test('"Cuda gave bank 🌲🌲🌲 and took ⛏"', () => {
  const ev = parseMessage(
    elementToParts(
      row([
        CUDA(),
        textNode(' gave bank '),
        card('lumber', 'Lumber'),
        card('lumber', 'Lumber'),
        card('lumber', 'Lumber'),
        textNode(' and took '),
        card('ore', 'Ore'),
      ]),
    ),
    { players: ['Cuda'] },
  );
  assert.equal(ev.kind, 'tradeBank');
  assert.deepEqual(ev.gave, { lumber: 3 });
  assert.deepEqual(ev.took, { ore: 1 });
});

test('"Emosh built a Settlement (+1 VP)"', () => {
  const ev = parseMessage(
    elementToParts(
      row(
        [
          EMOSH(),
          textNode(' built a Settlement '),
          card('settlement', 'settlement'),
          textNode(' ('),
          element('span', { className: 'vp-text', children: [textNode('+1 VP')] }),
          textNode(')'),
        ],
        { bot: false },
      ),
    ),
    { players: ['Emosh'] },
  );
  assert.equal(ev.kind, 'build');
  assert.equal(ev.item, 'settlement');
});

test('robot/bilgi satırları yok sayılır, tanınmayan sayılmaz', () => {
  const lines = [
    [textNode(' is blocked by the Robber. No resources produced')],
    [EMOSH(), textNode(' received Longest Road ( +2 VPs )')],
    [textNode('Bot is selecting cards to discard for Cuda')],
  ];
  for (const children of lines) {
    const ev = parseMessage(elementToParts(row(children)), { players: ['Emosh', 'Cuda'] });
    assert.equal(ev.kind, 'ignore', `yok sayılmalı: ${JSON.stringify(children.length)}`);
  }
});

test('"Giule stole from you" / "You stole from Cuda" — kendi adımız bilinince çözülür', () => {
  const stolenFromMe = elementToParts(row([player('Giule', '#CF6B2E'), textNode(' stole from you')]));
  const known = { players: ['Giule', 'Cuda', 'Emosh'] };

  const unresolved = parseMessage(stolenFromMe, known);
  assert.equal(unresolved.kind, 'stealUnresolved', 'kendi adımız yokken işlenemez');

  const resolved = parseMessage(stolenFromMe, { ...known, me: 'Emosh' });
  assert.equal(resolved.kind, 'stealUnknown');
  assert.equal(resolved.thief, 'Giule');
  assert.equal(resolved.victim, 'Emosh');

  const iStole = parseMessage(
    elementToParts(row([textNode('You stole from '), CUDA()], { bot: false })),
    { ...known, me: 'Emosh' },
  );
  assert.equal(iStole.kind, 'stealUnknown');
  assert.equal(iStole.thief, 'Emosh');
  assert.equal(iStole.victim, 'Cuda');
});

test('çaldığım kart görünüyorsa kesin çalma olarak işlenir', () => {
  const ev = parseMessage(
    elementToParts(row([textNode('You stole '), card('ore', 'Ore'), textNode(' from '), CUDA()], { bot: false })),
    { players: ['Cuda', 'Emosh'], me: 'Emosh' },
  );
  assert.equal(ev.kind, 'stealKnown');
  assert.equal(ev.res, 'ore');
  assert.equal(ev.thief, 'Emosh');
});

test('gerçek tur uçtan uca: dağıtım, banka takası, inşa, oyuncu takası', () => {
  const g = new Game();
  const feed = (children, opts) => {
    const parts = elementToParts(row(children, opts));
    if (!parts.length) return;
    for (const name of playersIn(parts, g.players)) {
      if (!/^you$/i.test(name)) g.addPlayer(name);
    }
    g.applyEvent(parseMessage(parts, { players: g.players, me: 'Emosh' }));
  };

  g.setupPhase = false;

  feed([EMOSH(), textNode(' rolled '), card('dice5', 'dice_5'), card('dice3', 'dice_3')], { bot: false });
  feed([EMOSH(), textNode(' got '), card('ore', 'Ore'), card('ore', 'Ore'), card('lumber', 'Lumber'), card('lumber', 'Lumber')], { bot: false });
  feed([CUDA(), textNode(' got '), card('lumber', 'Lumber'), card('lumber', 'Lumber')]);
  feed([CUDA(), textNode(' gave bank '), card('lumber', 'Lumber'), card('lumber', 'Lumber'), textNode(' and took '), card('ore', 'Ore')]);
  feed([KAVITA(), textNode(' got '), card('wool', 'Wool'), card('brick', 'Brick'), card('brick', 'Brick'), card('grain', 'Grain')]);
  feed([EMOSH(), textNode(' got '), card('grain', 'Grain'), card('grain', 'Grain'), card('brick', 'Brick')], { bot: false });
  feed(
    [
      EMOSH(),
      textNode(' gave '),
      card('lumber', 'Lumber'),
      card('ore', 'Ore'),
      card('ore', 'Ore'),
      card('grain', 'Grain'),
      card('grain', 'Grain'),
      textNode(' and got '),
      card('wool', 'Wool'),
      textNode(' from '),
      KAVITA(),
    ],
    { bot: false },
  );
  feed([EMOSH(), textNode(' built a Road '), card('road', 'road')], { bot: false });

  const rep = g.report();
  const cell = (p, r) => rep.players.find((x) => x.name === p).res.find((x) => x.res === r);

  assert.equal(rep.unknownCount, 0, 'tüm satırlar tanınmalı');
  assert.equal(rep.desyncs, 0, 'hiçbir hamle çelişki üretmemeli');
  assert.equal(rep.rolls[8], 1);

  // Emosh: 2 maden + 2 odun + 2 buğday + 1 tuğla
  //        -> takasta 1 odun, 2 maden, 2 buğday verip 1 koyun aldı
  //        -> elinde 1 odun, 1 tuğla, 1 koyun; yol yapınca odun ve tuğla gitti
  assert.equal(cell('Emosh', 'wool').min, 1);
  assert.equal(cell('Emosh', 'lumber').max, 0, 'yol maliyeti düşüldü');
  assert.equal(cell('Emosh', 'brick').max, 0);
  assert.equal(cell('Emosh', 'ore').max, 0, 'iki madenini takasta verdi');
  assert.equal(cell('Cuda', 'ore').min, 1);
  assert.equal(cell('Kavita', 'wool').max, 0, 'tek koyununu takasta verdi');
  assert.equal(cell('Kavita', 'brick').min, 2);
});
