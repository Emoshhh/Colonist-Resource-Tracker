@echo off
rem ============================================================
rem  Uzantiyi guncelle: GitHub'daki son hali indir.
rem
rem  Chrome'daki "paketlenmemis" uzanti dosyalari diskten okur,
rem  bu yuzden klasoru tazelemek yeterli. Uzanti kendi kendini
rem  yeniden yukler (bkz. extension/src/background.js); istersen
rem  chrome://extensions sayfasindaki yenile dugmesine basabilirsin.
rem
rem  DIKKAT: bu klasorde elle degisiklik yapma, reset --hard siler.
rem ============================================================
setlocal
set BRANCH=claude/colonist-opponent-resource-tracker-sgde1g
set DEST=%LOCALAPPDATA%\colonist-tracker

if not exist "%DEST%\.git" (
  echo [HATA] Kurulum bulunamadi: %DEST%
  echo Once kur.cmd dosyasini cift tikla.
  if "%1"=="" pause
  exit /b 1
)

for /f %%v in ('git -C "%DEST%" rev-parse --short HEAD') do set ONCE=%%v
git -C "%DEST%" fetch origin %BRANCH% || goto :hata
git -C "%DEST%" reset --hard origin/%BRANCH% || goto :hata
for /f %%v in ('git -C "%DEST%" rev-parse --short HEAD') do set SONRA=%%v

if "%ONCE%"=="%SONRA%" (
  echo Yeni surum yok. ^(%SONRA%^)
) else (
  echo Guncellendi: %ONCE% -^> %SONRA%
  git -C "%DEST%" log --oneline -5
)

rem Zamanlanmis gorevden calisirken (parametreyle) bekleme.
if "%1"=="" pause
exit /b 0

:hata
echo [HATA] Guncelleme basarisiz.
if "%1"=="" pause
exit /b 1
