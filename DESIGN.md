# Modlum Launcher — Tasarım ve hareket kuralları

Bu dosya arayüzü değiştiren herkes (kişi ya da yapay zeka) için kısa bir rehberdir.
Temel stiller `src/renderer/src/styles.css`, premium katman `src/renderer/src/premium.css`
içinde; renkler ve gölge/easing token'ları `styles.css` başındaki `:root` bloğunda.

## Görsel dil
- Premium ajans işi hissi: nötr yüzeyler, hairline çizgiler, tek canlı vurgu. Neon glow yok.
- Renkler: `--accent` (indigo-mor, ana vurgu), `--warm` (mandalina, ikincil), `--success` (yeşil, çalışıyor/açık).
- Yüzeyler: açık `#f5f5f7` (Soft Structuralism), koyu `#08080a` (Ethereal Glass).
- Kenarlar düz gri 1px değil, düşük opaklıkta `--hairline`. Gölge varsa geniş yayılımlı,
  düşük opaklıkta ambient olmalı (`--shadow-sm/md/lg`); sert koyu gölge ve `shadow-md` tarzı
  hazır gölgeler yasak.
- Başlıklar: `--font-display` = Fraunces (serif, sıkı harf aralığı). Gövde/UI: Plus Jakarta Sans.
  Inter, Roboto, Arial, Open Sans, Helvetica yasak. Etiketler cümle yazımı, BÜYÜK HARF yok.
- İkonlar: ince çizgili (`strokeWidth` ≤ 1.35). Lucide/FontAwesome/Material gibi kalın hazır set yok.
- Düzen: sıkı simetrik 3 sütun yok; asimetrik bento ve geniş boşluk tercih edilir.
- Kenardan kenara yapışık sticky navbar yok; uygulama kabuğu (titlebar + yan panel) kullanılır.
- Spotify panelinde albüm kapağı SMTC thumbnail'ından gelir; kapak yoksa yer tutucu ikon görünür.
- Minecraft dokusu yalnızca hero kartındaki statik blok ızgarasında; fazlası eklenmesin.
- Renk eklerken önce token ekle, sabit hex yazma. Açık ve koyu tema birlikte güncellenir.

## Hareket kuralları (donmayı önlemek için zorunlu)
1. Sadece `transform` ve `opacity` animasyonla. `width/height/top/left` animasyonu yok.
2. `filter: blur`, `backdrop-filter` ve `box-shadow` animasyonu yok.
3. `will-change` toplu verilmez; `transition: all` kullanılmaz, özellikler tek tek yazılır.
4. Süreler: hızlı 0.14s, normal 0.24s, yavaş 0.4s. Easing: `--ease-out`.
   `linear` ve `ease-in-out` geçiş yasak; yalnızca dönen spinner gibi zorunlu durumlarda `linear`.
5. Giriş animasyonu sayfa, sekme paneli, modal ve toast için var; listelerde ilk 8 öğe sırayla girer.
6. `prefers-reduced-motion` ve `.app.perf` (performans modu) her yeni animasyonu kapatabilmeli.
7. Sık güncellenen veri (log, indirme ilerlemesi) arayüze toplu aktarılır; her olayda state güncellenmez.
8. Uzun listelerde `content-visibility: auto` kullan.
