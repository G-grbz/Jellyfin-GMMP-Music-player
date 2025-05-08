import { musicPlayerState } from "../core/state.js";
import { getAuthToken } from "../core/auth.js";
import { getConfig } from "../core/configLoader.js";

const config = getConfig();
const id3ReadQueue = [];
const MAX_QUEUE_LENGTH = 100;
const MAX_CONCURRENT_READS = config.id3limit;
const FETCH_TIMEOUT = 10000;
const TAG_READ_TIMEOUT = 5000;

let activeReaders = 0;

loadJSMediaTags();

export async function readID3Tags(trackId) {
  if (!musicPlayerState.id3ImageCache) {
    musicPlayerState.id3ImageCache = {};
  }

  return new Promise((resolve) => {
    if (id3ReadQueue.length >= MAX_QUEUE_LENGTH) {
      console.warn(`ID3 kuyruğu dolu (>${MAX_QUEUE_LENGTH}), atlanıyor: ${trackId}`);
      resolve(null);
      return;
    }
    id3ReadQueue.push({ trackId, resolve });
    processID3Queue();
  });
}

function processID3Queue() {
  while (activeReaders < MAX_CONCURRENT_READS && id3ReadQueue.length > 0) {
    const { trackId, resolve } = id3ReadQueue.shift();
    activeReaders++;
    processSingleTrack(trackId, resolve)
      .finally(() => {
        activeReaders--;
        processID3Queue();
      });
  }
}

async function processSingleTrack(trackId, resolve) {
  try {
    if (!musicPlayerState.id3TagsCache) musicPlayerState.id3TagsCache = {};
    if (!musicPlayerState.id3ImageCache) musicPlayerState.id3ImageCache = {};
    if (musicPlayerState.id3TagsCache[trackId]) {
      resolve(musicPlayerState.id3TagsCache[trackId]);
      return;
    }

    await loadJSMediaTags();

    const token = getAuthToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const response = await fetch(
      `${window.location.origin}/Audio/${trackId}/stream.mp3?Static=true`,
      {
        method: "GET",
        headers: {
          Range: "bytes=0-262143",
          "X-Emby-Token": token
        },
        signal: controller.signal
      }
    ).finally(() => clearTimeout(timeoutId));

    if (!response.ok && response.status !== 206) {
      throw new Error("Kısmi müzik verisi alınamadı");
    }

    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer]);
    const tags = await readTagsWithFallback(blob, trackId, false);

    if (tags) {
      if (tags.picture) {
        const { data, format } = tags.picture;
        const base64 = arrayBufferToBase64(new Uint8Array(data).buffer);
        const uri = `data:${format};base64,${base64}`;
        musicPlayerState.id3ImageCache[trackId] = uri;
        tags.pictureUri = uri;
        delete tags.picture;
      }

      musicPlayerState.id3TagsCache[trackId] = tags;
      resolve(tags);
    } else {
      resolve(null);
    }
  } catch (err) {
    console.error("ID3 etiketleri okunurken hata:", err);
    resolve(null);
  }
}

async function readTagsWithFallback(blob, trackId, fullFetch) {
  return new Promise(async (res) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        console.error("ID3 okuma zaman aşımı");
        res(null);
      }
    }, TAG_READ_TIMEOUT);

    window.jsmediatags.read(blob, {
      onSuccess(tag) {
        if (done) return;
        done = true;
        clearTimeout(timer);

        let genre = tag.tags?.genre || null;
        if (genre && typeof genre === "string") {
          const parts = genre
            .split(/[,;/]/)
            .map(g => g.trim().toLowerCase())
            .filter((g, i, arr) => g && arr.indexOf(g) === i);
          genre = parts.map(g => g[0].toUpperCase() + g.slice(1)).join(", ");
        }

        res({
          lyrics: tag.tags?.USLT?.lyrics || tag.tags?.lyrics?.lyrics || null,
          picture: tag.tags?.picture || null,
          genre,
          year: tag.tags?.year || null
        });
      },
      onError: async (error) => {
        if (done) return;
        const isOffsetErr =
          error.type === "parseData" &&
          /Offset \d+ hasn\'t been loaded yet/.test(error.info);

        if (isOffsetErr && !fullFetch) {
          try {
            const token = getAuthToken();
            const fullResp = await fetch(
              `${window.location.origin}/Audio/${trackId}/stream.mp3?Static=true`,
              { headers: { "X-Emby-Token": token } }
            );
            if (fullResp.ok) {
              const fullBuf = await fullResp.arrayBuffer();
              clearTimeout(timer);
              const retryTags = await readTagsWithFallback(
                new Blob([fullBuf]), trackId, true
              );
              return res(retryTags);
            }
          } catch (e) {
            console.error("Fallback tam indirme başarısız:", e);
          }
        }

        done = true;
        clearTimeout(timer);
        console.error("ID3 okuma hatası:", error);
        res(null);
      }
    });
  });
}

export async function loadJSMediaTags() {
  if (window.jsmediatags) return;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${window.location.origin}/web/GMMP/lyrics/jsmediatags/jsmediatags.min.js`;
    script.onload = resolve;
    script.onerror = () => reject(new Error("jsmediatags yüklenemedi"));
    document.head.appendChild(script);
  });
}

export function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export async function parseID3Tags(buffer) {
  try {
    if (!window.jsmediatags) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${window.location.origin}/web/GMMP/lyrics/jsmediatags/jsmediatags.min.js`;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    return new Promise((resolve) => {
      window.jsmediatags.read(new Blob([buffer]), {
        onSuccess: ({ tags }) => {
          const uslt = tags.USLT?.data?.lyrics;
          const alt = tags.lyrics?.lyrics;
          resolve(uslt || alt || null);
        },
        onError: () => resolve(null)
      });
    });
  } catch {
    return null;
  }
}
