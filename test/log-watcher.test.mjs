/**
 * LogWatcher: sanal kaydırıcıyı okuma ve "yeni oyun mu?" kararı.
 *
 * Gerçekte yaşanan hata: kullanıcı log'a mouse'unu götürüp bir satır yukarı
 * kaydırınca görünen sıra numaraları düştü, watcher bunu yeni oyun sandı,
 * sayımı sıfırladı ve geri dönünce aradaki 263 satırı "okunamadı" diye
 * raporladı. Bu dosya o senaryoyu birebir kurar.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { LogWatcher } from '../extension/src/dom/log-reader.js';

/** Bir log satırı: data-index + okunabilir metin. */
function row(idx, text) {
  const node = {
    nodeType: 1,
    tagName: 'DIV',
    className: 'scrollItemContainer-XX',
    style: {},
    childNodes: [{ nodeType: 3, nodeValue: text, childNodes: [] }],
    children: [],
    getAttribute: (k) => (k === 'data-index' ? String(idx) : null),
    querySelector: () => null,
    get textContent() {
      return text;
    },
    get outerHTML() {
      return `<div data-index="${idx}">${text}</div>`;
    },
  };
  return node;
}

/**
 * Sahte sanal kaydırıcı: toplam `total` satır var ama yalnız `window` tanesi
 * DOM'da duruyor. scrollTop kaydırma konumunu temsil eder.
 */
function scroller({ total, window: win = 9, scrollTop = null, rowHeight = 26 }) {
  const el = {
    scrollHeight: total * rowHeight,
    clientHeight: win * rowHeight,
    parentElement: null,
    children: [],
  };
  el.scrollTop = scrollTop === null ? el.scrollHeight - el.clientHeight : scrollTop;
  // Görünen pencere kaydırma konumundan türetilir (colonist'in yaptığı gibi).
  const first = Math.max(0, Math.round(el.scrollTop / rowHeight));
  for (let i = first; i < Math.min(total, first + win); i += 1) {
    el.children.push(row(i, `satır ${i} rolled`));
  }
  return el;
}

function makeWatcher() {
  const events = { messages: 0, gaps: [], resets: 0 };
  const w = new LogWatcher({
    onMessage: () => (events.messages += 1),
    onGap: (n) => events.gaps.push(n),
    onReset: () => (events.resets += 1),
  });
  return { w, events };
}

/** Oyunu baştan izlemiş gibi davran (ilk `upTo` satır zaten işlendi). */
function seed(w, upTo) {
  w.lastIndex = upTo;
}

/** start() çağırmadan, yoklama adımını elle taklit et. */
function poll(w, el) {
  w.logEl = el;
  const maxIdx = el.children.reduce((m, c) => Math.max(m, Number(c.getAttribute('data-index'))), -1);
  if (w._looksLikeNewGame(maxIdx)) w._reset();
  w.flush();
}

test('normal akışta satırlar sırayla işlenir, boşluk raporlanmaz', () => {
  const { w, events } = makeWatcher();
  poll(w, scroller({ total: 9 }));
  assert.equal(events.messages, 9);
  assert.deepEqual(events.gaps, []);
  assert.equal(w.lastIndex, 8);
});

test('log yukarı kaydırılınca sıfırlama YAPILMAZ ve boşluk sayılmaz', () => {
  const { w, events } = makeWatcher();

  // 353 satırlık bir oyun; baştan izlenmiş, kaydırıcı en altta.
  seed(w, 343);
  poll(w, scroller({ total: 353 }));
  assert.equal(w.lastIndex, 352);
  const seen = events.messages;

  // Kullanıcı mouse'u log'a götürüp yukarı kaydırdı: görünen numaralar düştü.
  // Bunu 10 yoklama boyunca (7 sn) sürdürsün — yine sıfırlanmamalı.
  const scrolledUp = scroller({ total: 353, scrollTop: 200 });
  for (let i = 0; i < 10; i += 1) poll(w, scrolledUp);

  assert.equal(events.resets, 0, 'yukarı kaydırma yeni oyun sanılmamalı');
  assert.deepEqual(events.gaps, [], 'zaten okunmuş satırlar boşluk sayılmamalı');
  assert.equal(events.messages, seen, 'eski satırlar tekrar işlenmemeli');
  assert.equal(w.lastIndex, 352, 'ilerleme geri gitmemeli');

  // Aşağı geri dönüldüğünde de hiçbir şey kaçmamış olmalı.
  poll(w, scroller({ total: 353 }));
  assert.deepEqual(events.gaps, []);
  assert.equal(events.resets, 0);
});

test('yukarı kaydırıp en başa gidilse bile sıfırlanmaz', () => {
  const { w, events } = makeWatcher();
  seed(w, 343);
  poll(w, scroller({ total: 353 }));

  const atTop = scroller({ total: 353, scrollTop: 0 }); // numaralar 0..8
  for (let i = 0; i < 10; i += 1) poll(w, atTop);

  assert.equal(events.resets, 0);
  assert.deepEqual(events.gaps, []);
});

test('gerçekten yeni oyun başlayınca sıfırlanır', () => {
  const { w, events } = makeWatcher();
  seed(w, 343);
  poll(w, scroller({ total: 353 }));
  assert.equal(w.lastIndex, 352);

  // Yeni oyun: log baştan başladı, kaydırıcı en altta, numaralar 0..3.
  const fresh = scroller({ total: 4 });
  poll(w, fresh);
  assert.equal(events.resets, 0, 'ilk yoklamada acele edilmemeli');

  for (let i = 0; i < 3; i += 1) poll(w, fresh);
  assert.equal(events.resets, 1, 'birkaç yoklama sürünce sıfırlanmalı');
  assert.equal(w.lastIndex, 3);
});

test('gerçek boşluk (satır kaçtıysa) raporlanmaya devam eder', () => {
  const { w, events } = makeWatcher();
  poll(w, scroller({ total: 9 }));
  assert.deepEqual(events.gaps, []);

  // Sekme arka plandayken 20 satır akıp DOM'dan çıktı: 9..28 kaçtı.
  poll(w, scroller({ total: 38 }));
  assert.deepEqual(events.gaps, [20]);
});

test('kaydırılabilir kutu yoksa da yukarı kaydırma korunur (numara eşiği)', () => {
  const { w, events } = makeWatcher();
  seed(w, 343);
  poll(w, scroller({ total: 353 }));

  // scrollHeight bilgisi yok (colonist yapıyı değiştirdi diyelim).
  const blind = scroller({ total: 353, scrollTop: 2000 });
  blind.scrollHeight = 0;
  blind.clientHeight = 0;
  for (let i = 0; i < 10; i += 1) poll(w, blind);

  // Görünen numaralar (76..84) başlangıç bölgesinde olmadığı için yine sıfırlanmaz.
  assert.equal(events.resets, 0);
});

/* ---------------------------------------------------------------- sekme değişimi
 * Arka plandaki sekmede tarayıcı setInterval'i dakikada bire kadar kısıyor.
 * Bu yüzden sekme geri geldiğinde yoklamayı beklemeden okumak gerekir.
 */

/** LogWatcher'ın dinleyici kaydettiği sahte document/window. */
function fakeGlobals() {
  const listeners = { doc: {}, win: {} };
  const doc = {
    hidden: false,
    addEventListener: (t, fn) => (listeners.doc[t] = fn),
    removeEventListener: (t) => delete listeners.doc[t],
    contains: () => true,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: null,
  };
  const win = {
    addEventListener: (t, fn) => (listeners.win[t] = fn),
    removeEventListener: (t) => delete listeners.win[t],
  };
  return { doc, win, listeners };
}

/**
 * Sahte document/window kur, watcher'ı başlat, ne olursa olsun durdur.
 * (stop() atlanırsa setInterval asılı kalır ve test koşucusu hiç bitmez —
 * bu bir kez başımıza geldi.)
 */
function withTab({ doc, win }, w, fn) {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  globalThis.document = doc;
  globalThis.window = win;
  w.start();
  try {
    return fn();
  } finally {
    w.stop();
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
}

test('sekme geri gelince yoklamayı beklemeden okur', () => {
  const g = fakeGlobals();
  const { w, events } = makeWatcher();

  withTab(g, w, () => {
    assert.ok(g.listeners.doc.visibilitychange, 'visibilitychange dinlenmeli');
    assert.ok(g.listeners.win.focus, 'focus dinlenmeli');

    // Sekme arka plandayken 6 satır aktı; yoklama kısıldığı için okunmadı.
    w.logEl = scroller({ total: 6 });
    assert.equal(events.messages, 0);

    // Sekme geri geldi.
    g.doc.hidden = false;
    g.listeners.doc.visibilitychange();
    assert.equal(events.messages, 6, 'dönüşte hemen okunmalı');
  });

  assert.equal(g.listeners.doc.visibilitychange, undefined, 'stop dinleyiciyi bırakmalı');
  assert.equal(g.listeners.win.focus, undefined);
});

test('sekme hâlâ gizliyken uyandırma tetiklenmez', () => {
  const g = fakeGlobals();
  const { w, events } = makeWatcher();

  withTab(g, w, () => {
    w.logEl = scroller({ total: 6 });
    g.doc.hidden = true; // sekme gizlendi (görünür olmadı)
    g.listeners.doc.visibilitychange();
    assert.equal(events.messages, 0);
  });
});

test('arka planda kaçan satırlar dönüşte boşluk olarak raporlanır', () => {
  const g = fakeGlobals();
  const { w, events } = makeWatcher();

  withTab(g, w, () => {
    w.logEl = scroller({ total: 9 });
    w.wake();
    assert.deepEqual(events.gaps, []);

    // Sekme arka plandayken 40 satır aktı; sanal kaydırıcı yalnız son 9'unu
    // DOM'da tuttu, aradaki 31 satır tamamen kayboldu.
    w.logEl = scroller({ total: 49 });
    w.wake();
    assert.deepEqual(events.gaps, [31], 'kaybolan satır sayısı kesin bilinmeli');
  });
});
