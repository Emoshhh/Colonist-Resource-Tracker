# Colonist Kaynak Takibi

[colonist.io](https://colonist.io) oyununda **rakiplerin elindeki kaynakları canlı takip eden** bir tarayıcı eklentisi.
Oyun ekranındaki genel oyun log'unu okur, zar dağıtımlarını ve hamleleri işleyerek her oyuncunun elini hesaplar
ve ekranın köşesinde sürüklenebilir bir panelde gösterir.

```
┌──────────────────────────────┐
│ ● Kaynak Takibi   🎲 ⟲ ⧉ –   │
├──────────────────────────────┤
│         O  T  K  B  M  Σ  GK │
│ Ali     1  0  2  1  0  4   1 │   ← kesin bilinen
│ Veli    0  1  0.7 0  1.3 3  0│   ← çalınan karttan gelen belirsizlik
│         ^ 0-1     ^ 1-2      │
├──────────────────────────────┤
│ ▁▃█▅▂▁▃▁▂▁▁  2..12 · 41 zar  │
└──────────────────────────────┘
```

## Nasıl çalışır

Colonist'in oyun log'u, **rastgele hırsızlık (haydut/şövalye) dışında** her şeyi açıkça yazar:
kim ne aldı, ne inşa etti, ne takas etti, ne attı. Yani belirsizliğin tek kaynağı çalınan kartlardır.

Bu yüzden takip motoru tek bir tahmin tutmaz, **olası tüm dağılımları paralel tutar**:

1. Belirsiz bir çalma olduğunda durum, kurbanın elindeki her kart için dallanır
   (ağırlık = o kartın çekilme olasılığı).
2. Sonraki her hamle imkânsız dalları eler. Örneğin rakip bir yol inşa ettiyse,
   elinde odun+tuğla olmayan dallar düşer.
3. Böylece belirsizlik zamanla kendiliğinden çözülür ve panel yine kesin sayılara döner.

Panelde kesin bilinen değerler düz sayı, belirsiz olanlar **beklenen değer + alt-üst sınır**
(`0-1` gibi) olarak sarı zeminde gösterilir. Hücrenin üstüne gelince
"en az 1 tane bulundurma olasılığı" da görünür.

Toplam kart sayısı (Σ) her zaman kesindir — çalma toplamı değiştirmez, sadece yerini değiştirir.

## Kurulum

1. Bu depoyu indir.
2. Chrome / Edge / Brave'de `chrome://extensions` adresini aç.
3. Sağ üstten **Geliştirici modu**nu aç.
4. **Paketlenmemiş öğe yükle** deyip `extension/` klasörünü seç.
5. colonist.io'da bir oyuna gir — panel sağ üstte kendiliğinden açılır.

Firefox için `about:debugging` → "Bu Firefox" → "Geçici Eklenti Yükle" → `extension/manifest.json`.

## Panel düğmeleri

| Düğme | İşlev |
|-------|-------|
| 🎲 | Zar istatistiği grafiğini aç/kapat |
| ⟲ | Sayacı sıfırla ve log'u baştan oku |
| ⧉ | Tanınmayan log satırlarını + ham log'u panoya kopyala |
| – | Paneli küçült |

Başlık çubuğundan sürükleyerek taşıyabilirsin; konum ve durum `localStorage`'da saklanır.

## Colonist metinleri değişirse

Eklenti log satırlarını metin kalıplarıyla tanır. Colonist arayüz metinlerini değiştirirse
panelde `⚠ N satır tanınmadı` uyarısı çıkar. O durumda:

1. ⧉ düğmesiyle dökümü kopyala.
2. `extension/src/core/parser.js` içindeki `SNIPPETS` tablosuna yeni kalıbı ekle.

Tüm ayrıştırma kuralları tek yerde toplanmıştır; DOM seçicileri de
`extension/src/dom/log-reader.js` içindeki `LOG_SELECTORS` listesindedir.

`⚠ N log satırı hesapla çelişti` uyarısı ise bir hamlenin mevcut duruma göre imkânsız olduğunu
söyler (genelde tanınmayan bir satır yüzünden). Bu durumda motor durumu bozmaz, son geçerli
hâlini korur; ⟲ ile baştan okutabilirsin.

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
      game.js             olay -> durum uygulaması, zar istatistiği
    dom/log-reader.js     colonist DOM'u -> parser girdisi
    ui/overlay.js         canlı panel
test/                     node:test ile birim + uçtan uca testler
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
