## 🎵 GMMP Müzik Çalar
Jellyfin için hazırlanmış Müzik oynatıcı.


<details>
<summary>🖼️ Ekran Görüntüleri / Screenshots </summary>

![3](https://github.com/user-attachments/assets/fa2f14da-13b5-4123-ad42-886d5db93578)

![2](https://github.com/user-attachments/assets/1738937b-90dc-49fa-bdab-830d5158fd20)

![1](https://github.com/user-attachments/assets/b863fda6-929f-4d24-a776-a5282b2a8492)
 </details>

<details>
<summary> ✨ Features </summary>
  
- User-friendly interface
- Easy access
- ID3 tag integration (track, lyrics, and other metadata are displayed using ID3 tags)
- Random playlist generation
- Save randomly generated playlists
- Refresh button to regenerate playlists
- Ability to select existing playlists on Jellyfin
- Set the number of items in the playlist</details>


<details>
<summary> ✨ Özellikler </summary>

- Kullanıcı dostu arayüz
- Kolay erişim
- id3tags entegrasyon ( parça, şarkı sözü ve diğer bilgiler id3tags entagrasyonu ile yazdırılır )
- Rastgele liste oluşturma
- Rastgele oluşturulan listeyi kaydetme
- Yenileme butonu ile rastgele listeyi yenileme
- Jellyfin üzerinde bulunan oynatma listelerini seçebilme
- Liste öğe sayısı belirleme </details>
  
## Kurulum/Installation
<details>
<summary> 🚀 Türkçe Kurulum </summary>

### ⚠️ Önemli Notlar

Not: Bu oynatıcı Jellyfin Media Slider (JMS) ile tamamen entegredir. Zaten JMS kullanıyorsanız, çakışmaları veya yinelenen işlevleri önlemek için bunu yüklemeyin.

### Windows için

İndirdiğiniz sıkıştırılmış klasörü herhangi boş bir klasöre çıkarıp ``` install.bat ``` betiğini yönetici olarak çalıştırın.

### Yüklemeyi Kaldırma

``` uninstall.bat ``` betiğini yönetici olarak çalıştırın.


### Linux için

``` git clone https://github.com/G-grbz/Jellyfin-GMMP ```

``` cd Jellyfin-GMMP ```

### Kurulum scriptini çalıştırın:

``` sudo chmod +x install.sh && sudo ./install.sh ```

### Tarayıcı çerezlerini temizleyin.

### Yüklemeyi Kaldırma

``` sudo chmod +x /usr/share/jellyfin/web/GMMP/uninstall.sh && sudo sh /usr/share/jellyfin/web/GMMP/uninstall.sh ```
</details>

<details>
<summary> 🚀 English Installation Guide </summary>

 ### ⚠️ Important Notes

Note: This player is fully integrated with Jellyfin Media Slider (JMS).
If you are already using JMS, do not install this separately to avoid conflicts or duplicate functionality.

### For Windows
  
Extract the downloaded archive to any folder and run the ``` install.bat ``` script as Administrator.

### Uninstallation

Run the ``` uninstall.bat ``` script as Administrator.

### For Linux

```git clone https://github.com/G-grbz/Jellyfin-GMMP ```

``` cd Jellyfin-GMMP ```

### Run the installation script:

``` sudo chmod +x install.sh && sudo ./install.sh ```

### Uninstallation

``` sudo chmod +x /usr/share/jellyfin/web/GMMP/uninstall.sh && sudo sh /usr/share/jellyfin/web/GMMP/uninstall.sh ``` </details>


<details>
<summary> 🚀 Senkronize Şarkı Sözleri Betiği / Synchronized Lyrics Script </summary>

### Türkçe

lrclib.net üzerinden şarkı sözlerini çekebilen bir betik ekledim(lrclib.sh). Bu betik eklentiden bağımsız olarak çalışmaktadır. (Linux)

betiği çalıştırmak için gerekli bağımlılıklar: ```curl, jq, find```

mevcut şarkı isim formatınız ``` "'ad soyad' -  'parça adı'" ``` şekilde olmalıdır örn.: ```Ali Kınık - Ali Ayşeyi Seviyor```

Betiği çalıştırmak için gerekli izinleri verin ve 

``` sh lrclib.sh /Müzik/Dosya/Yolu ``` komutunu çalıştırın alt klasörler dahil arayarak eşleşen şarkı sözlerini indirecektir. ( Öncelik Senkronize şarkı sözleri mevcut değil ise normal) 

Mevcut şarkı sözlerinizin üzerine yazmak isterseniz, komut sonuna ```--overwrite``` ekleyin yani ```sh lrclib.sh /Müzik/Dosya/Yolu --overwrite```

dosya yolunuz boşluk içeriyor ise ```""``` içerisine alın yani ```sh lrclib.sh "/Müzik/Dosya/Müzik Yolu" --overwrite``` (formatlar mp3 ve flac olmalıdır)

### English

A standalone script has been added to fetch synchronized lyrics from lrclib.net. This script operates independently of the plugin and is designed for Linux systems.

Requirements:
To run the script, make sure the following dependencies are installed: curl, jq, and find

Track Filename Format:
Your audio files should follow the naming convention:
```'artist name' - 'track title'```
For example: ```Ali Kınık - Ali Ayşeyi Seviyor```

Usage:
Grant the necessary execution permissions to the script.

Run the command:

```sh lrclib.sh /Path/To/Your/Music/Directory```

This will recursively search all subdirectories and download matching lyrics.
It prioritizes synchronized lyrics, and falls back to regular lyrics if none are available.

To overwrite existing lyrics files, append the --overwrite flag:

```sh lrclib.sh /Path/To/Your/Music/Directory --overwrite```

If your file path contains spaces, enclose it in double quotes, e.g., sh lrclib.sh "/Path/To/Your/Music Path" --overwrite (Supported formats: mp3 and flac)

</details>
