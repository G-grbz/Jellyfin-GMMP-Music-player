#!/bin/bash
# GMMP
# LRC Lib Şarkı Sözü İndirici (Synced/Plain Öncelikli)
# Gerekli bağımlılıklar: curl, jq, find

MUSIC_DIR="${1%/}"
OVERWRITE=false

if [ -z "$MUSIC_DIR" ]; then
    echo "Kullanım: $0 /Müzik/klasör/yolu [--overwrite]"
    echo "Örnek: $0 ~/Müzik"
    echo "Örnek (üzerine yazma): $0 ~/Müzik --overwrite"
    exit 1
fi

if [ "$2" == "--overwrite" ]; then
    OVERWRITE=true
    echo "UYARI: Mevcut LRC dosyalarının üzerine yazılacak!"
fi

if [ ! -d "$MUSIC_DIR" ]; then
    echo "Hata: Belirtilen klasör bulunamadı: $MUSIC_DIR"
    exit 1
fi

API_URL="https://lrclib.net/api/search"

TOTAL=0
SUCCESS_SYNCED=0
SUCCESS_PLAIN=0
FAILED=0
SKIPPED=0

echo "Şarkı sözleri indiriliyor: $MUSIC_DIR"
echo "Üzerine yazma modu: $OVERWRITE"
echo "----------------------------------------"

while IFS= read -r -d '' file; do
    ((TOTAL++))

    lrc_file="${file%.*}.lrc"

    if [ -f "$lrc_file" ] && [ "$OVERWRITE" = false ]; then
        echo -e "\nDosya: $file"
        echo "Atlandı: LRC dosyası zaten var (üzerine yazma kapalı)"
        ((SKIPPED++))
        continue
    fi

    filename=$(basename "$file" ".mp3")
    filename="${filename%.*}"

    echo -e "\nDosya: $file"

    artist=$(echo "$filename" | awk -F " - " '{print $1}' | sed -e 's/\[.*\]//g' -e 's/(.*)//g' | xargs)
    title=$(echo "$filename" | awk -F " - " '{print $2}' | sed -e 's/\[.*\]//g' -e 's/(.*)//g' | xargs)

    if [ -z "$title" ]; then
        artist=$(echo "$filename" | awk -F "--" '{print $1}' | xargs)
        title=$(echo "$filename" | awk -F "--" '{print $2}' | xargs)
    fi

    if [ -z "$title" ]; then
        artist=$(echo "$filename" | awk -F "_" '{print $1}' | xargs)
        title=$(echo "$filename" | awk -F "_" '{print $2}' | xargs)
    fi

    if [ -z "$artist" ] || [ -z "$title" ]; then
        echo "Uyarı: Dosya adı uygun formatta değil: '$filename'"
        ((FAILED++))
        continue
    fi

    echo "Aranıyor: '$artist' - '$title'"

    response=$(curl -s -G "$API_URL" \
        --data-urlencode "artist_name=$artist" \
        --data-urlencode "track_name=$title")

    if [ $? -ne 0 ]; then
        echo "Hata: API isteği başarısız oldu"
        ((FAILED++))
        continue
    fi

    lrc_content=$(echo "$response" | jq -r '.[0]?.syncedLyrics')
    lrc_type="synced"

    if [ -z "$lrc_content" ] || [ "$lrc_content" = "null" ]; then
        lrc_content=$(echo "$response" | jq -r '.[0]?.plainLyrics')
        lrc_type="plain"

        if [ -z "$lrc_content" ] || [ "$lrc_content" = "null" ]; then
            echo "Uyarı: Hiçbir şarkı sözü bulunamadı (ne synced ne de plain)"
            ((FAILED++))
            continue
        fi
    fi

    echo "$lrc_content" > "$lrc_file"

    if [ $? -eq 0 ]; then
        if [ "$lrc_type" = "synced" ]; then
            echo "Başarılı: $lrc_file oluşturuldu (SENKRONIZE sözler)"
            ((SUCCESS_SYNCED++))
        else
            echo "Başarılı: $lrc_file oluşturuldu (DÜZ sözler)"
            ((SUCCESS_PLAIN++))
        fi
    else
        echo "Hata: $lrc_file oluşturulamadı/güncellenemedi"
        ((FAILED++))
    fi

done < <(find "$MUSIC_DIR" -type f -iname "*.mp3" -print0)

echo -e "\n----------------------------------------"
echo "İşlem tamamlandı"
echo "Toplam şarkı: $TOTAL"
echo "Başarılı (Senkronize): $SUCCESS_SYNCED"
echo "Başarılı (Düz): $SUCCESS_PLAIN"
echo "Atlandı: $SKIPPED"
echo "Başarısız: $FAILED"

if [ "$FAILED" -gt 0 ]; then
    echo -e "\nNot: Başarısız olanlar için:"
    echo "1. Dosya adlarını 'Sanatçı - Şarkı.mp3' formatında düzenlemeyi deneyin"
    echo "2. --overwrite parametresiyle mevcut LRC'lerin üzerine yazmayı deneyin"
    echo "3. Şarkı sözlerini manuel olarak lrclib.net'ten arayabilirsiniz"
fi
