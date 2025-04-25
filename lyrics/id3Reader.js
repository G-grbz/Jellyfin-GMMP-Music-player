import { musicPlayerState } from "../core/state.js";
import { getAuthToken } from "../core/auth.js";

const id3ReadQueue = [];
let isReading = false;

const MAX_QUEUE_LENGTH = 100;
const FETCH_TIMEOUT = 10000;
const TAG_READ_TIMEOUT = 5000;

export async function readID3Tags(trackId) {
  return new Promise((resolve) => {
    if (id3ReadQueue.length >= MAX_QUEUE_LENGTH) {
      console.warn(`ID3 queue full (>${MAX_QUEUE_LENGTH}), dropping ${trackId}`);
      resolve(null);
      return;
    }
    id3ReadQueue.push({ trackId, resolve });
    processID3Queue();
  });
}

async function processID3Queue() {
  if (isReading || id3ReadQueue.length === 0) return;
  isReading = true;

  const { trackId, resolve } = id3ReadQueue.shift();

  try {
    if (musicPlayerState.id3TagsCache[trackId]) {
      resolve(musicPlayerState.id3TagsCache[trackId]);
    } else {
      if (!window.jsmediatags) await loadJSMediaTags();

      const token = getAuthToken();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const response = await fetch(
        `${window.location.origin}/Audio/${trackId}/stream.mp3?Static=true`,
        {
          method: "GET",
          headers: {
            Range: "bytes=0-131071",
            "X-Emby-Token": token
          },
          signal: controller.signal
        }
      ).finally(() => clearTimeout(timeoutId));

      if (!response.ok && response.status !== 206) {
        throw new Error("Kısmi müzik verisi alınamadı");
      }

      const arrayBuffer = await response.arrayBuffer();
      const blob128 = new Blob([arrayBuffer]);
      const tags = await readTagsWithFallback(blob128, trackId, false);

      if (tags) {
        musicPlayerState.id3TagsCache[trackId] = tags;
        resolve(tags);
      } else {
        resolve(null);
      }
    }
  } catch (err) {
    console.error("ID3 etiketleri okunurken hata:", err);
    resolve(null);
  } finally {
    isReading = false;
    processID3Queue();
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
            .map((g) => g.trim().toLowerCase())
            .filter((g, i, arr) => g && arr.indexOf(g) === i);
          genre = parts.map((g) => g[0].toUpperCase() + g.slice(1)).join(", ");
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
          console.warn("Offset hatası, tam dosyayı indirip yeniden deniyorum…");
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
                new Blob([fullBuf]),
                trackId,
                true
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
  return new Promise((resolve, reject) => {
    if (window.jsmediatags) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/jsmediatags@3.9.7/dist/jsmediatags.min.js";
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
