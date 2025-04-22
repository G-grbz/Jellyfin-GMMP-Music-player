@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [HATA] Bu islemi yapabilmek icin yonetici olarak calistirmalisiniz.
    pause
    exit /b
)

echo Jellyfin servisi durduruluyor...
net stop JellyfinServer >nul 2>&1

set "HTML_FILE=C:\Program Files\Jellyfin\Server\jellyfin-web\index.html"
set "SLIDER_HTML=<script type=\"module\" async src=\"/web/GMMP/main.js\"></script>"

echo HTML dosyasindaki GMMP kodlari kontrol ediliyor...
findstr /C:"GMMP/main.js" "%HTML_FILE%" >nul
if %errorlevel% equ 0 (
    powershell -Command "(Get-Content '%HTML_FILE%') -replace [regex]::Escape('%SLIDER_HTML%'), '' | Set-Content '%HTML_FILE%'"
    echo [BASARILI] HTML GMMP kodu kaldirildi!
) else (
    echo [BILGI] HTML dosyasinda GMMP kodu bulunamadi.
)

set "SLIDER_DIR=C:\Program Files\Jellyfin\Server\jellyfin-web\GMMP"
if exist "%SLIDER_DIR%" (
    echo GMMP dosyalari siliniyor...
    rmdir /s /q "%SLIDER_DIR%"
    echo [BASARILI] GMMP dosyalari silindi.
) else (
    echo [BILGI] GMMP dizini bulunamadi: %SLIDER_DIR%
)

echo Jellyfin servisi baslatiliyor...
net start JellyfinServer >nul 2>&1

endlocal
echo.
echo [TAMAMLANDI] GMMP kaldirma islemi basariyla tamamlandi.
pause
