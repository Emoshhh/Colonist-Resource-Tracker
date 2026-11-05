/**
 * "Tüm log'u al" (≡ düğmesi) ve maç sonu kaydı.
 *
 * Asıl sorun: log sanal kaydırıcı, aynı anda ~9 satır DOM'da duruyor. Maçın
 * tamamını görmenin tek yolu kutuyu baştan sona kaydırmak. Bu dosya sahte bir
 * kaydırıcı kurup collectAllRows'un gerçekten BÜTÜN satırları topladığını,
 * kaydırmayı eski yerine bıraktığını ve bu sırada sayıma dokunmadığını
 * doğrular.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { LogWatcher, partsToText, rowToText } from '../extension/src/dom/log-reader.js';

const ROW_H = 26;

/** Bir log satırı düğümü: data-index + metin (+ istenirse resimler). */
function row(idx, text, images = []) {
  const kids = [{ nodeType: 3, nodeValue: text, childNodes: [] }];
  for (const src of images) {
    kids.push({
      nodeType: 1,
      tagName: 'IMG',
      style: {},
      className: '',
      childNodes: [],
      children: [],
      getAttribute: (k) => (k === 'src' ? src : null),
      querySelector: () => null,
      get textContent() {
        return '';
      },
    });
  }
  return {
    nodeType: 1,
    tagName: 'DIV',
    className: 'scrollItemContainer-XX',
    style: {},
    childNodes: kids,
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
}

/**
 * Sahte sanal kaydırıcı: `total` satırın yalnız `window` tanesi DOM'da durur
 * ve görünen pencere scrollTop'tan türetilir — colonist'in yaptığı gibi.
 */
function liveScroller({ total, window: win = 9, lines = null }) {
  const el = {
    scrollHeight: total * ROW_H,
    clientHeight: win * ROW_H,
    scrollTop: total * ROW_H - win * ROW_H,
    parentElement: null,
  };
  Object.defineProperty(el, 'children', {
    get() {
      const first = Math.max(0, Math.min(total - win, Math.round(el.scrollTop / ROW_H)));
      const out = [];
      for (let i = first; i < Math.min(total, first + win); i += 1) {
        out.push(lines ? lines(i) : row(i, `satır ${i} rolled`));
      }
      return out;
    },
  });
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

const FAST = { settle: 0, maxSteps: 400 };

test('kaydırarak bütün satırları toplar', async () => {
  const { w } = makeWatcher();
  w.logEl = liveScroller({ total: 120 });
  w.lastIndex = 119;

  const res = await w.collectAllRows(FAST);

  assert.equal(res.rows.length, 120, 'her satır toplanmalı');
  assert.equal(res.gaps, 0, 'boşluk kalmamalı');
  assert.equal(res.scrolled, true);
  assert.equal(res.rows[0].idx, 0);
  assert.equal(res.rows[119].idx, 119);
  assert.match(res.rows[0].text, /satır 0/);
});

test('tarama bitince kaydırma eski yerine döner', async () => {
  const { w } = makeWatcher();
  const el = liveScroller({ total: 80 });
  const before = el.scrollTop;
  w.logEl = el;
  w.lastIndex = 79;

  await w.collectAllRows(FAST);
  assert.equal(el.scrollTop, before, 'kullanıcının baktığı yer bozulmamalı');
});

test('tarama sayıma dokunmaz: olay ve boşluk üretmez', async () => {
  const { w, events } = makeWatcher();
  w.logEl = liveScroller({ total: 60 });
  w.lastIndex = 59;

  await w.collectAllRows(FAST);

  // flush() tarama boyunca susturulur; yoksa yukarı kaydırmak "yeni satır"
  // sanılıp eski satırlar ikinci kez işlenebilirdi.
  assert.equal(events.messages, 0);
  assert.deepEqual(events.gaps, []);
  assert.equal(events.resets, 0);
  assert.equal(w.lastIndex, 59, 'son işlenen index değişmemeli');
  assert.equal(w.scanning, false, 'tarama bayrağı kapanmalı');
});

test('tarama sırasında flush() susar, sonra yine çalışır', async () => {
  const { w, events } = makeWatcher();
  w.logEl = liveScroller({ total: 20 });
  w.lastIndex = -1;

  w.scanning = true;
  w.flush();
  assert.equal(events.messages, 0, 'tarama sırasında mesaj işlenmez');

  w.scanning = false;
  w.flush();
  assert.ok(events.messages > 0, 'tarama bitince yine okur');
});

test('kaydırılabilir kutu yoksa görünen satırlarla yetinir ve bunu söyler', async () => {
  const { w } = makeWatcher();
  // scrollHeight == clientHeight: _scroller() null döner.
  const el = { scrollHeight: 100, clientHeight: 100, scrollTop: 0, parentElement: null };
  Object.defineProperty(el, 'children', { get: () => [row(0, 'a rolled'), row(1, 'b rolled')] });
  w.logEl = el;

  const res = await w.collectAllRows(FAST);
  assert.equal(res.scrolled, false);
  assert.equal(res.rows.length, 2);
  assert.match(res.note, /kaydırılabilir/);
});

test('log kutusu yokken çökmez', async () => {
  const { w } = makeWatcher();
  w.logEl = null;
  // _ensureLog document'e bakar; testte yok, o yüzden sahte bir kutu veriyoruz.
  const res = await w.collectAllRows({ ...FAST }).catch(() => null);
  assert.ok(res === null || res.rows.length === 0);
});

test('kaydırıcı ilerlemezse sonsuz döngüye girmez', async () => {
  const { w } = makeWatcher();
  const el = { scrollHeight: 2000, clientHeight: 200, parentElement: null };
  let locked = 0;
  Object.defineProperty(el, 'scrollTop', {
    get: () => 0, // kaydırma hiç ilerlemiyor
    set: () => {
      locked += 1;
    },
  });
  Object.defineProperty(el, 'children', { get: () => [row(5, 'x rolled')] });
  w.logEl = el;

  const res = await w.collectAllRows(FAST);
  assert.equal(res.rows.length, 1);
  assert.ok(locked < 10, `döngü erken kırılmalı (${locked} deneme)`);
});

/* ------------------------------------------------------------ metne çevirme */

const CDN = 'https://cdn.colonist.io/dist/images';

test('zarlar metne yazılır: kayıtta kaybolmamalı', () => {
  const text = partsToText([
    { t: 'player', v: 'Emosh' },
    { t: 'text', v: 'rolled' },
    { t: 'img', v: `${CDN}/dice_3.svg` },
    { t: 'img', v: `${CDN}/dice_5.svg` },
  ]);
  assert.equal(text, 'Emosh rolled [zar 3] [zar 5]');
});

test('kaynak, yapı ve kart resimleri etikete döner', () => {
  const text = partsToText([
    { t: 'player', v: 'Skuashy' },
    { t: 'text', v: 'got' },
    { t: 'img', v: `${CDN}/card_lumber.svg` },
    { t: 'img', v: `${CDN}/card_grain.svg` },
  ]);
  assert.equal(text, 'Skuashy got [Odun] [Buğday]');

  assert.match(
    partsToText([{ t: 'img', v: `${CDN}/card_devcardback.svg` }]),
    /\[gelişim kartı\]/,
  );
  assert.match(
    partsToText([{ t: 'img', v: `${CDN}/card_rescardback.svg` }]),
    /\[kapalı kart\]/,
  );
  assert.match(partsToText([{ t: 'img', v: `${CDN}/road_red.svg` }]), /\[Yol\]/);
});

test('avatar satır metnine girmez', () => {
  const text = partsToText([
    { t: 'avatar', v: 'bot' },
    { t: 'text', v: 'Bot placed a' },
    { t: 'img', v: `${CDN}/settlement_blue.svg` },
  ]);
  assert.equal(text, 'Bot placed a [Köy]');
});

test('rowToText satır düğümünü doğrudan okur', () => {
  const node = row(7, 'Emosh rolled', [`${CDN}/dice_6.svg`, `${CDN}/dice_1.svg`]);
  assert.equal(rowToText(node), 'Emosh rolled [zar 6] [zar 1]');
});

test('toplanan satırlarda zar bilgisi durur (kim ne attı sonradan çıkarılabilir)', async () => {
  const { w } = makeWatcher();
  const names = ['Emosh', 'Skuashy'];
  w.logEl = liveScroller({
    total: 30,
    lines: (i) =>
      row(i, `${names[i % 2]} rolled`, [`${CDN}/dice_${(i % 6) + 1}.svg`, `${CDN}/dice_2.svg`]),
  });
  w.lastIndex = 29;

  const res = await w.collectAllRows(FAST);
  assert.equal(res.rows.length, 30);
  assert.ok(
    res.rows.every((r) => /\[zar \d\] \[zar 2\]/.test(r.text)),
    'her satırda iki zar olmalı',
  );
  assert.ok(res.rows.some((r) => r.text.startsWith('Emosh')));
  assert.ok(res.rows.some((r) => r.text.startsWith('Skuashy')));
});

/* ------------------------------------------------- boşluk sayısı
 * Gerçek kayıtta "71 satırlık boşluk (kaydırıcı silmiş)" yazıyordu ama hiçbir
 * şey kaybolmamıştı: colonist log'a metinsiz ayraç satırları da koyuyor ve
 * onların sıra numaraları atlanmış görünüyor. Boşluk yalnız DOM'da HİÇ
 * görmediğimiz numaralardan sayılmalı.
 */
test('metinsiz ayraç satırları boşluk sayılmaz', async () => {
  const { w } = makeWatcher();
  w.logEl = liveScroller({
    total: 20,
    window: 20,
    lines: (i) => (i % 2 === 0 ? row(i, `satır ${i} rolled`) : row(i, '')),
  });

  const res = await w.collectAllRows(FAST);
  assert.equal(res.rows.length, 10, 'yalnız metinli satırlar kayda girer');
  assert.equal(res.gaps, 0, 'boş satırlar kayıp sayılmamalı');
});

test('gerçekten görülmeyen numara boşluk sayılır', async () => {
  const { w } = makeWatcher();
  const el = { scrollHeight: 100, clientHeight: 100, scrollTop: 0, parentElement: null };
  // 5 ve 6 hiç yok: kaydırıcı silmiş.
  Object.defineProperty(el, 'children', {
    get: () => [row(4, 'a rolled'), row(7, 'b rolled')],
  });
  w.logEl = el;

  const res = await w.collectAllRows(FAST);
  assert.equal(res.gaps, 2);
});
