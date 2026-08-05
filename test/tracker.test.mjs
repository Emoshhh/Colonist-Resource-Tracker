import test from 'node:test';
import assert from 'node:assert/strict';

import { Tracker } from '../extension/src/core/tracker.js';
import { toVector } from '../extension/src/core/resources.js';

function cell(report, player, res) {
  const p = report.players.find((x) => x.name === player);
  return p.res.find((r) => r.res === res);
}

test('kesin kazanç ve kayıp tek dünyada kalır', () => {
  const t = new Tracker(['A']);
  t.gain('A', toVector({ ore: 3, grain: 2 }));
  t.lose('A', toVector({ ore: 3, grain: 2 }));
  const rep = t.report();
  assert.equal(rep.worlds, 1);
  assert.equal(cell(rep, 'A', 'ore').max, 0);
  assert.equal(rep.desyncs, 0);
});

test('imkânsız harcama durumu bozmaz, desync olarak işaretlenir', () => {
  const t = new Tracker(['A']);
  t.gain('A', toVector({ ore: 1 }));
  const ok = t.lose('A', toVector({ ore: 5 }));
  assert.equal(ok, false);
  const rep = t.report();
  assert.equal(rep.desyncs, 1);
  assert.equal(cell(rep, 'A', 'ore').min, 1, 'önceki durum korunmalı');
});

test('bilinmeyen çalma dallanır ve olasılıkları taşır', () => {
  const t = new Tracker(['A', 'B']);
  t.gain('B', toVector({ ore: 3, wool: 1 }));
  t.stealUnknown('A', 'B');

  const rep = t.report();
  assert.equal(rep.worlds, 2);

  const aOre = cell(rep, 'A', 'ore');
  assert.equal(aOre.min, 0);
  assert.equal(aOre.max, 1);
  assert.ok(Math.abs(aOre.mean - 0.75) < 1e-9, 'maden çalma olasılığı 3/4');

  const aWool = cell(rep, 'A', 'wool');
  assert.ok(Math.abs(aWool.mean - 0.25) < 1e-9);

  // toplam kart sayısı her zaman kesindir
  const a = rep.players.find((p) => p.name === 'A');
  assert.equal(a.totalMin, 1);
  assert.equal(a.totalMax, 1);
});

test('sonraki hamle imkânsız dalları eleyerek belirsizliği çözer', () => {
  const t = new Tracker(['A', 'B']);
  t.gain('B', toVector({ ore: 1, grain: 1 }));
  t.stealUnknown('A', 'B');
  assert.equal(t.report().worlds, 2);

  // B madenini attıysa, çalınan kart buğday olmak zorunda
  t.lose('B', toVector({ ore: 1 }));

  const rep = t.report();
  assert.equal(rep.worlds, 1);
  assert.equal(cell(rep, 'A', 'grain').min, 1);
  assert.equal(cell(rep, 'A', 'grain').max, 1);
  assert.equal(cell(rep, 'A', 'ore').max, 0);
});

test('görünen çalma Bayes güncellemesi yapar', () => {
  const t = new Tracker(['A', 'B']);
  t.gain('B', toVector({ ore: 2, wool: 1 }));
  t.stealKnown('A', 'B', 'ore');
  const rep = t.report();
  assert.equal(rep.worlds, 1);
  assert.equal(cell(rep, 'A', 'ore').min, 1);
  assert.equal(cell(rep, 'B', 'ore').min, 1);
});

test('tekel, alınan miktarı bilindiğinde olasılıkları budar', () => {
  const t = new Tracker(['A', 'B']);
  t.gain('B', toVector({ ore: 1, wool: 1 }));
  t.stealUnknown('A', 'B'); // A ya maden ya koyun aldı
  assert.equal(t.report().worlds, 2);

  // A tekel oynadı ve masadan 1 maden topladı: demek ki maden hâlâ B'deydi,
  // yani A daha önce koyun çalmıştı.
  t.monopoly('A', 'ore', 1);

  const rep = t.report();
  assert.equal(rep.worlds, 1);
  assert.equal(cell(rep, 'A', 'wool').min, 1);
  assert.equal(cell(rep, 'A', 'ore').min, 1);
  assert.equal(cell(rep, 'B', 'ore').max, 0);
});

test('tekel toplamı korur: çalma iki oyuncu arasındaysa kısıt ayırt etmez', () => {
  const t = new Tracker(['A', 'B', 'C']);
  t.gain('B', toVector({ ore: 1, wool: 1 }));
  t.stealUnknown('C', 'B');
  t.monopoly('A', 'ore', 1); // B+C toplamı her dünyada 1, eleme olmaz
  const rep = t.report();
  assert.equal(rep.worlds, 2, 'koyunun kimde olduğu hâlâ belirsiz');
  assert.equal(cell(rep, 'A', 'ore').min, 1);
  assert.ok(cell(rep, 'C', 'wool').mean > 0 && cell(rep, 'C', 'wool').min === 0);
});

test('takas iki yönlü uygulanır ve yetersiz dünyaları eler', () => {
  const t = new Tracker(['A', 'B']);
  t.gain('A', toVector({ lumber: 2 }));
  t.gain('B', toVector({ brick: 1 }));
  t.transfer('A', 'B', toVector({ lumber: 1 }));
  t.transfer('B', 'A', toVector({ brick: 1 }));

  const rep = t.report();
  assert.equal(cell(rep, 'A', 'lumber').min, 1);
  assert.equal(cell(rep, 'A', 'brick').min, 1);
  assert.equal(cell(rep, 'B', 'lumber').min, 1);
  assert.equal(cell(rep, 'B', 'brick').max, 0);
});

test('boş elden çalma imkânsızdır', () => {
  const t = new Tracker(['A', 'B']);
  const ok = t.stealUnknown('A', 'B');
  assert.equal(ok, false);
  assert.equal(t.report().desyncs, 1);
});

test('oyuncular sonradan eklenebilir', () => {
  const t = new Tracker();
  t.gain('A', toVector({ ore: 1 }));
  t.gain('B', toVector({ wool: 1 }));
  const rep = t.report();
  assert.deepEqual(rep.players.map((p) => p.name), ['A', 'B']);
  assert.equal(cell(rep, 'B', 'wool').min, 1);
});

test('ardışık çalmalarda dünya sayısı patlamaz', () => {
  const t = new Tracker(['A', 'B']);
  t.gain('B', toVector({ ore: 2, wool: 2, grain: 2, lumber: 2, brick: 2 }));
  for (let i = 0; i < 6; i++) t.stealUnknown('A', 'B');
  const rep = t.report();
  assert.ok(rep.worlds <= 500, `dünya sayısı ${rep.worlds}`);
  const a = rep.players.find((p) => p.name === 'A');
  assert.equal(a.totalMin, 6);
  assert.equal(a.totalMax, 6);
});
