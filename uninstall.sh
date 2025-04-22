#!/bin/bash
JELLYFIN_WEB="/usr/share/jellyfin/web"
HTML_FILE="$JELLYFIN_WEB/index.html"
GMMP_DIR="$JELLYFIN_WEB/GMMP"

GMMP_SCRIPTS=(
    '<script type="module" async src="/web/GMMP/main.js"></script>'
)

if [ "$(id -u)" -ne 0 ]; then
    echo "Bu script root olarak çalıştırılmalıdır."
    exit 1
fi

echo "Jellyfin servisi durduruluyor..."
systemctl stop jellyfin

echo "HTML dosyasındaki GMMP kodları kaldırılıyor..."
REMOVED_ANY=false
for script in "${GMMP_SCRIPTS[@]}"; do
    if grep -qF "$script" "$HTML_FILE"; then
        sed -i "s|$script||g" "$HTML_FILE"
        echo "GMMP kaldırıldı: $script"
        REMOVED_ANY=true
    fi
done

if [ "$REMOVED_ANY" = false ]; then
    echo "HTML dosyasında GMMP kodları bulunamadı."
else
    echo "HTML GMMP kodları başarıyla kaldırıldı!"
fi

echo "GMMP dosyaları siliniyor..."
if [ -d "$GMMP_DIR" ]; then
    rm -rf "$GMMP_DIR"
    echo "GMMP dosyaları başarıyla silindi: $GMMP_DIR"
else
    echo "GMMP dizini bulunamadı: $GMMP_DIR"
fi

echo "Jellyfin servisi başlatılıyor..."
systemctl start jellyfin

echo "GMMP kaldırma işlemi tamamlandı!"
