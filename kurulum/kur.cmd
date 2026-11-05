@echo off
rem ============================================================
rem  Colonist Kaynak Takibi - Windows kurulumu (TEK SEFER)
rem
rem  Ne yapar:
rem    1. Depoyu %LOCALAPPDATA%\colonist-tracker klasorune indirir
rem    2. Chrome'a yuklemen gereken klasorun yolunu yazar
rem
rem  Bir daha indirmeye gerek yok: guncelle.cmd ayni klasoru
rem  tazeler, Chrome'daki uzanti ayni yerden okur.
rem ============================================================
setlocal
set REPO=https://github.com/Emoshhh/Colonist-Resource-Tracker
set BRANCH=claude/colonist-opponent-resource-tracker-sgde1g
set DEST=%LOCALAPPDATA%\colonist-tracker

where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo [HATA] Git kurulu degil. Once sunu calistir:
  echo        winget install --id Git.Git -e
  echo.
  echo Sonra bu dosyayi tekrar cift tikla.
  pause
  exit /b 1
)

if exist "%DEST%\.git" (
  echo Klasor zaten var, guncelleniyor: %DEST%
  git -C "%DEST%" fetch origin %BRANCH% || goto :hata
  git -C "%DEST%" reset --hard origin/%BRANCH% || goto :hata
) else (
  echo Indiriliyor: %DEST%
  git clone --branch %BRANCH% --single-branch --depth 50 "%REPO%" "%DEST%" || goto :hata
)

echo.
echo ============================================================
echo  Hazir. Simdi Chrome'da SADECE BIR KEZ:
echo.
echo   1. chrome://extensions adresini ac
echo   2. Sag ustten "Gelistirici modu"nu ac
echo   3. "Paketlenmemis ogeyi yukle" (Load unpacked) tikla
echo   4. Su klasoru sec:
echo.
echo        %DEST%\extension
echo.
echo  Bundan sonra guncelleme icin:
echo    - kurulum\guncelle.cmd  (elle, cift tiklayarak)
echo    - kurulum\otomatik-guncelle.cmd  (saatte bir kendisi)
echo ============================================================
echo.
pause
exit /b 0

:hata
echo.
echo [HATA] Git islemi basarisiz. Internet baglantisini kontrol et.
pause
exit /b 1
