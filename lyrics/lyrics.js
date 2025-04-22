import { musicPlayerState } from "../core/state.js";
import { getConfig } from "../core/configLoader.js";
import { getFromOfflineCache, cacheForOffline } from "../core/offlineCache.js";
import { readID3Tags } from "./id3Reader.js";
import { getAuthToken } from "../core/auth.js";

const config = getConfig();

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

export async function parseSyncedLyrics(lyricsText) {
  const lines = [];
  const regex = /^\[(\d+):(\d+)\.(\d+)\](.*)$/gm;
  let match;

  while ((match = regex.exec(lyricsText)) !== null) {
    const minutes = parseInt(match[1]);
    const seconds = parseInt(match[2]);
    const hundredths = parseInt(match[3]);
    const text = match[4].trim();

    if (text) {
      const time = minutes * 60 + seconds + hundredths / 100;
      lines.push({ time, text });
    }
  }

  lines.sort((a, b) => a.time - b.time);
  return lines;
}

export function updateSyncedLyrics(currentTime) {
  if (!musicPlayerState.syncedLyrics.lines.length) return;

  let currentLine = -1;

  for (let i = 0; i < musicPlayerState.syncedLyrics.lines.length; i++) {
    if (musicPlayerState.syncedLyrics.lines[i].time <= currentTime) {
      currentLine = i;
    } else {
      break;
    }
  }

  if (currentLine !== musicPlayerState.syncedLyrics.currentLine) {
    musicPlayerState.syncedLyrics.currentLine = currentLine;
    renderSyncedLyrics();
  }
}

export function renderSyncedLyrics() {
  const { lyricsContainer } = musicPlayerState;
  if (!lyricsContainer) return;

  lyricsContainer.innerHTML = '';

  musicPlayerState.syncedLyrics.lines.forEach((line, index) => {
    const lineEl = document.createElement('div');
    lineEl.className = 'lyrics-line';
    lineEl.textContent = line.text;

    if (index === musicPlayerState.syncedLyrics.currentLine) {
      lineEl.classList.add('active');

      setTimeout(() => {
        lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }

    lyricsContainer.appendChild(lineEl);
  });
}

export async function fetchLyrics() {
  const currentTrack = musicPlayerState.playlist[musicPlayerState.currentIndex];
  if (!currentTrack) return;

  musicPlayerState.lyricsContainer.innerHTML = `<div class='lyrics-loading'>${config.languageLabels.loadingLyrics}</div>`;
  musicPlayerState.currentLyrics = [];
  musicPlayerState.syncedLyrics = { lines: [], currentLine: -1 };

  try {
    const cachedLyrics = await getFromOfflineCache(currentTrack.Id, 'lyrics');
    if (cachedLyrics) {
      displayLyrics(cachedLyrics);
      return;
    }

    const localLyrics = await getLocalLyrics(currentTrack.Id);
    if (localLyrics) {
      displayLyrics(localLyrics);
      cacheForOffline(currentTrack.Id, 'lyrics', localLyrics);
      return;
    }

    const id3Tags = await readID3Tags(currentTrack.Id);
    if (id3Tags?.lyrics) {
      displayLyrics(id3Tags.lyrics);
      cacheForOffline(currentTrack.Id, 'lyrics', id3Tags.lyrics);
      return;
    }

    showNoLyricsMessage();
  } catch (err) {
    console.error("Şarkı sözleri yüklenirken hata:", err);
    showLyricsError(err.message);
  }
}

export function displayLyrics(lyricsData) {
  try {
    musicPlayerState.lyricsContainer.innerHTML = "";

    if (typeof lyricsData === 'string' && lyricsData.match(/\[\d{2}:\d{2}\.\d{2}\]/)) {
      parseSyncedLyrics(lyricsData).then(lines => {
        musicPlayerState.syncedLyrics.lines = lines;
        renderSyncedLyrics();
      });
    }
    else if (typeof lyricsData === 'string') {
      const div = document.createElement("div");
      div.className = "lyrics-plain";
      div.textContent = lyricsData;
      musicPlayerState.lyricsContainer.appendChild(div);
    }
    else {
      showNoLyricsMessage();
    }
  } catch (err) {
    console.error("Sözler gösterilirken hata:", err);
    showLyricsError("Sözler işlenirken hata oluştu");
  }
}

export function showNoLyricsMessage() {
  musicPlayerState.lyricsContainer.innerHTML = `<div class='lyrics-not-found'>${config.languageLabels.noLyricsFound}</div>`;
}

export function showLyricsError(message) {
  musicPlayerState.lyricsContainer.innerHTML = `<div class='lyrics-error'>${config.languageLabels.lyricsError}: ${message}</div>`;
}

export async function getLocalLyrics(trackId) {
  try {
    const token = getAuthToken();
const url = `${window.location.origin}/Audio/${trackId}/Lyrics?api_key=${token}`;
const response = await fetch(url, {
  headers: {
    "X-Emby-Token": token
  }
});

    if (response.ok) {
      const data = await response.json();

      if (data.Lyrics && data.Lyrics.length > 0) {
        if (data.Metadata?.IsSynced) {
          return data.Lyrics.map(line =>
            `[${Math.floor(line.Start / 60)}:${(line.Start % 60).toFixed(2)}]${line.Text}`
          ).join('\n');
        }
        else {
          return data.Lyrics.map(line => line.Text).join('\n');
        }
      }
      return null;
    }
    return null;
  } catch (err) {
    console.error("Local şarkı sözleri alınırken hata:", err);
    return null;
  }
}
