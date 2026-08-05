/**
 * Gerçek log'u yakalamak için tarayıcı konsolu betiği.
 *
 * Kullanım:
 *   1. colonist.io'da bir oyundayken F12 -> Console sekmesi
 *      (Sources değil; Console. Üstteki "top" yazan kutu seçili kalsın.)
 *   2. Bu dosyanın tamamını yapıştır, Enter.
 *   3. Ardından  copy(__ctDump)  yaz, Enter -> döküm panoya kopyalanır.
 *
 * Çıktı: log kutusunun etiketi/id/class'ı + son 20 satırın ham HTML'i.
 * Eklenti bir satırı tanımıyorsa asıl ihtiyaç duyulan şey budur.
 */
(() => {
  const RE =
    /\b(rolled|placed a|received starting resources|got|built a|bought|stole|discarded|gave|took|used)\b/i;

  let best = null;
  let hits = 0;
  let size = Infinity;

  for (const el of document.body.getElementsByTagName('*')) {
    const kids = el.children;
    if (kids.length < 3) continue;
    let h = 0;
    for (let i = 0; i < Math.min(kids.length, 60); i++) {
      const t = kids[i].textContent;
      if (t && t.length <= 200 && RE.test(t)) h++;
    }
    if (h < 3) continue;
    const s = el.getElementsByTagName('*').length;
    if (h > hits || (h === hits && s < size)) {
      best = el;
      hits = h;
      size = s;
    }
  }

  if (!best) {
    window.__ctDump = 'LOG BULUNAMADI';
    console.log(
      '%cLog kutusu bulunamadı.',
      'color:#ff6b6b;font-weight:bold',
      '\n- Oyun ekranında mısın (lobide değil)?',
      '\n- Konsolun üstündeki bağlam kutusunda "top" yerine başka bir frame seçiliyse "top" yap.',
    );
    return 'LOG BULUNAMADI';
  }

  const head =
    `<${best.tagName.toLowerCase()} id="${best.id}" class="${best.className}"> ` +
    `— ${best.children.length} satır, ${hits} eşleşme`;
  const rows = [...best.children]
    .slice(-20)
    .map((c) => c.outerHTML)
    .join('\n\n');

  window.__ctDump = head + '\n\n' + rows;
  console.log(window.__ctDump);
  console.log('%cŞimdi şunu çalıştır:  copy(__ctDump)', 'color:#48c774;font-weight:bold');
  return head;
})();
