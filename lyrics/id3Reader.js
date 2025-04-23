import { musicPlayerState } from "../core/state.js";
import { getAuthToken } from "../core/auth.js";

export async function readID3Tags(trackId) {
  try {
    if (musicPlayerState.id3TagsCache[trackId]) {
      return musicPlayerState.id3TagsCache[trackId];
    }

    if (!window.jsmediatags) {
      await loadJSMediaTags();
    }

    const token = getAuthToken();
    const response = await fetch(`${window.location.origin}/Audio/${trackId}/stream.mp3?Static=true`, {
      headers: { "X-Emby-Token": token }
    });

    if (!response.ok) throw new Error('Müzik dosyası alınamadı');

    const arrayBuffer = await response.arrayBuffer();
    const tags = await new Promise((resolve) => {
      window.jsmediatags.read(new Blob([arrayBuffer]), {
        onSuccess: function(tag) {
          let genre = tag.tags?.genre || null;

          if (genre && typeof genre === 'string') {
            const genreParts = genre
              .split(/[,;/]/)
              .map(g => g.trim().toLowerCase())
              .filter((g, i, arr) => g && arr.indexOf(g) === i);

            genre = genreParts
              .map(g => g.charAt(0).toUpperCase() + g.slice(1))
              .join(", ");
          }

          const result = {
            lyrics: tag.tags?.USLT?.lyrics || tag.tags?.lyrics?.lyrics || null,
            picture: tag.tags?.picture || null,
            genre: genre || null,
            year: tag.tags?.year || null
          };
          resolve(result);
        },
        onError: function(error) {
          console.error("ID3 okuma hatası:", error);
          resolve(null);
        }
      });
    });

    if (tags) {
      musicPlayerState.id3TagsCache[trackId] = tags;
      return tags;
    }
    return null;
  } catch (err) {
    console.error('ID3 etiketleri okunurken hata:', err);
    return null;
  }
}


export async function loadJSMediaTags() {
  return new Promise((resolve, reject) => {
    if (window.jsmediatags) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsmediatags@3.9.7/dist/jsmediatags.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('jsmediatags yüklenemedi'));
    document.head.appendChild(script);
  });
}

export function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
