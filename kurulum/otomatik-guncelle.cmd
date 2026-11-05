@echo off
rem ============================================================
rem  Otomatik guncelleme: Windows Gorev Zamanlayici'ya saatte bir
rem  calisan bir gorev ekler. Bir kez cift tiklaman yeterli.
rem
rem  Kaldirmak icin:
rem    schtasks /delete /tn "ColonistTracker Guncelle" /f
rem ============================================================
setlocal
set DEST=%LOCALAPPDATA%\colonist-tracker
set SCRIPT=%DEST%\kurulum\guncelle.cmd
set TASK=ColonistTracker Guncelle

if not exist "%SCRIPT%" (
  echo [HATA] Kurulum bulunamadi: %SCRIPT%
  echo Once kur.cmd dosyasini cift tikla.
  pause
  exit /b 1
)

rem /sessiz parametresi guncelle.cmd'nin "devam etmek icin bir tusa bas"
rem beklemesini kapatir: zamanlanmis gorev kimseyi bekleyemez.
schtasks /create /f /tn "%TASK%" /sc hourly /mo 1 ^
  /tr "\"%SCRIPT%\" /sessiz" >nul
if errorlevel 1 (
  echo [HATA] Gorev olusturulamadi.
  pause
  exit /b 1
)

echo.
echo Tamam: "%TASK%" gorevi saatte bir calisacak.
echo Hemen bir kez denemek icin:
echo   schtasks /run /tn "%TASK%"
echo.
echo Uzanti, yeni surumu gorunce kendini yeniden yukluyor;
echo Chrome'da elle bir sey yapmana gerek yok.
echo.
pause
