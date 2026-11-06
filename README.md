# Colonist Kaynak Takibi

[colonist.io](https://colonist.io) oyununda **rakiplerin elindeki kaynakları canlı takip eden** bir tarayıcı eklentisi.
Oyun ekranındaki genel log'u okur, zar dağıtımlarını ve hamleleri işleyerek her oyuncunun elini hesaplar
ve ekranın köşesinde sürüklenebilir bir panelde gösterir. Sayımı oyunun kendi oyuncu paneliyle
sürekli karşılaştırır, böylece kaçan bir log satırı sessizce yanlış sayıya dönüşmez.

```
┌──────────────────────────────────────────────┐
│ ● Kaynak Takibi      🎲 ⤢ ⟲ ⧉ ≡ –            │
├──────────────────────────────────────────────┤
│         🌲 🧱 🐑 🌾 ⛏  ? │ 🛣 🏠 🏛        │
│ Ali      1  0  2  1  0  0 │ 13  3  4        │  ← eli tamamen biliniyor
│ Veli     0  1  1  0  1  2 │  0  2  3        │  ← 2 kartın türü bilinmiyor
│               ‾        ‾  │  ↑               │     yolu bitmiş: artık yol yapamaz
├──────────────────────────────────────────────┤
│  3  6  9 13 17 21 16 12  8  5  3             │  ← kaç kez geldiği
│  ▁  ▂  ▃  ▄  ▆  █  ▆  ▄  ▃  ▂  ▁   113 zar   │
│  2  3  4  5  6  7  8  9 10 11 12             │
│          2  3  4  5  6  7  8  9 10 11 12  Σ  │
│ Ali      2  1  5  5  7  7  3  4  5  3  1  43 │  ← kim hangi zarı attı
│ Veli     1  2  5  6  4  8  5  6  3  2  1  43 │
└──────────────────────────────────────────────┘
```

Kaynak sütunlarında **kesin olarak bildiğimiz** sayı yazar — "en az bu kadar var".
Çalma yüzünden türü belirsiz kalan kartlar tahmine dağıtılmaz, `?` sütununda toplanır.
Rakip harcama yaptıkça `?` kendiliğinden erir ve kartlar gerçek sütunlarına geçer.

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

Toplam kart sayısı her zaman kesindir — çalma toplamı değiştirmez, sadece yerini değiştirir.
Panelde ayrı sütun olarak gösterilmiyor; oyuncunun adının üstüne gelince toplam kart ve
gelişim kartı sayısı görünür. Oyunun kendi paneliyle karşılaştırma yine yapılıyor, tutmazsa
üstte `⚠ N sayı oyun paneliyle uyuşmuyor` yazar.

## Kalan yapı taşları

Son üç sütun her oyuncunun elinde **kaç yol, köy ve şehir taşı kaldığını** gösterir
(başlangıç: 15 yol, 5 köy, 4 şehir). Başlıklarda oyunun kendi
yol/köy/şehir simgeleri kullanılır — adresleri log'daki inşa satırlarından toplanır,
görsel hiç gelmezse Y/K/Ş harf rozetine düşülür. Kaynak sayımından bağımsız, sadece inşa
satırları sayılarak tutulur.

- **2 ve altı sarı, 0 kırmızı** yazılır: 0 yol demek, kaynağı olsa bile artık yol
  yapamaz — en uzun yol yarışında bu belirleyici olabilir.
- **Şehir kurmak köy taşını geri verir.** Şehir var olan bir köyün üstüne kurulduğu
  için köy taşı oyuncuya döner; sütun bunu doğru işler.
- Kurulumdaki ve yol yapımı kartıyla kurulan yollar bedavadır ama **taşı yine harcar**.

Bu sayı oyunun kendi panelinde yazmadığı için çapraz doğrulaması yok: bir inşa satırı
kaçarsa taş sayısı olduğundan yüksek kalır (⟲ ile sıfırlanır).

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

### Kolay yol: tek seferlik kurulum, sonrası otomatik

Her güncellemede zip indirip klasör seçmek gerekmiyor. Bir kez kuruyorsun,
sonrasında eklenti kendini güncelliyor.

**Windows:**

1. `kurulum/kur.cmd` dosyasını çift tıkla. Depoyu
   `%LOCALAPPDATA%\colonist-tracker` klasörüne indirir.
   (Git yoksa önce `winget install --id Git.Git -e`.)
2. `chrome://extensions` → **Geliştirici modu** → **Paketlenmemiş öğe yükle**
   → betiğin yazdığı `...\colonist-tracker\extension` klasörünü seç. **Bu adım
   bir daha gerekmez**: Chrome artık o klasörü okuyor, klasör güncellendiğinde
   uzantı da güncellenmiş olur.
3. `kurulum/otomatik-guncelle.cmd` dosyasını çift tıkla. Saatte bir çalışan bir
   Görev Zamanlayıcı görevi ekler; o `git pull` yapar, uzantı da yeni sürümü
   görünce kendini yeniden yükler.

Elle güncellemek istersen: `kurulum/guncelle.cmd`.

**macOS / Linux:** `bash kurulum/kur.sh` — aynı işi yapar, otomatik güncelleme
için betiğin sonunda yazdığı `crontab` satırını ekle.

### Güncelleme nasıl kendiliğinden oluyor

Paketlenmemiş uzantıyı Chrome kendisi güncellemez (mağaza yok, dosyalar diskte).
İki parça birleşince otomatik oluyor:

1. Zamanlanmış görev klasörü `git pull` ile tazeler.
2. Uzantının servis işçisi 3 saatte bir GitHub'daki `manifest.json` sürümüne
   bakar; diskteki sürümden farklıysa `chrome.runtime.reload()` çağırır —
   bu da dosyaları **diskten** yeniden okur.

Aynı sürüm için bir kez denenir, yani `git pull` henüz çalışmamışsa sonsuz
yeniden yükleme döngüsü olmaz.

### Elle kurulum (betik istemiyorsan)

1. Bu depoyu indir.
2. Chrome / Edge / Brave'de `chrome://extensions` adresini aç.
3. Sağ üstten **Geliştirici modu**nu aç.
4. **Paketlenmemiş öğe yükle** deyip `extension/` klasörünü seç.
5. colonist.io'da bir oyuna gir — panel sağ üstte kendiliğinden açılır.

Her güncellemede klasörü yeniden indirip `chrome://extensions` sayfasındaki
yenileme düğmesine basman gerekir.

Firefox için `about:debugging` → "Bu Firefox" → "Geçici Eklenti Yükle" →
`extension/manifest.json`. (Firefox'ta servis işçisi/alarm davranışı farklı,
otomatik güncelleme çalışmaz.)

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
| 🎲 | Zar istatistiğini aç/kapat: genel dağılım grafiği + kim hangi zarı attı tablosu |
| ⤢ | Panel boyutu: küçük → normal → büyük (seçim saklanır) |
| ⟲ | Sayacı sıfırla ve log'u baştan oku |
| ⧉ | Tanınmayan log satırlarını + ham log'u panoya kopyala |
| ≡ | **Tüm maç kaydını al:** log'u baştan sona kaydırıp her satırı dosyaya yazar ve panoya kopyalar |
| – | Paneli küçült |

Başlık çubuğundan sürükleyerek taşıyabilirsin; konum ve durum `localStorage`'da saklanır.

## Kim hangi zarı attı

Grafiğin altındaki tablo her oyuncunun attığı zarları ayrı ayrı sayar; 7 sütunu
ayrı renkte, sağda oyuncunun toplam atış sayısı.

Bu kırılım **oyunun hiçbir yerinde yok** — colonist'in oyun sonu istatistik
ekranındaki "Dice Rolls" bile yalnız toplam dağılımı gösterir. Log satırı zarı
atanı yazdığı için eklenti tutabiliyor; tutulmazsa geriye dönük çıkarmanın yolu
yok (log satırları sanal kaydırıcıdan silinir ve arşive yalnız nadir satırlar girer).

## Maç kayıtları

Maç bittiğinde (`... won the game!` satırı) eklenti **log'un tamamını** kendiliğinden
bir dosyaya yazar. `≡` düğmesiyle istediğin an elle de alabilirsin; o zaman dosyaya
yazmanın yanında panoya da kopyalanır.

Kayıt yeri: **İndirilenler/colonist-logs/** — ör.
`2026-11-05_2134_Emosh-vs-Skuashy.txt`. MV3 uzantısı rastgele bir klasöre yazamaz;
yazabildiği tek yer indirilenler ve onun alt klasörleri. Klasörü başka yere taşımak
istersen Chrome'un indirme konumunu değiştir.

Dosyanın başında özet (oyuncular, satır sayısı, zar sayısı) ve **kim hangi zarı
attı tablosu** var; altında satır satır log:

```
# colonist maç kaydı — 5.11.2026 21:34:07
# oyuncular: Emosh, Skuashy
# ben: Emosh
# satır: 412
# zar: 76

--- zar dağılımı (kim ne attı) ---
oyuncu            2  3  4  5  6  7  8  9 10 11 12  top.
Emosh             1  2  4  5  6  5  4  5  3  2  1    38
Skuashy           2  1  3  6  5  6  5  4  3  2  1    38
TOPLAM            3  3  7 11 11 11  9  9  6  4  2    76

--- log ---
[   0] Emosh placed a [Köy]
[   1] Emosh placed a [Yol]
...
[  34] Skuashy rolled [zar 4] [zar 3]
[  35] Emosh got [Odun] [Buğday]
```

Kaynak/yapı/zar resimleri köşeli paranteze çevrilir — colonist bunları metin olarak
yazmıyor, yalnız resim koyuyor. Zarın kaydedilmesi "kim ne attı" istatistiğinin tek
şartı, o yüzden sonradan da ayıklanabilsin diye satırda duruyor.

**Nasıl topluyor:** log sanal kaydırıcı, aynı anda ~9 satır DOM'da duruyor. Bu yüzden
kayıt alınırken kutu baştan sona kaydırılır ve her satır `data-index`'iyle toplanır;
sonra kaydırma eski yerine döner. Tarama sırasında sayım dondurulur (okunan eski
satırlar ikinci kez işlenmesin). Kaydırıcının çok eski satırları tamamen sildiği
durumda başlıkta `log'da N satırlık boşluk` yazar.

### Kayıtlardan istatistik çıkarmak

```bash
node tools/analiz.mjs ~/Downloads/colonist-logs          # klasörün tamamı
node tools/analiz.mjs kayit.txt                          # tek maç
```

Her maç için şunları yazar:

| Bölüm | Ne gösterir |
|-------|-------------|
| **Zar** | Kim hangi sayıyı kaç kez attı + adil zarda kaç gelmeliydi + sapma (ki-kare) |
| **Kaynak üretimi** | Her oyuncunun zardan aldığı kart, kaynak kaynak, zar başına ortalama |
| **Haydut ve çalma** | Kim kaç kez haydut oynadı, kimden kaç kart çaldı, kaç kez üretimi engellendi, 7'de kaç kart attı |
| **Hırsız yüzünden alınamayan kaynaklar** | Kaynak kaynak: engellenen üretim + çalınan kart (aşağıya bak) |
| **Takaslar** | Kaç takas, hangi oranla (4:1 banka mı 2:1 liman mı — hangi limanın olduğu buradan çıkar) |
| **İnşa / gelişim kartı** | Yol-köy-şehir sayısı, alınan ve kullanılan gelişim kartları |
| **Zaman çizelgesi** | Kaçıncı zarda ne kuruldu (açılış hızı karşılaştırması) |

Birden fazla maç verirsen sonda kariyer özeti de gelir: maç sayısı, galibiyet
yüzdesi, toplam zar dağılımı ve beklenenden sapma.

#### "Hırsız yüzünden hangi kaynağı alamadım"

İki ayrı kalem toplanır:

- **Çalınan kart** — log'da zaten açıkça yazıyor (`stole [Maden] from you`).
- **Engellenen üretim** — log `X is blocked by the Robber. No resources produced`
  derken **kimin** engellendiğini yazmaz, yalnız arazinin resmini koyar. Kayıtta
  bu artık `[arazi Maden]` olarak duruyor, yani yeni maçlarda kaynak kesin.
  Eski kayıtlarda `[?]` olduğu için sayı **çıkarımla** bulunur: aynı sayı
  engelsiz geldiğinde o oyuncu ne alıyorsa, engelli gelişte onu alamamıştır.

Çıkarım, engellenen atıştan **önceki** en son örneğe bakar. Üretim oyun boyunca
yalnız arttığı için (köy → şehir, yeni köyler) bu bir **alt sınırdır**: "en az
bu kadarını alamadı". Sonraki bir örneğe bakmak, arada o araziye şehir dikilmiş
olabileceği için kaybı olduğundan büyük gösterirdi. O sayıdan hiç engelsiz
örnek yoksa uydurulmaz, `N atış hesaplanamadı` diye yazılır.

## Panel uyarıları ne demek

| Uyarı | Anlamı |
|-------|--------|
| `N sayı oyun panelinden düzeltildi` | Log'da bir şey kaçtı, fark panelden kapatıldı. Toplamlar doğru; o kartların türü `?` sütununda. |
| `N sayı oyun paneliyle uyuşmuyor` | Fark henüz taze; birkaç saniye içinde ya kendiliğinden kapanır ya da düzeltilir. |
| `N satır okunamadı` | Sanal kaydırıcı yüzünden satır kaçtı (aşağıya bak). |
| `N log satırı hesapla çelişti` | Bir hamle mevcut duruma göre imkânsızdı. Motor durumu bozmaz, son geçerli hâlini korur ve sayıları hemen panelden eşitler. |
| `olasılık ağacı kırpıldı` | Çok fazla belirsiz çalma birikti, olasılık ağacı sınıra dayandı. Toplamlar hâlâ doğru ama kaynak alt/üst sınırları artık garanti değil. ⟲ ile temizlenir. |
| `N satır tanınmadı` | Metin kalıbı eşleşmedi — ⧉ ile döküm al. |
| `N "sen" satırı işlenemedi` | Kendi adın çözülemedi; panelde adına tıkla. |

## Oyunu baştan izlemek

Colonist'in log'u bir **sanal kaydırıcıdır** — o an ekranda görünen ~8 satır DOM'da durur,
yukarı kayanlar tamamen silinir. Yani eklenti log geçmişini geriye dönük okuyamaz.

- Eklentiyi **oyun başlamadan önce** açık tut (sekme açıkken masaya otur) — kart türlerini
  ancak böyle baştan sona takip edebilir.
- Log'u yukarı kaydırıp geçmişe bakabilirsin, sayım bozulmaz: watcher kaydırma
  konumuna bakıp bunu "yeni oyun" sanmaz ve zaten okunmuş satırları tekrar işlemez.
  Ama **yukarıda bırakırsan** o sırada gelen yeni satırlar DOM'a hiç girmez ve kaçar
  (panel eşitlemesi toplamları yine de düzeltir).
- **Başka sekmeye geçebilirsin.** Tarayıcı arka plandaki sekmede zamanlayıcıları
  dakikada bire kadar kısıyor, bu yüzden eklenti `visibilitychange`/`focus` olaylarını
  da dinler: sekmeye döndüğün anda log'u bekletmeden okur. Uzun süre uzakta kalırsan
  colonist'in sanal kaydırıcısı aradaki satırları DOM'dan tamamen silmiş olabilir —
  o satırlar geri gelmez, ama kaç tane olduğu `data-index`'ten kesin bilinir ve
  **toplamlar oyunun kendi panelinden anında düzeltilir** (bekleme yok). Sadece o
  kartların türü `?` sütununa düşer.
- Bir şey kaçarsa panel `⚠ N satır okunamadı` der. Satırlar `data-index` sırasıyla
  takip edildiği için kaçan satır sayısı kesin bilinir; sessizce yanlış sayı göstermez.

Oyunun ortasında açarsan çökmez: panel eşitlemesi sayesinde herkesin **toplam** kartı
hemen doğru olur, türleri `?` olarak başlar ve oyun ilerledikçe yavaş yavaş çözülür.

## Gerçek log'a nasıl bakılır

Panel "Oyun log'u bulunamadı" diyorsa ya da satırları tanımıyorsa, ham log'u görmek gerekir:

**Yol 1 — panelden:** ⧉ düğmesi. Şunları hem panoya kopyalar hem konsola basar:

1. **Durum özeti** — kendi adın hangi yoldan bulundu, sayaçlar (okunamayan satır,
   çelişki, panel düzeltmesi), oyun panelindeki sayılar ile hesabın yan yana (`✓` / `✗`),
   ve her oyuncunun hesaplanan eli.
2. Tanınmayan satırlar.
3. O an görünen ham satırlar.
4. **Arşivlenen nadir satırlar** (kart atma, gelişim kartı, tekel, çalma) — geçerken
   kaydedildikleri için 7'nin geldiği anı yakalamak zorunda değilsin; oyun sonunda
   bir kez ⧉'ye basman yeter.

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
    background.js         servis işçisi: maç kaydını diske yaz + kendini güncelle
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
tools/
  analiz.mjs              maç kayıtlarından istatistik çıkarır
  check-extension.mjs     manifest / sözdizimi / import yolu denetimi
  dump-log.js             eklentisiz çalışan konsol döküm betiği
kurulum/                  tek seferlik kurulum + otomatik güncelleme betikleri
.github/workflows/        her push'ta test + denetim
```

Çekirdek (`core/`) tamamen DOM'dan bağımsızdır, bu yüzden doğrudan Node ile test edilir.
Bağımlılık yok; `node:test` yeterli.

```bash
npm test     # 115 test: çekirdek mantık + gerçek log satırları
npm run check   # eklenti bütünlüğü (aşağıya bak)
```

`npm run check`, testlerin ulaşamadığı yeri kapatır: `main.js` ve `ui/overlay.js`
DOM'a bağlı olduğu için hiçbir test onları yüklemiyor, dolayısıyla oradaki bir
yazım hatası ya da yanlış import yolu ancak tarayıcıda açınca fark edilirdi.
Denetim üç şeye bakar:

1. `manifest.json` geçerli mi, andığı dosyalar gerçekten var mı
2. her `.js` sözdizimsel olarak geçerli mi (modül olarak ayrıştırılır)
3. her göreli `import` gerçek bir dosyaya çıkıyor mu

İkisi de her push'ta GitHub Actions üzerinde koşar (`.github/workflows/test.yml`,
Node 20 ve 22).

## Notlar

- Eklenti yalnızca **oyundaki herkesin görebildiği** genel log'u okur; gizli bilgiye erişmez.
  Yaptığı şey, bir insanın kafasında tuttuğu kart saymanın otomatikleştirilmiş hâlidir.
- Colonist'in kullanım koşulları üçüncü taraf eklentileri sınırlayabilir; kendi sorumluluğunda kullan.
- Takip 2-6 oyuncuya kadar çalışır; oyuncular log'da göründükçe otomatik eklenir.
