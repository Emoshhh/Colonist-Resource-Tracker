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
    [textNode('Happy settling! Learn how to play in the rulebook . List of commands: /help')],
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

test('haydut satırındaki arazi ikonu kaynak sayılmaz', () => {
  // "Arlen moved Robber 🦹 to <prob_8> <generated_tile_grain>"
  const parts = elementToParts(
    row([
      player('Arlen', '#CF6B2E'),
      textNode(' moved Robber '),
      element('img', {
        className: 'lobbyChatTextIcon',
        attrs: { src: `${CDN}/icon_robber.2b909f277d60f24633e8.svg`, alt: 'robber' },
      }),
      textNode(' to '),
      element('img', {
        className: 'lobbyChatTextIcon',
        attrs: { src: `${CDN}/prob_8.ca0de6260ba265cc479f.svg`, alt: 'prob_8' },
      }),
      element('img', {
        className: 'lobbyChatTextIcon',
        attrs: { src: `${CDN}/generated_tile_grain.50fd57746befab85ea35.svg`, alt: 'grain tile' },
      }),
    ]),
  );

  const ev = parseMessage(parts, { players: ['Arlen', 'Emosh'] });
  assert.equal(ev.kind, 'ignore', 'haydut hareketi kaynak transferi değil');

  const g = new Game();
  g.setupPhase = false;
  g.addPlayer('Arlen');
  g.applyEvent(ev);
  const grain = g.report().players[0].res.find((r) => r.res === 'grain');
  assert.equal(grain.max, 0, 'arazi altıgeni buğday kartı sayılmamalı');
});

test('oyuncusuz bilgi satırı: "<prob> <tile> is blocked by the Robber"', () => {
  // Bu satırda ne avatar ne de oyuncu adı var, sadece iki ikon + metin.
  const parts = elementToParts(
    element('div', {
      className: 'scrollItemContainer-WXX2rkzf',
      attrs: { 'data-index': '429' },
      children: [
        element('div', {
          className: 'feedMessage-O8TLknGe',
          children: [
            element('span', {
              className: 'messagePart-XeUsOgLX',
              children: [
                element('img', {
                  attrs: { src: `${CDN}/prob_6.ada0b8434cfe315beb72.svg`, alt: 'prob_6' },
                }),
                element('img', {
                  attrs: {
                    src: `${CDN}/generated_tile_grain.50fd57746befab85ea35.svg`,
                    alt: 'grain tile',
                  },
                }),
                textNode(' is blocked by the Robber. No resources produced'),
              ],
            }),
          ],
        }),
      ],
    }),
  );

  const ev = parseMessage(parts, { players: ['Emosh'] });
  assert.equal(ev.kind, 'ignore');
  assert.equal(ev.player, null, 'satırın sahibi yok');
});

test('zafer satırı yok sayılır', () => {
  const ev = parseMessage(
    elementToParts(
      row(
        [
          element('img', { attrs: { src: `${CDN}/icon_trophy.bc5c68a7464f0462721d.svg`, alt: 'trophy' } }),
          player('Carie49985693', '#CF4449'),
          textNode(' won the game! '),
          element('img', { attrs: { src: `${CDN}/icon_trophy.bc5c68a7464f0462721d.svg`, alt: 'trophy' } }),
        ],
        { bot: false },
      ),
    ),
    { players: ['Carie49985693'] },
  );
  assert.equal(ev.kind, 'ignore');
});

test('tek satırda birleşmiş iki 3:1 banka takası', () => {
  const ev = parseMessage(
    elementToParts(
      row(
        [
          player('Carie49985693', '#CF4449'),
          textNode(' gave bank '),
          card('grain', 'Grain'),
          card('grain', 'Grain'),
          card('grain', 'Grain'),
          card('ore', 'Ore'),
          card('ore', 'Ore'),
          card('ore', 'Ore'),
          textNode(' and took '),
          card('brick', 'Brick'),
          card('lumber', 'Lumber'),
        ],
        { bot: false },
      ),
    ),
    { players: ['Carie49985693'] },
  );
  assert.equal(ev.kind, 'tradeBank');
  assert.deepEqual(ev.gave, { grain: 3, ore: 3 });
  assert.deepEqual(ev.took, { brick: 1, lumber: 1 });
});

test('"Arlen stole 🌾 from you" — benden çalınan kart görünür, kesin işlenir', () => {
  const ev = parseMessage(
    elementToParts(row([player('Arlen', '#CF6B2E'), textNode(' stole '), card('grain', 'Grain'), textNode(' from you')])),
    { players: ['Arlen', 'Emosh'], me: 'Emosh' },
  );
  assert.equal(ev.kind, 'stealKnown', 'kart görüldüğü için dallanmaya gerek yok');
  assert.equal(ev.res, 'grain');
  assert.equal(ev.thief, 'Arlen');
  assert.equal(ev.victim, 'Emosh');
});

test('gerçek DOM: "Carie49985693 stole <Ore> from you" (rakamlı isim)', () => {
  // Elements panelinden birebir alınan yapı (data-index 99).
  const parts = elementToParts(
    row([
      player('Carie49985693', '#CF4449'),
      textNode(' stole '),
      card('ore', 'Ore'),
      textNode(' from you'),
    ]),
  );

  const ev = parseMessage(parts, { players: ['Carie49985693', 'Emosh'], me: 'Emosh' });
  assert.equal(ev.kind, 'stealKnown', 'benden çalınan kart görünür');
  assert.equal(ev.thief, 'Carie49985693');
  assert.equal(ev.victim, 'Emosh');
  assert.equal(ev.res, 'ore');
});

test('gerçek DOM: "Carie49985693 moved Robber 🦹 to <prob_6> <grain tile>"', () => {
  // Elements panelinden birebir (data-index 98): oyuncu adı + haydut ikonu +
  // sayı fişi + arazi altıgeni. Arazi ikonunun adında "grain" geçiyor.
  const parts = elementToParts(
    row([
      player('Carie49985693', '#CF4449'),
      textNode(' moved Robber '),
      element('img', { attrs: { src: `${CDN}/icon_robber.2b909f2aabbccdd.svg`, alt: 'robber' } }),
      textNode(' to '),
      element('img', { attrs: { src: `${CDN}/prob_6.ada0b84aabbccdd.svg`, alt: 'prob_6' } }),
      element('img', {
        attrs: { src: `${CDN}/generated_tile_grain.50fd577aabbccdd.svg`, alt: 'grain tile' },
      }),
    ]),
  );

  const g = new Game();
  g.setupPhase = false;
  g.addPlayer('Carie49985693');
  const ev = parseMessage(parts, { players: ['Carie49985693'] });
  assert.equal(ev.kind, 'ignore');

  g.applyEvent(ev);
  const rep = g.report();
  assert.equal(rep.players[0].totalMax, 0, 'haydut hareketi kart eklememeli');
  assert.equal(rep.unknownCount, 0);
});

test('gerçek DOM: "Emosh used Knight" — ikon adı beklenmedik olsa da metinden anlaşılır', () => {
  const parts = elementToParts(
    row(
      [
        player('Emosh', '#3D3D3D'),
        textNode(' used Knight '),
        element('img', { attrs: { src: `${CDN}/icon_unexpected_name.abcdef123456.svg`, alt: 'knight' } }),
      ],
      { bot: false },
    ),
  );
  const ev = parseMessage(parts, { players: ['Emosh'] });
  assert.equal(ev.kind, 'playDev');
  assert.equal(ev.card, 'knight');
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
