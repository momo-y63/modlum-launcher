[![Build](https://github.com/momo-y63/modlum-launcher/actions/workflows/build.yml/badge.svg)](https://github.com/momo-y63/modlum-launcher/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/momo-y63/modlum-launcher?display_name=tag)](https://github.com/momo-y63/modlum-launcher/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-0e7c8c.svg)](LICENSE)

# Modlum Launcher

Windows için modern bir **Minecraft: Java Edition** başlatıcısı. Electron + React + TypeScript ile
yazıldı; sürüm ve loader kurulumunu, Java'yı ve hesapları kullanıcının yerine halleder.

![Ana ekran (koyu tema)](docs/screenshots/home-dark.png)

## Özellikler

- **Instance mimarisi** — her instance kendi Minecraft sürümünü, mod loader'ını, modlarını, dünyalarını
  ve ekran görüntülerini taşır. Sürüm/kütüphane/asset dosyaları ise tüm instance'lar arasında **tek kopya**
  olarak paylaşılır; aynı sürüm ikinci kez indirilmez.
- **Mod loader desteği** — Vanilla, Fabric, Quilt, Forge ve NeoForge ile instance oluşturma.
  (Fabric uçtan uca test edildi; diğerleri deneysel.)
- **Microsoft ve çevrimdışı hesap** — Microsoft için cihaz kodu (device code) akışı; istemci sırrı
  gerekmez. Çevrimdışı profiller tek oyunculu/çevrimdışı sunucular içindir.
- **Otomatik Java** — sürümün istediği Java yoksa Adoptium Temurin JRE otomatik indirilip kurulur.
- **Açık / koyu tema** — ilk açılışta Momo sorar; Ayarlar'dan değiştirilebilir.
- **Anime rehber Momo** — 6 adımlı kurulum turu ve sahne ışıklı arayüz turu (8 bölüm).
- **Performans modu** — animasyonları, bulanıklığı ve saydamlık efektlerini kapatır.
- **İçerik yönetimi** — modları aç/kapat, sil; resource pack, shader, datapack ve dünya klasörlerine erişim.
- **Mojang haber akışı**, oyun süresi takibi, gerçek oyuncu avatarları ve RAM hazır ayarları.
- **Türkçe arayüz**, açık kaynak ve MIT lisanslı.

| Kurulum turu | Bilgi / lisanslar |
|---|---|
| ![Kurulum](docs/screenshots/setup.png) | ![Bilgi](docs/screenshots/info.png) |

## Gereksinimler

- **Windows 10/11 (x64)**
- Geliştirme için **Node.js ≥ 20** ve **pnpm**
- Oyun için **Java**: Modern sürümler Java 21+ ister. Launcher eksik sürümü otomatik indirir.

## Kurulum (kullanıcı)

[Releases](https://github.com/momo-y63/modlum-launcher/releases) sayfasından `ModlumLauncher-*-Setup.exe` dosyasını indirip çalıştır.
Kurulum yönetici izni gerektirmez (per-user NSIS).

## Geliştirme

```bash
pnpm install
pnpm dev        # electron-vite dev (HMR)
pnpm build      # üretim derlemesi -> out/
pnpm typecheck  # tsc --noEmit
pnpm dist       # Windows kurulum paketi -> dist/
```

> Electron ikilisi indirilmediyse: `node node_modules/electron/install.js`

## Paketleme

```bash
pnpm dist
```

Çıktı: `dist/ModlumLauncher-<sürüm>-Setup.exe` (NSIS, x64).

## Veri yerleşimi

| Ne | Nerede |
|---|---|
| Ayarlar | `%APPDATA%\modlum-launcher\settings.json` |
| Ortak sürümler / kütüphaneler / asset'ler | `%APPDATA%\.modlum\` |
| Instance'lar | `%APPDATA%\modlum-launcher\instances\<id>\` |
| Java runtime (otomatik) | `%APPDATA%\modlum-launcher\runtime\` |

Her instance klasörü: `mods/`, `saves/`, `screenshots/`, `resourcepacks/`, `shaderpacks/`, `datapacks/`.
Ortak veri klasörü Ayarlar'dan değiştirilebilir.

## Proje yapısı

```
src/
  main/        Electron ana süreç
    ipc.ts         IPC köprüsü, instance yönetimi, oyun başlatma
    install.ts     Sürüm/kütüphane/asset indirme
    loaders.ts     Fabric, Quilt, Forge, NeoForge kurulumu
    merge.ts       inheritsFrom birleştirme
    launch.ts      Classpath ve JVM/game argümanları
    auth/          Microsoft cihaz kodu akışı
  preload/     contextBridge API
  renderer/    React arayüzü (sayfalar, bileşenler, stiller)
  shared/      Ortak TypeScript tipleri
```

## Loader desteği

| Loader | Durum |
|---|---|
| Vanilla | ✅ |
| Fabric | ✅ test edildi |
| Quilt | 🧪 deneysel |
| Forge | 🧪 deneysel |
| NeoForge | 🧪 deneysel |

Forge/NeoForge resmî installer ile kurulur; büyük sürümlerde uzun sürebilir. Sorun yaşarsan
Konsol sekmesindeki çıktıyla issue açabilirsin.

## Yasal / lisanslar

- **Kod:** MIT — bkz. [LICENSE](LICENSE)
- **Yazı tipleri:** Fraunces ve Plus Jakarta Sans, SIL Open Font License 1.1. Tam metin uygulama
  içinde **Bilgi → Lisanslar** bölümünde yer alır.
- **Momo karakter görseli:** Openclipart, **CC0 1.0** (kamu malı).
- **Minecraft:** "Minecraft" Mojang Studios'un tescilli markasıdır. Bu proje Mojang veya Microsoft
  ile bağlantılı değildir. Oyun dosyaları yalnızca resmî Mojang sunucularından indirilir.

## Yol haritası

- Forge / NeoForge / Quilt kurulumlarının uçtan uca testleri
- Modrinth / CurseForge üzerinden tek tıkla mod kurma
- Çoklu dil desteği
- Otomatik güncelleme

Katkılar açıktır; issue ve pull request'ler memnuniyetle karşılanır.
