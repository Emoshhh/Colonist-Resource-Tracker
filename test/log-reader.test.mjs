import test from 'node:test';
import assert from 'node:assert/strict';

import { elementToParts } from '../extension/src/dom/log-reader.js';

/* Gerçek DOM olmadan, elementToParts'ın kullandığı yüzeyi taklit eden düğümler. */

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
    getAttribute: (key) => (key in attrs ? attrs[key] : null),
    querySelector: (sel) =>
      sel === 'img' && children.some((c) => c.tagName === 'IMG') ? children.find((c) => c.tagName === 'IMG') : null,
  };
  Object.defineProperty(node, 'textContent', {
    get() {
      const walk = (n) =>
        n.nodeType === 3 ? n.nodeValue : (n.childNodes || []).map(walk).join('');
      return children.map(walk).join('');
    },
  });
  return node;
}

const img = (name) =>
  element('img', { attrs: { src: `https://colonist.io/dist/images/${name}.svg` } });

test('renkli span oyuncu, img kaynak olarak ayrışır', () => {
  const message = element('div', {
    children: [
      element('span', { style: { color: 'rgb(226, 113, 116)' }, children: [textNode('Ali Veli')] }),
      textNode(' got: '),
      img('card_ore'),
      img('card_grain'),
    ],
  });

  const parts = elementToParts(message);
  assert.deepEqual(
    parts.map((p) => p.t),
    ['player', 'text', 'img', 'img'],
  );
  assert.equal(parts[0].v, 'Ali Veli');
  assert.equal(parts[1].v, 'got:');
  assert.match(parts[2].v, /card_ore/);
});

test('arka plan görseliyle çizilen ikonlar da yakalanır', () => {
  const message = element('div', {
    children: [
      textNode('Ali stole '),
      element('div', {
        style: { backgroundImage: 'url("https://colonist.io/dist/images/card_rescardback.svg")' },
      }),
      textNode(' from: '),
      element('span', { style: { color: '#4a90d9' }, children: [textNode('Veli')] }),
    ],
  });

  const parts = elementToParts(message);
  assert.deepEqual(
    parts.map((p) => p.t),
    ['text', 'img', 'text', 'player'],
  );
  assert.match(parts[1].v, /card_rescardback/);
});

test('iç içe düğümlerdeki metinler birleştirilir', () => {
  const message = element('div', {
    children: [
      element('div', { children: [element('span', { children: [textNode('Giving out')] })] }),
      textNode(' starting resources'),
    ],
  });
  const parts = elementToParts(message);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].v, 'Giving out starting resources');
});
