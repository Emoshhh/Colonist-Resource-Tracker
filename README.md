# Colonist Kaynak Takibi

[colonist.io](https://colonist.io) oyununda **rakiplerin elindeki kaynakları canlı takip eden** bir tarayıcı eklentisi.
Oyun ekranındaki genel log'u okur, zar dağıtımlarını ve hamleleri işleyerek her oyuncunun elini hesaplar
ve ekranın köşesinde sürüklenebilir bir panelde gösterir. Sayımı oyunun kendi oyuncu paneliyle
sürekli karşılaştırır, böylece kaçan bir log satırı sessizce yanlış sayıya dönüşmez.

```
┌────────────────────────────────────┐
│ ● Kaynak Takibi    % 🎲 ⟲ ⧉ –      │
├────────────────────────────────────┤
│        🌲 🧱 🐑 🌾 ⛏  ?  Σ  GK     │
│ Ali     1  0  2  1  0  0  4   1    │  ← eli tamamen biliniyor
│ Veli    0  1  1  0  1  2  5   0    │  ← 2 kartın türü bilinmiyor
│              ‾        ‾            │  ← noktalı alt çizgi: daha fazlası olabilir
├────────────────────────────────────┤
│ ▁▃█▅▂▁▃▁▂▁▁  2..12 · 41 zar        │
└────────────────────────────────────┘
```

Kaynak sütunlarında **kesin olarak bildiğimiz** sayı yazar — "en az bu kadar var".
Çalma yüzünden türü belirsiz kalan kartlar tahmine dağıtılmaz, `?` sütununda toplanır.
Rakip harcama yaptıkça `?` kendiliğinden erir ve kartlar gerçek sütunlarına geçer.

`%` düğmesiyle olasılıklı görünüme geçebilirsin: orada kesin sayı yerine beklenen
değer (`1.4`) ve alt–üst sınır (`1-2`) gösterilir.

## Nasıl çalışır

Colonist'in oyun log'u, **rastgele hırsızlık (haydut/şövalye) dışında** her şeyi açıkça yazar:
kim ne aldı, ne inşa etti, ne takas etti, ne attı. Yani belirsizliğin tek kaynağı çalınan kartlardır.

Bu yüzden takip motoru tek bir tahmin tutmaz, **olası tüm dağılımları paralel tutar**:

1. Belirsiz bir çalma olduğunda durum, kurbanın elindeki her kart için dallanır
   (ağırlık = o kartın çekilme olasılığı).
2. Sonraki her hamle imkânsız dalları eler. Örneğin rakip bir yol inşa ettiyse,
   elinde odun+tuğla olmayan dallar düşer.
3. Böylece belirsizlik zamanla kendiliğinden çözülür ve panel yine kesin sayılara döner.

Panel bu iç durumu iki sayıya indirger: her kaynak için **garanti alt sınır**
(tüm olası dağılımlarda en az bu kadar var) ve geri kalan belirsiz kartların
toplamı olan `?` sütunu. Hücrenin üstüne gelince üst sınır ve olasılık da görünür.

Toplam kart sayısı (Σ) her zaman kesindir — çalma toplamı değiştirmez, sadece yerini değiştirir.

## İki kaynak: log + oyunun kendi paneli

Log tek kaynak değil. Colonist'in oyuncu panelinde herkesin **toplam kart** ve
**gelişim kartı** sayısı zaten yazıyor. Eklenti bu rozetleri de okuyor
(`data-resource-card` / `data-development-card`) ve kendi hesabıyla karşılaştırıyor.

İkisi birbirinin eksiğini kapatıyor:

| | Log | Oyun paneli |
|---|---|---|
| Kartın **türü** (odun mu taş mı) | ✅ yazıyor | ❌ hiç söylemez |
| Kartın **sayısı** | hesapla çıkarılır | ✅ doğrudan yazıyor |
| Kim "sen"sin | tahmin gerekir | ✅ `currentUser` |

Sayılar tutuyorsa hiçbir şey görünmez — sessiz doğrulama. Tutmuyorsa fark
**kapatılır** (aşağıya bak) ve panelde `⚠ N sayı oyun panelinden düzeltildi` yazar.

## 7 geldiğinde ne oluyor

Biri 8+ kartla 7'ye yakalanınca yarısını atar. Bu satır iki yoldan işlenir:

1. **Log satırı okunursa** — `TheBigLion discarded ⛏⛏🐑🐑🌲` biçiminde geliyor (canlı oyundan
   doğrulandı, `test/fixtures/live-rows.html`). Atılan kartlar tam olarak düşülür, tür bilgisi korunur.
2. **Okunamazsa** (metin değişmiş, satır kaçmış, ya da hiç yazılmamışsa) panel devreye
   girer: oyun "Cuda'nın 4 kartı var" diyorsa ve bizim hesapta 8 varsa, **4 kart türü
   bilinmeden çıkarılır**. Hangi 4'ü gittiği elin bileşimine göre dallandırılır — yani
   `?` sütununa yazılır, uydurulmaz.

Sonrasında oyun devam ettikçe belirsizlik yine kendiliğinden çözülür: Cuda 3 taşı bankaya
verdiyse, attığı kartların taş olmadığı ortaya çıkar ve `?` erir.

Aynı mekanizma ters yönde de çalışır — panelde bizden **fazla** kart varsa (kaçan bir
kazanç satırı) o kadar kart türü bilinmeden eklenir. Böylece Σ sütunu her zaman
oyunun kendi sayısına eşit kalır; hata sadece "hangi kart" tarafında birikir, "kaç kart"
tarafında değil.

**Yanlış düzeltmeye karşı:** panel ile log birbirine göre birkaç yüz ms gecikebiliyor.
Bu yüzden anlık farka bakılmaz; aynı sayılar üst üste 3 kez (~2,7 sn) görülmeli ve o
sırada yeni bir log satırı işlenmemiş olmalı. Fark bu kadar sürerken kapanmıyorsa
gerçekten bir şey kaçmış demektir.

## Kurulum

1. Bu depoyu indir.
2. Chrome / Edge / Brave'de `chrome://extensions` adresini aç.
3. Sağ üstten **Geliştirici modu**nu aç.
4. **Paketlenmemiş öğe yükle** deyip `extension/` klasörünü seç.
5. colonist.io'da bir oyuna gir — panel sağ üstte kendiliğinden açılır.

Firefox için `about:debugging` → "Bu Firefox" → "Geçici Eklenti Yükle" → `extension/manifest.json`.

## "Sen" kimsin?

Log, seninle ilgili satırları isimle değil ikinci tekil şahısla yazar:
`You stole from Cuda`, `Giule stole from you`. Bunları işleyebilmek için eklentinin
senin oyundaki adını bilmesi gerekir.

- **Oyun panelinden otomatik (en güvenilir):** kendi satırın `currentUser` sınıfı taşır.
- **Botlu oyunlarda otomatik:** mesajların avatar ikonu botu insandan ayırır
  (`icon_bot` vs `icon_player_loggedin`), bot olmayan tek oyuncu sensindir.
- **Birden fazla insan varsa:** panelde kendi adına tıkla. Seçim tarayıcıda saklanır.
  Çözülemeyen satır varsa panel `⚠ N "sen" satırı işlenemedi — kendi adına tıkla` der.

## Panel düğmeleri

| Düğme | İşlev |
|-------|-------|
| % | Olasılıklı görünüm: kesin sayı yerine beklenen değer + aralık |
| 🎲 | Zar istatistiği grafiğini aç/kapat |
| ⟲ | Sayacı sıfırla ve log'u baştan oku |
| ⧉ | Tanınmayan log satırlarını + ham log'u panoya kopyala |
| – | Paneli küçült |

Başlık çubuğundan sürükleyerek taşıyabilirsin; konum ve durum `localStorage`'da saklanır.

## Panel uyarıları ne demek

| Uyarı | Anlamı |
|-------|--------|
| `N sayı oyun panelinden düzeltildi` | Log'da bir şey kaçtı, fark panelden kapatıldı. Toplamlar doğru; o kartların türü `?` sütununda. |
| `N sayı oyun paneliyle uyuşmuyor` | Fark henüz taze; birkaç saniye içinde ya kendiliğinden kapanır ya da düzeltilir. |
| `N satır okunamadı` | Sanal kaydırıcı yüzünden satır kaçtı (aşağıya bak). |
| `N log satırı hesapla çelişti` | Bir hamle mevcut duruma göre imkânsızdı. Motor durumu bozmaz, son geçerli hâlini korur. |
| `N satır tanınmadı` | Metin kalıbı eşleşmedi — ⧉ ile döküm al. |
| `N "sen" satırı işlenemedi` | Kendi adın çözülemedi; panelde adına tıkla. |

## Oyunu baştan izlemek

Colonist'in log'u bir **sanal kaydırıcıdır** — o an ekranda görünen ~8 satır DOM'da durur,
yukarı kayanlar tamamen silinir. Yani eklenti log geçmişini geriye dönük okuyamaz.

- Eklentiyi **oyun başlamadan önce** açık tut (sekme açıkken masaya otur) — kart türlerini
  ancak böyle baştan sona takip edebilir.
- Oynarken log'u yukarı kaydırıp öyle bırakma; yeni satırlar DOM'a hiç girmez.
- Bir şey kaçarsa panel `⚠ N satır okunamadı` der. Satırlar `data-index` sırasıyla
  takip edildiği için kaçan satır sayısı kesin bilinir; sessizce yanlış sayı göstermez.

Oyunun ortasında açarsan çökmez: panel eşitlemesi sayesinde herkesin **toplam** kartı
hemen doğru olur, türleri `?` olarak başlar ve oyun ilerledikçe yavaş yavaş çözülür.

## Gerçek log'a nasıl bakılır

Panel "Oyun log'u bulunamadı" diyorsa ya da satırları tanımıyorsa, ham log'u görmek gerekir:

**Yol 1 — panelden:** ⧉ düğmesi. Tanınmayan satırları, o an görünen satırları ve
**arşivlenen nadir satırları** (kart atma, gelişim kartı, tekel, çalma) hem panoya
kopyalar hem konsola basar. Nadir satırlar geçerken kaydedildiği için 7'nin geldiği
anı yakalamak zorunda değilsin — oyun sonunda bir kez ⧉'ye basman yeter.

**Yol 2 — konsoldan (eklenti çalışmasa da olur):** oyundayken `F12` → **Console** sekmesi
(Sources değil), `tools/dump-log.js` dosyasının içeriğini yapıştır, Enter. Sonra `copy(__ctDump)`
yazıp Enter'a bas — döküm panoda olur.

## Colonist metinleri değişirse

Eklenti log satırlarını metin kalıplarıyla tanır. Colonist arayüz metinlerini değiştirirse
panelde `⚠ N satır tanınmadı` uyarısı çıkar. O durumda dökümü al ve
`extension/src/core/parser.js` içindeki `SNIPPETS` tablosuna yeni kalıbı ekle.

Log kutusu ise önce bilinen seçicilerle (`LOG_SELECTORS`), bulunamazsa **içeriğe bakılarak**
aranır: "rolled / got / placed a / gave ..." gibi satırları en çok barındıran en dar eleman
seçilir. Yani colonist id ve class isimlerini değiştirse bile panel çalışmaya devam eder.

Metin değişikliği artık sayımı bozmuyor: tanınmayan satır kart hareketi içeriyorsa fark
oyunun kendi panelinden kapanır, sadece o kartların türü belirsiz kalır. Yine de kalıbı
eklemek daha iyidir — tür bilgisi geri gelir.

## Proje yapısı

```
extension/
  manifest.json           MV3 tanımı
  styles/overlay.css      panel stilleri
  src/
    loader.js             content script -> modül yükleyici
    main.js               log -> parser -> motor -> panel akışı
    core/
      resources.js        kaynaklar, maliyetler, ikon eşlemeleri
      parser.js           log satırı -> olay  (saf fonksiyon)
      tracker.js          olasılıklı el takibi (saf fonksiyon)
      game.js             olay -> durum uygulaması, panel eşitleme, zar istatistiği
    dom/
      log-reader.js       colonist DOM'u -> parser girdisi
      player-panel.js     oyunun kendi oyuncu paneli -> doğrulama sayıları
    ui/overlay.js         canlı panel
test/                     node:test ile birim + uçtan uca testler
  fixtures/               canlı oyundan kopyalanmış gerçek HTML
  helpers/html.mjs        testler için minik HTML ayrıştırıcı
```

Çekirdek (`core/`) tamamen DOM'dan bağımsızdır, bu yüzden doğrudan Node ile test edilir:

```bash
npm test
```

## Notlar

- Eklenti yalnızca **oyundaki herkesin görebildiği** genel log'u okur; gizli bilgiye erişmez.
  Yaptığı şey, bir insanın kafasında tuttuğu kart saymanın otomatikleştirilmiş hâlidir.
- Colonist'in kullanım koşulları üçüncü taraf eklentileri sınırlayabilir; kendi sorumluluğunda kullan.
- Takip 2-6 oyuncuya kadar çalışır; oyuncular log'da göründükçe otomatik eklenir.
