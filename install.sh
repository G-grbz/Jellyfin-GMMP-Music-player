#!/bin/bash
JELLYFIN_WEB="/usr/share/jellyfin/web"
HTML_FILE="$JELLYFIN_WEB/index.html"
GMMP_DIR="$JELLYFIN_WEB/GMMP"
SOURCE_DIR="$(dirname "$(realpath "$0")")"

INSERT_HTML='<script type="module" async src="/web/GMMP/main.js"></script>'

if [ "$(id -u)" -ne 0 ]; then
    echo "Bu script root olarak çalıştırılmalıdır."
    exit 1
fi

echo "GMMP klasörü oluşturuluyor: $GMMP_DIR"
if mkdir -p "$GMMP_DIR"; then
    if [ -d "$GMMP_DIR" ]; then
        echo "Klasör başarıyla oluşturuldu, dosyalar kopyalanıyor..."
        if cp -r "$SOURCE_DIR"/* "$GMMP_DIR"/ 2>/dev/null; then
            echo "Dosyalar başarıyla kopyalandı: $GMMP_DIR"
        else
            echo "HATA: Dosyalar kopyalanırken bir sorun oluştu!" >&2
            exit 1
        fi
    else
        echo "HATA: Klasör oluşturulamadı: $GMMP_DIR" >&2
        exit 1
    fi
else
    echo "HATA: Klasör oluşturulamadı: $GMMP_DIR" >&2
    exit 1
fi

if ! grep -q "/GMMP/main.js" "$HTML_FILE"; then
    sed -i '/GMMP\/main.js/d' "$HTML_FILE"
    sed -i "s|</body>|__TEMP_BODY__|g" "$HTML_FILE"
    sed -i "s|__TEMP_BODY__|${INSERT_HTML}</body>|g" "$HTML_FILE"
    echo "HTML snippet'leri başarıyla eklendi!"
else
    echo "HTML snippet'leri zaten mevcut. Atlanıyor..."
fi

echo "Kurulum tamamlandı!"
