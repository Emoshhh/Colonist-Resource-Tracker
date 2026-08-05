/**
 * MV3 content script'leri ES modülü olarak yüklenemiyor.
 * Bu küçük yükleyici gerçek modülü dinamik import ile devreye alır;
 * böylece kaynak dosyalar normal modül olarak kalır (Node testleri de import edebilir).
 */
(async () => {
  try {
    await import(chrome.runtime.getURL('src/main.js'));
  } catch (err) {
    console.error('[colonist-tracker] yüklenemedi', err);
  }
})();
