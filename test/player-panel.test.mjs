/**
 * Oyunun kendi oyuncu panelinden okuma testleri.
 * Fixture: canlı oyundan kopyalanmış gerçek outerHTML
 * (test/fixtures/player-panel.html — Carie49985693 5 kart/2 GK, Emosh 3 kart/1 GK).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseHtml, asDocument } from './helpers/html.mjs';
import {
  readPlayerRows,
  readPlayerPanel,
  findPlayerPanel,
} from '../extension/src/dom/player-panel.js';

const FIXTURE = readFileSync(
  fileURLToPath(new URL('./fixtures/player-panel.html', import.meta.url)),
  'utf8',
);

const panel = () => parseHtml(FIXTURE);

test('gerçek panelden iki oyuncu satırı okunur', () => {
  const rows = readPlayerRows(panel());
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.name),
    ['Carie49985693', 'Emosh'],
  );
});

test('rakibin kart ve gelişim kartı sayısı doğru okunur', () => {
  const [rival] = readPlayerRows(panel());
  assert.equal(rival.name, 'Carie49985693');
  assert.equal(rival.cards, 5);
  assert.equal(rival.devCards, 2);
  assert.equal(rival.isMe, false);
});

test('currentUser satırı "ben" olarak işaretlenir (usernameLarge ile)', () => {
  const rows = readPlayerRows(panel());
  const me = rows.find((r) => r.isMe);
  assert.ok(me, 'currentUser satırı bulunamadı');
  assert.equal(me.name, 'Emosh');
  assert.equal(me.cards, 3);
  assert.equal(me.devCards, 1);
});

test('zafer puanı ve başarım sayıları kart sayısı sanılmaz', () => {
  // Rakip satırında 3 zafer puanı, 0 ordu, 2 yol rozeti de var:
  // bunlar data-resource-card / data-development-card dışında kaldığı için karışmamalı.
  const [rival] = readPlayerRows(panel());
  assert.notEqual(rival.cards, 3);
  assert.notEqual(rival.devCards, 0);
});

test('panel document içinden bulunur', () => {
  const doc = asDocument(panel());
  const found = findPlayerPanel(doc);
  assert.ok(found, 'gamePlayerInformationContainer bulunamadı');
  assert.equal(found.getAttribute('data-player-information-container'), 'true');

  const rows = readPlayerPanel(doc);
  assert.deepEqual(
    rows.map((r) => [r.name, r.cards, r.devCards, r.isMe]),
    [
      ['Carie49985693', 5, 2, false],
      ['Emosh', 3, 1, true],
    ],
  );
});

test('panel yoksa boş liste döner (çökmez)', () => {
  const empty = parseHtml('<div class="baska"></div>');
  assert.deepEqual(readPlayerRows(null), []);
  assert.deepEqual(readPlayerPanel(asDocument(empty)), []);
});

test('sayı rozeti yoksa null döner, satır yine de okunur', () => {
  const row = parseHtml(
    '<div class="playerRow-XX"><div class="username-YY">Zed</div></div>',
  );
  const wrapper = parseHtml(`<div class="gamePlayerInformationContainer-ZZ">${row.outerHTML}</div>`);
  const rows = readPlayerRows(wrapper);
  assert.deepEqual(rows, [{ name: 'Zed', cards: null, devCards: null, isMe: false }]);
});

/* ------------------------------------------------- colonist işaretlemeyi değiştirdi
 * Eskiden her satırda "playerRow-<hash>" sınıfı vardı. Yeni sürümde rakip
 * satırında "opponentPlayerRow-..." duruyor ama KENDİ satırımızda yalnız
 * "container-<hash>" kaldı. Sınıfa bakan seçici kendi satırımızı bulamıyordu:
 * "ben kimim" elle seçilmek zorunda kalıyor ve kendi sayımımız hiç
 * doğrulanmıyordu. Artık iki satırda da duran data-player-color kullanılıyor.
 */
const PANEL_V2 = readFileSync(
  fileURLToPath(new URL('./fixtures/player-panel-v2.html', import.meta.url)),
  'utf8',
);
const panelV2 = () => parseHtml(PANEL_V2);

test('yeni işaretlemede kendi satırımız da okunur', () => {
  const rows = readPlayerRows(panelV2());
  assert.deepEqual(
    rows.map((r) => [r.name, r.cards, r.devCards, r.isMe]),
    [
      ['Skuashy', 6, 0, false],
      ['Emosh', 6, 4, true],
    ],
  );
});

test('kendi satırımızda playerRow sınıfı olmasa da bulunur', () => {
  // Fixture'daki gerçek durum: kendi satırın sınıfı yalnız "container-<hash>".
  assert.match(PANEL_V2, /class="container-[A-Za-z0-9]+" data-player-color="5"/);
  assert.ok(
    readPlayerRows(panelV2()).some((r) => r.isMe),
    'currentUser satırı bulunmalı',
  );
});

test('eski işaretleme de çalışmaya devam eder', () => {
  const rows = readPlayerRows(panel());
  assert.equal(rows.length, 2);
  assert.ok(rows.some((r) => r.isMe));
});
