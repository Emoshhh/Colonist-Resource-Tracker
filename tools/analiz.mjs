#!/usr/bin/env node
/**
 * Maç kaydı çözümleyici.
 *
 * Eklentinin maç sonunda yazdığı .txt dosyalarını okur ve oyunun hiçbir yerinde
 * olmayan istatistikleri çıkarır: kim hangi zarı attı, kim ne kadar kaynak
 * üretti, haydut kime kaç kez geldi, kim kaç kart çaldı, hangi limandan kaç
 * takas yapıldı, hangi tur neyi inşa etti.
 *
 * Kullanım:
 *   node tools/analiz.mjs <dosya.txt> [dosya2.txt ...]
 *   node tools/analiz.mjs ~/Downloads/colonist-logs        (klasörün tamamı)
 *
 * Birden fazla maç verilirse sonda toplu (kariyer) özeti de yazılır.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RES = ['Odun', 'Tuğla', 'Koyun', 'Buğday', 'Maden'];
const PIECES = { Road: 'yol', Settlement: 'köy', City: 'şehir' };

/** "[Odun] [Odun] [Maden]" -> ['Odun','Odun','Maden'] */
function tags(s) {
  return [...String(s).matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
}

const emptyRes = () => Object.fromEntries(RES.map((r) => [r, 0]));

function newPlayer(name) {
  return {
    name,
    rolls: Array(13).fill(0),
    rollCount: 0,
    // Üretim: zar sonucu gelen kartlar (başlangıç kaynakları hariç).
    gained: emptyRes(),
    gainedTotal: 0,
    starting: emptyRes(),
    stoleFrom: {}, // kimden kaç kart çaldı
    robbedBy: {}, // kim ondan kaç kart çaldı
    stolenCards: emptyRes(),
    lostCards: emptyRes(),
    robberMoves: 0,
    blocked: 0, // haydut yüzünden üretemediği tur
    discarded: 0,
    trades: [], // {verdi:[...], aldi:[...]}
    builds: { yol: 0, köy: 0, şehir: 0 },
    buildLog: [], // {zar: n, ne: 'köy'}
    devBought: 0,
    devUsed: {},
    vp: 0,
  };
}

/**
 * Haydudun engellediği üretimi geri çıkarır.
 *
 * Colonist "X is blocked by the Robber. No resources produced" derken KİMİN
 * engellendiğini yazmıyor — yalnız arazinin resmini koyuyor. Ama her oyuncunun
 * hangi zarda ne ürettiği log'un geri kalanından biliniyor: aynı sayı engelsiz
 * geldiğinde ne aldıysa, engelli gelişte onu alamamış demektir.
 *
 * Tahmin için engellenen atıştan ÖNCEKİ en son örnek kullanılır. Üretim oyun
 * boyunca yalnız artar (köy -> şehir, yeni köyler), dolayısıyla önceki örnek
 * bir ALT SINIR verir: "en az bu kadarını alamadı". Sonraki bir örnek almak
 * kaybı şişirirdi — rakip arada o araziye şehir dikmiş olabilir. Öncesi hiç
 * yoksa sonraki en erken örnek kullanılır ve sayı üst sınıra yaklaşır.
 */
function attachRobberLoss(players, rollLog) {
  for (const p of players) {
    p.robberLost = emptyRes();
    p.robberLostTotal = 0;
    p.robberBlockedRolls = 0;
    p.robberUnknown = 0;
    p.robberTiles = {}; // "4-Buğday" -> kaç kez

  }
  const byName = new Map(players.map((p) => [p.name, p]));

  // Engelsiz atışlarda her oyuncunun o sayıdan ne aldığı.
  const samples = new Map(); // "ad|sayı" -> [{no, vec}]
  for (const r of rollLog) {
    if (r.blocked) continue;
    for (const p of players) {
      const key = `${p.name}|${r.n}`;
      if (!samples.has(key)) samples.set(key, []);
      samples.get(key).push({ no: r.no, vec: r.got[p.name] || emptyRes() });
    }
  }

  for (const r of rollLog) {
    if (!r.blocked) continue;
    for (const p of players) {
      if (r === rollLog[0]) continue;
      const list = samples.get(`${p.name}|${r.n}`) || [];
      if (!list.length) {
        p.robberUnknown += 1;
        continue;
      }
      // Önceki en son örnek (alt sınır); yoksa sonraki en erken.
      let best = null;
      for (const s of list) {
        if (s.no >= r.no) continue;
        if (!best || s.no > best.no) best = s;
      }
      if (!best) {
        for (const s of list) {
          if (s.no <= r.no) continue;
          if (!best || s.no < best.no) best = s;
        }
      }
      if (!best) {
        p.robberUnknown += 1;
        continue;
      }
      const actual = r.got[p.name] || emptyRes();
      let lost = 0;
      for (const res of RES) {
        if (r.tile && res !== r.tile) continue; // arazi biliniyorsa yalnız o kaynak
        const diff = best.vec[res] - actual[res];
        if (diff > 0) {
          p.robberLost[res] += diff;
          lost += diff;
        }
      }
      if (lost) {
        p.robberBlockedRolls += 1;
        const key = r.tile ? `${r.n}-${r.tile}` : `${r.n}`;
        p.robberTiles[key] = (p.robberTiles[key] || 0) + 1;
      }
    }
  }

  // Toplam = engellenen üretim + çalınan kartlar.
  for (const p of players) {
    p.robberLostTotal = RES.reduce((a, r) => a + p.robberLost[r], 0);
    p.robberTotalWithSteals = p.robberLostTotal + RES.reduce((a, r) => a + p.lostCards[r], 0);
  }
  void byName;
}

export function parseMatch(text, fileName = '') {
  const lines = text.split('\n');
  const head = {};
  for (const l of lines) {
    const m = /^# (oyuncular|ben|zar|satır): (.*)$/.exec(l);
    if (m) head[m[1]] = m[2];
    const d = /^# colonist maç kaydı — (.*)$/.exec(l);
    if (d) head.tarih = d[1].trim();
  }

  const names = (head.oyuncular || '').split(',').map((s) => s.trim()).filter(Boolean);
  const me = (head.ben || '').trim();
  const players = new Map(names.map((n) => [n, newPlayer(n)]));
  const get = (n) => {
    if (!players.has(n)) players.set(n, newPlayer(n));
    return players.get(n);
  };
  // "You stole ... from X" satırlarında özne biziz.
  const asName = (n) => (/^you$/i.test(n) ? me : n);

  let winner = null;
  let rollNo = 0;
  let lastRoller = null;
  // Her zar atışı için kimin ne ürettiği: haydudun engellediği üretimi
  // buradan geri çıkarıyoruz (log hangi oyuncunun engellendiğini yazmıyor).
  const rollLog = [];
  const curRoll = () => rollLog[rollLog.length - 1] || null;

  for (const raw of lines) {
    const m = /^\[\s*(-?\d+)\]\s(.*)$/.exec(raw);
    if (!m) continue;
    const line = m[2].trim();
    let g;

    if ((g = /^(.+?) rolled \[zar (\d)\] \[zar (\d)\]$/.exec(line))) {
      const p = get(g[1]);
      const total = Number(g[2]) + Number(g[3]);
      p.rolls[total] += 1;
      p.rollCount += 1;
      rollNo += 1;
      lastRoller = p;
      rollLog.push({ n: total, no: rollNo, by: p.name, blocked: false, tile: null, got: {} });
      continue;
    }

    if ((g = /^(.+?) received starting resources (.+)$/.exec(line))) {
      const p = get(g[1]);
      for (const r of tags(g[2])) if (r in p.starting) p.starting[r] += 1;
      continue;
    }

    if ((g = /^(.+?) got ((?:\[[^\]]+\]\s*)+)$/.exec(line))) {
      const p = get(g[1]);
      const roll = curRoll();
      for (const r of tags(g[2])) {
        if (!(r in p.gained)) continue;
        p.gained[r] += 1;
        p.gainedTotal += 1;
        if (roll) {
          roll.got[p.name] = roll.got[p.name] || emptyRes();
          roll.got[p.name][r] += 1;
        }
      }
      continue;
    }

    if ((g = /^(.+?) built a (Road|Settlement|City)\b/.exec(line))) {
      const p = get(g[1]);
      const what = PIECES[g[2]];
      p.builds[what] += 1;
      p.buildLog.push({ zar: rollNo, ne: what });
      if (what !== 'yol') p.vp += 1;
      continue;
    }

    if ((g = /^(.+?) bought \[gelişim kartı\]$/.exec(line))) {
      get(g[1]).devBought += 1;
      continue;
    }

    if ((g = /^(.+?) used (Knight|Monopoly|Road Building|Year of Plenty)\b/.exec(line))) {
      const p = get(g[1]);
      p.devUsed[g[2]] = (p.devUsed[g[2]] || 0) + 1;
      continue;
    }

    if ((g = /^(.+?) moved Robber\b/.exec(line))) {
      get(g[1]).robberMoves += 1;
      continue;
    }

    if (/is blocked by the Robber/.test(line)) {
      // Satır kimin engellendiğini YAZMIYOR; yalnız arazi resmini koyuyor.
      // Yeni kayıtlarda "[arazi Maden]" olarak duruyor, eskilerde "[?]".
      const roll = curRoll();
      if (roll) {
        roll.blocked = true;
        const t = /\[arazi ([^\]]+)\]/.exec(line);
        if (t && t[1] !== 'çöl') roll.tile = t[1];
      }
      if (lastRoller) lastRoller.blocked += 1;
      continue;
    }

    // "X stole [Y] from you" / "You stole [Y] from X"
    if ((g = /^(.+?) stole \[([^\]]+)\] from (.+?)$/.exec(line))) {
      const thief = get(asName(g[1]));
      const victim = get(asName(g[3]));
      const card = g[2];
      thief.stoleFrom[victim.name] = (thief.stoleFrom[victim.name] || 0) + 1;
      victim.robbedBy[thief.name] = (victim.robbedBy[thief.name] || 0) + 1;
      if (card in thief.stolenCards) thief.stolenCards[card] += 1;
      if (card in victim.lostCards) victim.lostCards[card] += 1;
      continue;
    }

    // Tekel: "Emosh stole 2 [Maden]"
    if ((g = /^(.+?) stole (\d+) \[([^\]]+)\]$/.exec(line))) {
      const p = get(asName(g[1]));
      const n = Number(g[2]);
      if (g[3] in p.stolenCards) p.stolenCards[g[3]] += n;
      continue;
    }

    if ((g = /^(.+?) discarded (.+)$/.exec(line))) {
      get(asName(g[1])).discarded += tags(g[2]).length;
      continue;
    }

    if ((g = /^(.+?) gave bank (.+?) and took (.+)$/.exec(line))) {
      get(g[1]).trades.push({ verdi: tags(g[2]), aldi: tags(g[3]) });
      continue;
    }

    if ((g = /^(.+?) received (Longest Road|Largest Army)\b/.exec(line))) {
      get(g[1]).vp += 2;
      continue;
    }
    if ((g = /^(Longest Road|Largest Army) .*passed from (.+?) to (.+?) \(/.exec(line))) {
      get(g[2]).vp -= 2;
      get(g[3]).vp += 2;
      continue;
    }

    if ((g = /(.+?) won the game/.exec(line))) {
      winner = g[1].replace(/\[\?\]/g, '').trim();
      continue;
    }
  }

  const list = [...players.values()];
  attachRobberLoss(list, rollLog);

  /*
   * Başlıktaki zar tablosu maç boyunca CANLI tutuldu; gövdedeki log ise
   * kaydırıcı eski satırları silmişse eksik olabilir. Başlık daha çok zar
   * biliyorsa zar istatistiğinde ona güveniriz (üretim/çalma gibi kalemler
   * yalnız gövdeden çıkıyor, onlar eksik kalır ve raporda öyle işaretlenir).
   */
  let headerRolls = 0;
  const table = /--- zar dağılımı[^\n]*\n([\s\S]*?)\n\s*(?:---|$)/.exec(text);
  if (table) {
    for (const row of table[1].split('\n')) {
      const cells = row.trim().split(/\s+/);
      if (cells.length < 13) continue;
      const name = cells.slice(0, cells.length - 12).join(' ');
      if (!players.has(name)) continue;
      const nums = cells.slice(cells.length - 12).map(Number);
      if (nums.some((n) => !Number.isFinite(n))) continue;
      const p = players.get(name);
      const total = nums[11];
      if (total > p.rollCount) {
        for (let n = 2; n <= 12; n += 1) p.rolls[n] = nums[n - 2];
        p.rollCount = total;
        p.rollsFromHeader = true;
        headerRolls += total;
      }
    }
  }
  const bodyRolls = rollNo;
  const totalRolls = Math.max(rollNo, list.reduce((a, p) => a + p.rollCount, 0));

  return {
    head,
    file: fileName,
    me,
    winner,
    rollNo: totalRolls,
    bodyRolls,
    partial: headerRolls > 0,
    rollLog,
    players: list,
  };
}

/* ------------------------------------------------------------------ yazdır */

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

/** İki zarın beklenen dağılımı: 2..12 için 1/36'lık ağırlıklar. */
const P = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1].map((x) => x / 36);

/**
 * Zar şansı: attığın zarlar beklenenden ne kadar saptı?
 * Her sayı için (gerçek - beklenen), karesi/beklenen toplanır (ki-kare).
 * Büyük değer = dağılım beklenenden uzak; yön için 7 ve uç sayılara bakılır.
 */
function diceLuck(p) {
  if (!p.rollCount) return null;
  let chi = 0;
  for (let n = 2; n <= 12; n += 1) {
    const exp = P[n] * p.rollCount;
    chi += ((p.rolls[n] - exp) ** 2) / exp;
  }
  return chi;
}

function matchReport(m) {
  const out = [];
  const title = m.head.tarih || m.file;
  out.push('='.repeat(72));
  out.push(`MAÇ: ${title}`);
  out.push(
    `oyuncular: ${m.players.map((p) => p.name).join(' vs ')}` +
      (m.winner ? `  ·  kazanan: ${m.winner}` : '  ·  kazanan: (log\'da yok)') +
      `  ·  ${m.rollNo} zar`,
  );
  if (m.partial) {
    out.push(
      `⚠ LOG EKSİK: kayıtta ${m.bodyRolls} zarlık bölüm var, maç ${m.rollNo} zar sürmüş.` +
        ' Zar tablosu başlıktan (canlı sayımdan) alındı; üretim, çalma ve' +
        ' inşa sayıları yalnız kaydedilen bölümü kapsar.',
    );
  }
  out.push('');

  // --- zar
  out.push('ZAR  (kim ne attı · beklenen = adil zarda kaç gelmeliydi)');
  out.push(pad('', 14) + [...Array(11)].map((_, i) => num(i + 2, 5)).join('') + num('top', 6) + num('sapma', 8));
  for (const p of m.players) {
    out.push(
      pad(p.name.slice(0, 13), 14) +
        p.rolls.slice(2, 13).map((v) => num(v, 5)).join('') +
        num(p.rollCount, 6) +
        num(diceLuck(p) ? diceLuck(p).toFixed(1) : '-', 8),
    );
  }
  const exp = [...Array(11)].map((_, i) => (P[i + 2] * m.rollNo).toFixed(1));
  out.push(pad('beklenen', 14) + exp.map((v) => num(v, 5)).join('') + num(m.rollNo, 6));
  out.push('');

  // --- üretim
  out.push('KAYNAK ÜRETİMİ  (zardan gelen kartlar, başlangıç hariç)');
  out.push(pad('', 14) + RES.map((r) => num(r, 8)).join('') + num('toplam', 8) + num('zar başı', 10));
  for (const p of m.players) {
    out.push(
      pad(p.name.slice(0, 13), 14) +
        RES.map((r) => num(p.gained[r], 8)).join('') +
        num(p.gainedTotal, 8) +
        num(m.rollNo ? (p.gainedTotal / m.rollNo).toFixed(2) : '-', 10),
    );
  }
  out.push('');

  // --- haydut
  out.push('HAYDUT ve ÇALMA');
  for (const p of m.players) {
    const stole = Object.entries(p.stoleFrom).map(([k, v]) => `${k}'dan ${v}`).join(', ') || 'yok';
    const lost = Object.entries(p.robbedBy).map(([k, v]) => `${k} ${v}`).join(', ') || 'yok';
    out.push(
      `  ${pad(p.name.slice(0, 13), 14)} haydut ${p.robberMoves} kez · çaldı: ${stole}` +
        ` · çalındı: ${lost} · üretimi kesildi: ${p.robberBlockedRolls} atış` +
        ` · 7'de attığı kart: ${p.discarded}`,
    );
  }
  out.push('');

  // --- haydut yüzünden alınamayan kaynaklar (asıl merak edilen)
  out.push('HIRSIZ YÜZÜNDEN ALINAMAYAN KAYNAKLAR  (engellenen üretim + çalınan)');
  out.push(
    pad('', 14) +
      RES.map((r) => num(r, 8)).join('') +
      num('engel', 8) +
      num('çalınan', 9) +
      num('TOPLAM', 9),
  );
  for (const p of m.players) {
    const stolen = RES.reduce((a, r) => a + p.lostCards[r], 0);
    out.push(
      pad(p.name.slice(0, 13), 14) +
        RES.map((r) => num(p.robberLost[r] + p.lostCards[r], 8)).join('') +
        num(p.robberLostTotal, 8) +
        num(stolen, 9) +
        num(p.robberLostTotal + stolen, 9),
    );
  }
  for (const p of m.players) {
    const detay = RES.filter((r) => p.robberLost[r])
      .map((r) => `${r} ${p.robberLost[r]}`)
      .join(', ');
    const tiles = Object.entries(p.robberTiles)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ×${v}`)
      .join(', ');
    out.push(
      `  ${pad(p.name.slice(0, 13), 14)} haydut ${p.robberBlockedRolls} atışta üretimini kesti` +
        (detay ? ` — ${detay}` : ' — kayıp yok') +
        (tiles ? ` · engellenen arazi: ${tiles}` : '') +
        (p.robberUnknown ? ` · ${p.robberUnknown} atış hesaplanamadı` : ''),
    );
  }
  out.push('');

  // --- takas
  out.push('BANKA / LİMAN TAKASLARI');
  for (const p of m.players) {
    if (!p.trades.length) {
      out.push(`  ${pad(p.name.slice(0, 13), 14)} takas yok`);
      continue;
    }
    const byRate = {};
    for (const t of p.trades) {
      const kind = [...new Set(t.verdi)].join('+');
      const rate = `${t.verdi.length / Math.max(1, t.aldi.length)}:1 ${kind}`;
      byRate[rate] = (byRate[rate] || 0) + 1;
    }
    const detail = Object.entries(byRate)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ×${v}`)
      .join(', ');
    out.push(`  ${pad(p.name.slice(0, 13), 14)} ${p.trades.length} takas — ${detail}`);
  }
  out.push('');

  // --- inşa
  out.push('İNŞA ve GELİŞİM KARTI');
  for (const p of m.players) {
    const dev = Object.entries(p.devUsed).map(([k, v]) => `${k}×${v}`).join(', ') || '-';
    out.push(
      `  ${pad(p.name.slice(0, 13), 14)} yol ${p.builds.yol} · köy ${p.builds.köy} · şehir ${p.builds.şehir}` +
        ` · GK alındı ${p.devBought} · kullanıldı: ${dev}`,
    );
  }
  out.push('');

  out.push('İNŞA ZAMAN ÇİZELGESİ  (kaçıncı zarda ne kuruldu)');
  for (const p of m.players) {
    const tl = p.buildLog
      .filter((b) => b.ne !== 'yol')
      .map((b) => `${b.zar}.${b.ne[0].toUpperCase()}`)
      .join('  ');
    out.push(`  ${pad(p.name.slice(0, 13), 14)} ${tl || '-'}`);
  }
  return out.join('\n');
}

function careerReport(matches) {
  const out = ['', '='.repeat(72), `KARİYER  (${matches.length} maç)`, ''];
  const all = new Map();
  for (const m of matches) {
    for (const p of m.players) {
      if (!all.has(p.name)) all.set(p.name, { ...newPlayer(p.name), maç: 0, galibiyet: 0 });
      const a = all.get(p.name);
      a.maç += 1;
      if (m.winner === p.name) a.galibiyet += 1;
      a.rollCount += p.rollCount;
      for (let n = 2; n <= 12; n += 1) a.rolls[n] += p.rolls[n];
      a.gainedTotal += p.gainedTotal;
      for (const r of RES) a.gained[r] += p.gained[r];
      a.devBought += p.devBought;
      a.discarded += p.discarded;
      a.robberMoves += p.robberMoves;
      a.robberLost = a.robberLost || emptyRes();
      a.lostCards = a.lostCards || emptyRes();
      for (const r of RES) {
        a.robberLost[r] += (p.robberLost && p.robberLost[r]) || 0;
        a.lostCards[r] += p.lostCards[r];
      }
    }
  }
  out.push(pad('oyuncu', 14) + num('maç', 5) + num('galip', 7) + num('%', 7) + num('zar', 7) + num('7', 5) + num('üretim', 9) + num('sapma', 8));
  for (const a of [...all.values()].sort((x, y) => y.maç - x.maç)) {
    out.push(
      pad(a.name.slice(0, 13), 14) +
        num(a.maç, 5) +
        num(a.galibiyet, 7) +
        num(a.maç ? Math.round((a.galibiyet / a.maç) * 100) : 0, 7) +
        num(a.rollCount, 7) +
        num(a.rolls[7], 5) +
        num(a.gainedTotal, 9) +
        num(diceLuck(a) ? diceLuck(a).toFixed(1) : '-', 8),
    );
  }
  out.push('');
  out.push('HIRSIZ BİLANÇOSU (tüm maçlar · engellenen üretim + çalınan kart)');
  out.push(pad('oyuncu', 14) + RES.map((r) => num(r, 8)).join('') + num('TOPLAM', 9));
  for (const a of all.values()) {
    const tot = RES.reduce((x, r) => x + a.robberLost[r] + a.lostCards[r], 0);
    out.push(
      pad(a.name.slice(0, 13), 14) +
        RES.map((r) => num(a.robberLost[r] + a.lostCards[r], 8)).join('') +
        num(tot, 9),
    );
  }

  out.push('');
  out.push('TOPLAM ZAR DAĞILIMI (tüm maçlar)');
  const tot = Array(13).fill(0);
  let n = 0;
  for (const a of all.values()) {
    // Her zar iki oyuncuda değil tek atanda sayılı; toplamak doğru.
    for (let k = 2; k <= 12; k += 1) tot[k] += a.rolls[k];
    n += a.rollCount;
  }
  out.push(pad('', 14) + [...Array(11)].map((_, i) => num(i + 2, 6)).join(''));
  out.push(pad('gerçek', 14) + tot.slice(2, 13).map((v) => num(v, 6)).join(''));
  out.push(pad('beklenen', 14) + [...Array(11)].map((_, i) => num((P[i + 2] * n).toFixed(1), 6)).join(''));
  return out.join('\n');
}

/* -------------------------------------------------------------------- main */

function expand(paths) {
  const files = [];
  for (const p of paths) {
    if (statSync(p).isDirectory()) {
      for (const f of readdirSync(p).sort()) if (f.endsWith('.txt')) files.push(join(p, f));
    } else files.push(p);
  }
  return files;
}

const argv = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!argv.length) {
    console.error('Kullanım: node tools/analiz.mjs <kayıt.txt | klasör> ...');
    process.exit(1);
  }
  const files = expand(argv);
  if (!files.length) {
    console.error('Okunacak .txt kaydı bulunamadı.');
    process.exit(1);
  }
  const matches = files.map((f) => parseMatch(readFileSync(f, 'utf8'), f));
  for (const m of matches) console.log(matchReport(m) + '\n');
  if (matches.length > 1) console.log(careerReport(matches));
}

export { matchReport, careerReport };
