import { musicPlayerState } from "../core/state.js";
import { getConfig } from "../core/configLoader.js";
import { getFromOfflineCache, cacheForOffline } from "../core/offlineCache.js";
import { readID3Tags } from "./id3Reader.js";
import { getAuthToken } from "../core/auth.js";

const config = getConfig();

export async function getEmbeddedLyrics(trackId) {
  try {
    if (musicPlayerState.lyricsCache[trackId]) {
      return musicPlayerState.lyricsCache[trackId];
    }

    const token = getAuthToken();
    const response = await fetch(`${window.location.origin}/Audio/${trackId}/stream.mp3?Static=true`, {
      headers: { "X-Emby-Token": token }
    });

    if (!response.ok) throw new Error("Müzik dosyası alınamadı");

    const arrayBuffer = await response.arrayBuffer();
    const lyrics = await parseID3Tags(arrayBuffer);

    if (lyrics) {
      musicPlayerState.lyricsCache[trackId] = lyrics;
      return lyrics;
    }
    return null;
  } catch (err) {
    console.error("Gömülü sözler okunamadı:", err);
    return null;
  }
}

export  async function parseID3Tags(arrayBuffer) {
  try {
    if (!window.jsmediatags) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/jsmediatags@3.9.7/dist/jsmediatags.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    return new Promise((resolve) => {
      window.jsmediatags.read(new Blob([arrayBuffer]), {
        onSuccess: function(tag) {
  console.log("Taglar:", tag.tags);

  const usltLyrics = tag.tags.USLT?.data?.lyrics;
  const customLyrics = tag.tags.lyrics?.lyrics;
  const lyricsText = usltLyrics || customLyrics || null;

  resolve(lyricsText);
}
      });
    });
  } catch (err) {
    console.error("ID3 kütüphanesi yüklenirken hata:", err);
    return null;
  }
}

export async function fetchLyrics() {
    const currentTrack = musicPlayerState.playlist[musicPlayerState.currentIndex];
    if (!currentTrack) return;

    musicPlayerState.lyricsContainer.innerHTML = `<div class='lyrics-loading'>${config.languageLabels.loadingLyrics}</div>`;
    musicPlayerState.currentLyrics = [];

    const token = getAuthToken();
    try {
        const localFileResponse = await fetch(`${window.location.origin}/Audio/${currentTrack.Id}/Lyrics`, {
            headers: { "X-Emby-Token": token }
        });

        if (localFileResponse.ok) {
            const localText = await localFileResponse.text();

            if (localText && localText.trim()) {
                displayLyrics(localText);
                musicPlayerState.lyricsCache[currentTrack.Id] = localText;
                return;
            }
        }
    } catch (err) {
        console.warn("Yerel şarkı sözü bulunmadı:", err);
    }

    try {
        const metadataResponse = await fetch(`${window.location.origin}/Items/${currentTrack.Id}/Lyrics`, {
            headers: { "X-Emby-Token": token }
        });

        if (metadataResponse.ok) {
            const data = await metadataResponse.json();
            if (data.Lyrics && data.Lyrics.length > 0) {
                displayLyrics(data.Lyrics);
                musicPlayerState.lyricsCache[currentTrack.Id] = data.Lyrics;
                return;
            }
        }
    } catch (err) {
        console.warn("Metadata sözleri okunamadı:", err);
    }

    try {
        const embeddedLyrics = await getEmbeddedLyrics(currentTrack.Id);
        if (embeddedLyrics && embeddedLyrics.trim()) {
            displayLyrics(embeddedLyrics);
            musicPlayerState.lyricsCache[currentTrack.Id] = embeddedLyrics;
            return;
        }
    } catch (err) {
        console.warn("Gömülü ID3 sözleri okunamadı:", err);
    }

    showNoLyricsMessage();
}


export function displayLyrics(lyricsData) {
  try {
    musicPlayerState.currentLyrics = [];
    musicPlayerState.lyricsContainer.innerHTML = "";

    if (typeof lyricsData === 'string' && lyricsData.trim().startsWith('{')) {
      try {
        lyricsData = JSON.parse(lyricsData);
      } catch (e) {
        console.warn("Lyrics JSON parse hatası:", e);
      }
    }

    if (typeof lyricsData === 'object' && lyricsData.Lyrics && Array.isArray(lyricsData.Lyrics)) {
      lyricsData.Lyrics.forEach(line => {
        if (line.Text && line.Text.trim()) {
          const lineContainer = document.createElement("div");
          lineContainer.className = "lyrics-line-container";

          const textDisplay = document.createElement("div");
          textDisplay.className = "lyrics-text";
          textDisplay.textContent = line.Text.trim();

          lineContainer.appendChild(textDisplay);
          musicPlayerState.lyricsContainer.appendChild(lineContainer);
        }
      });
      return;
    }

    if (Array.isArray(lyricsData) && lyricsData.every(line => typeof line.Text === "string")) {
      lyricsData.forEach(line => {
        if (line.Text && line.Text.trim()) {
          const lineContainer = document.createElement("div");
          lineContainer.className = "lyrics-line-container";

          const textDisplay = document.createElement("div");
          textDisplay.className = "lyrics-text";
          textDisplay.textContent = line.Text.trim();

          lineContainer.appendChild(textDisplay);
          musicPlayerState.lyricsContainer.appendChild(lineContainer);
        }
      });
      return;
    }

    if (typeof lyricsData === 'string' && lyricsData.match(/\[\d{2}:\d{2}\.\d{2}\]/)) {
      const lines = lyricsData.split('\n');
      const lyricsWithTime = [];

      lines.forEach(line => {
        const timeMatches = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\]/g);
        if (timeMatches) {
          const text = line.replace(/\[\d{2}:\d{2}\.\d{2}\]/g, '').trim();

          if (text) {
            timeMatches.forEach(timeTag => {
              const timeMatch = timeTag.match(/\[(\d{2}):(\d{2})\.(\d{2})\]/);
              if (timeMatch) {
                const minutes = parseInt(timeMatch[1]);
                const seconds = parseInt(timeMatch[2]);
                const time = minutes * 60 + seconds;

                const lineContainer = document.createElement("div");
                lineContainer.className = "lyrics-line-container";

                const timeDisplay = document.createElement("span");
                timeDisplay.className = "lyrics-time";
                timeDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

                const textDisplay = document.createElement("div");
                textDisplay.className = "lyrics-text";
                textDisplay.innerHTML = text.split('').map(char =>
                  `<span class="lyrics-char">${char}</span>`
                ).join('');

                lineContainer.appendChild(timeDisplay);
                lineContainer.appendChild(textDisplay);
                musicPlayerState.lyricsContainer.appendChild(lineContainer);
                lyricsWithTime.push({
                  time,
                  element: textDisplay,
                  chars: Array.from(textDisplay.querySelectorAll('.lyrics-char'))
                });
              }
            });
          }
        } else if (line.trim()) {
          const lineContainer = document.createElement("div");
          lineContainer.className = "lyrics-line-container";

          const textDisplay = document.createElement("div");
          textDisplay.className = "lyrics-text";
          textDisplay.textContent = line.trim();

          lineContainer.appendChild(textDisplay);
          musicPlayerState.lyricsContainer.appendChild(lineContainer);
        }
      });

      musicPlayerState.currentLyrics = lyricsWithTime.sort((a, b) => a.time - b.time);
    } else if (typeof lyricsData === "string") {
      const div = document.createElement("div");
      div.className = "lyrics-plain";
      div.textContent = lyricsData;
      musicPlayerState.lyricsContainer.appendChild(div);
    }
  } catch (err) {
    console.error("Sözler gösterilirken hata:", err);
    showLyricsError("Sözler işlenirken hata oluştu");
  }
}


export function toggleLyrics() {
  musicPlayerState.lyricsActive = !musicPlayerState.lyricsActive;

  if (musicPlayerState.lyricsActive) {
    musicPlayerState.lyricsContainer.classList.remove("lyrics-hidden");
    musicPlayerState.lyricsContainer.classList.add("lyrics-visible");
    musicPlayerState.lyricsBtn.innerHTML = '<i class="fas fa-align-left" style="color:#e91e63"></i>';
    fetchLyrics();
  } else {
    musicPlayerState.lyricsContainer.classList.remove("lyrics-visible");
    musicPlayerState.lyricsContainer.classList.add("lyrics-hidden");
    musicPlayerState.lyricsBtn.innerHTML = '<i class="fas fa-align-left"></i>';
  }
}

export function showNoLyricsMessage() {
    musicPlayerState.lyricsContainer.innerHTML = `<div class='lyrics-not-found'>${config.languageLabels.noLyricsFound}</div>`;
  }

export function showLyricsError(message) {
    musicPlayerState.lyricsContainer.innerHTML = `<div class='lyrics-error'>${config.languageLabels.lyricsError}: ${message}</div>`;
  }

  export function updateSyncedLyrics(currentTime) {
  const { syncedLyrics } = musicPlayerState;
  if (!syncedLyrics.lines.length) return;

  const index = syncedLyrics.lines.findIndex((line, i, arr) => {
    return i === arr.length - 1 || arr[i + 1].time > currentTime;
  });

  if (index !== syncedLyrics.currentLine) {
    syncedLyrics.currentLine = index;
    renderSyncedLyrics();
  }
}
