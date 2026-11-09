# Modlum Launcher — Tasarım ve hareket kuralları

Bu dosya arayüzü değiştiren herkes (kişi ya da yapay zeka) için kısa bir rehberdir.
Tüm stiller `src/renderer/src/styles.css` içinde; renkler dosyanın başındaki token'larda.

## Görsel dil
- Apple / Vercel tarzı: nötr yüzeyler, ince çizgiler, tek canlı vurgu. Parlama (neon glow) yok.
- Renkler: `--accent` (indigo-mor, ana vurgu), `--warm` (mandalina, ikincil), `--success` (yeşil, çalışıyor/açık).
- Yüzeyler: açık `#f5f5f7`, koyu `#08080a`. Kartlar ince çerçeveli, gölgesiz.
- Başlıklar sıkı, kalın sans (Plus Jakarta Sans). Etiketler cümle yazımı, BÜYÜK HARF yok.
- Minecraft dokusu yalnızca hero kartındaki statik blok ızgarasında; fazlası eklenmesin.
- Renk eklerken önce token ekle, sabit hex yazma. Açık ve koyu tema birlikte güncellenir.

## Hareket kuralları (donmayı önlemek için zorunlu)
1. Sadece `transform` ve `opacity` animasyonla. `width/height/top/left` animasyonu yok.
2. `filter: blur`, `backdrop-filter` ve `box-shadow` animasyonu yok.
3. `will-change` toplu verilmez; `transition: all` kullanılmaz, özellikler tek tek yazılır.
4. Süreler: hızlı 0.14s, normal 0.24s, yavaş 0.4s. Easing: `--ease-out`.
5. Giriş animasyonu sayfa, sekme paneli, modal ve toast için var; listelerde ilk 8 öğe sırayla girer.
6. `prefers-reduced-motion` ve `.app.perf` (performans modu) her yeni animasyonu kapatabilmeli.
7. Sık güncellenen veri (log, indirme ilerlemesi) arayüze toplu aktarılır; her olayda state güncellenmez.
8. Uzun listelerde `content-visibility: auto` kullan.
