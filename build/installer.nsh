; Modlum Launcher — özel NSIS akışı
; electron-builder bu dosyayı otomatik olarak include eder.

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Modlum Launcher'a hoş geldin"
  !define MUI_WELCOMEPAGE_TEXT "Minecraft: Java Edition için modern bir başlatıcı.$\r$\n$\r$\nKurulum yalnızca birkaç saniye sürer; ardından Momo sana hesabını ve ilk instance'ını oluşturmana yardım eder.$\r$\n$\r$\nDevam etmek için İleri'ye tıkla."
  !insertmacro MUI_PAGE_WELCOME
!macroend
