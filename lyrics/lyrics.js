import { musicPlayerState } from "../core/state.js";
import { getConfig } from "../core/configLoader.js";
import { showNotification } from "../ui/notification.js";
import { getFromOfflineCache, cacheForOffline } from "../core/offlineCache.js";
import { readID3Tags, parseID3Tags } from "./id3Reader.js";
import { getAuthToken } from "../core/auth.js";
import { musicDB } from "../utils/db.js";

const config = getConfig();

export async function fetchLyrics() {
  const currentTrack = musicPlayerState.playlist[musicPlayerState.currentIndex];
  if (!currentTrack) return;

  if (musicPlayerState.lyricsCache[currentTrack.Id]) {
    displayLyrics(musicPlayerState.lyricsCache[currentTrack.Id]);
    return;
  }

  const dbLyrics = await musicDB.getLyrics(currentTrack.Id);
  if (dbLyrics) {
    displayLyrics(dbLyrics);
    musicPlayerState.lyricsCache[currentTrack.Id] = dbLyrics;
    return;
  }

  musicPlayerState.lyricsContainer.innerHTML = `<div class='lyrics-loading'>${config.languageLabels.loadingLyrics}</div>`;
  musicPlayerState.currentLyrics = [];

  const token = getAuthToken();
  const endpoints = [
    `/Audio/${currentTrack.Id}/Lyrics`,
    `/Items/${currentTrack.Id}/Lyrics`,
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${endpoint}`, {
        headers: { "X-Emby-Token": token }
      });

      if (res.ok) {
        const data = endpoint.includes('Items') ? await res.json() : await res.text();
        const lyrics = typeof data === 'string' ? data : data.Lyrics;
        if (lyrics && lyrics.length > 0) {
          displayLyrics(lyrics);
          musicPlayerState.lyricsCache[currentTrack.Id] = lyrics;
          await musicDB.saveLyrics(currentTrack.Id, lyrics);
          return;
        }
      }
    } catch (_) {}
  }

  try {
    const embeddedLyrics = await getEmbeddedLyrics(currentTrack.Id);
    if (embeddedLyrics?.trim()) {
      displayLyrics(embeddedLyrics);
      musicPlayerState.lyricsCache[currentTrack.Id] = embeddedLyrics;
      await musicDB.saveLyrics(currentTrack.Id, embeddedLyrics);
      return;
    }
  } catch (_) {}

  showNoLyricsMessage();
}

export async function getEmbeddedLyrics(trackId) {
  try {
    if (musicPlayerState.lyricsCache[trackId]) {
      return musicPlayerState.lyricsCache[trackId];
    }

    const token = getAuthToken();
    const response = await fetch(`/Audio/${trackId}/stream.mp3?Static=true`, {
      headers: { "X-Emby-Token": token }
    });

    if (!response.ok) throw new Error("Stream alınamadı");

    const buffer = await response.arrayBuffer();
    const lyrics = await parseID3Tags(buffer);
    if (lyrics) musicPlayerState.lyricsCache[trackId] = lyrics;
    return lyrics || null;
  } catch (err) {
    console.warn("Gömülü söz alınamadı:", err);
    return null;
  }
}

export function displayLyrics(data) {
  musicPlayerState.currentLyrics = [];
  musicPlayerState.lyricsContainer.innerHTML = "";

  const headerContainer = document.createElement("div");
  headerContainer.className = "lyrics-header-container";

  const settingsContainer = document.createElement("div");
  settingsContainer.className = "lyrics-settings-container";

  const delayContainer = document.createElement("div");
  delayContainer.className = "lyrics-setting-group";

  const delayLabel = document.createElement("span");
  delayLabel.textContent = config.languageLabels.lyricsDelay || "Gecikme: ";

  const delaySlider = document.createElement("input");
  delaySlider.type = "range";
  delaySlider.min = "-5";
  delaySlider.max = "5";
  delaySlider.step = "0.1";
  delaySlider.value = localStorage.getItem("lyricsDelay") || "0";
  delaySlider.className = "lyrics-delay-slider";

  const delayValue = document.createElement("span");
  delayValue.className = "lyrics-setting-value";
  delayValue.textContent = `${delaySlider.value}s`;

  delaySlider.addEventListener("input", (e) => {
    const value = e.target.value;
    delayValue.textContent = `${value}s`;
    localStorage.setItem("lyricsDelay", value);
    musicPlayerState.lyricsDelay = parseFloat(value);
  });

  delayValue.addEventListener("click", (e) => {
    const manualInput = document.createElement("input");
    manualInput.type = "number";
    manualInput.step = "0.1";
    manualInput.value = delaySlider.value;
    manualInput.className = "lyrics-setting-manual-input";
    manualInput.style.width = "4em";

    delayValue.style.display = "none";
    delayValue.parentNode.insertBefore(manualInput, delayValue.nextSibling);

    function applyManualValue() {
      let v = parseFloat(manualInput.value);
      if (isNaN(v)) {
        v = 0;
      }
      if (v < parseFloat(delaySlider.min)) v = parseFloat(delaySlider.min);
      if (v > parseFloat(delaySlider.max)) v = parseFloat(delaySlider.max);
      delaySlider.value = v;
      delayValue.textContent = `${v}s`;
      localStorage.setItem("lyricsDelay", v);
      musicPlayerState.lyricsDelay = v;
      manualInput.removeEventListener("blur", onBlur);
      manualInput.removeEventListener("keydown", onKeyDown);
      manualInput.parentNode.removeChild(manualInput);
      delayValue.style.display = "";
    }

    function onBlur() {
      applyManualValue();
    }

    function onKeyDown(ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        applyManualValue();
      }
      else if (ev.key === "Escape") {
        manualInput.removeEventListener("blur", onBlur);
        manualInput.removeEventListener("keydown", onKeyDown);
        manualInput.parentNode.removeChild(manualInput);
        delayValue.style.display = "";
      }
    }

    manualInput.addEventListener("blur", onBlur);
    manualInput.addEventListener("keydown", onKeyDown);
    manualInput.focus();
  });

  delayContainer.append(delayLabel, delaySlider, delayValue);

  const durationContainer = document.createElement("div");
  durationContainer.className = "lyrics-setting-group";

  const durationLabel = document.createElement("span");
  durationLabel.textContent = config.languageLabels.lyricsDuration || "Aktiflik Süresi: ";

  const durationSlider = document.createElement("input");
  durationSlider.type = "range";
  durationSlider.min = "1";
  durationSlider.max = "15";
  durationSlider.step = "0.5";
  durationSlider.value = localStorage.getItem("lyricsDuration") || "5";
  durationSlider.className = "lyrics-duration-slider";

  const durationValue = document.createElement("span");
  durationValue.className = "lyrics-setting-value";
  durationValue.textContent = `${durationSlider.value}s`;

  durationSlider.addEventListener("input", (e) => {
    const value = e.target.value;
    durationValue.textContent = `${value}s`;
    localStorage.setItem("lyricsDuration", value);
    musicPlayerState.lyricsDuration = parseFloat(value);
  });

  durationValue.addEventListener("click", (e) => {
    const manualInput = document.createElement("input");
    manualInput.type = "number";
    manualInput.step = "0.5";
    manualInput.min = "1";
    manualInput.max = "15";
    manualInput.value = durationSlider.value;
    manualInput.className = "lyrics-setting-manual-input";
    manualInput.style.width = "4em";

    durationValue.style.display = "none";
    durationValue.parentNode.insertBefore(manualInput, durationValue.nextSibling);

    function applyManualValue() {
      let v = parseFloat(manualInput.value);
      if (isNaN(v)) {
        v = 5;
      }
      if (v < parseFloat(durationSlider.min)) v = parseFloat(durationSlider.min);
      if (v > parseFloat(durationSlider.max)) v = parseFloat(durationSlider.max);
      durationSlider.value = v;
      durationValue.textContent = `${v}s`;
      localStorage.setItem("lyricsDuration", v);
      musicPlayerState.lyricsDuration = v;
      manualInput.removeEventListener("blur", onBlur);
      manualInput.removeEventListener("keydown", onKeyDown);
      manualInput.parentNode.removeChild(manualInput);
      durationValue.style.display = "";
    }

    function onBlur() {
      applyManualValue();
    }

    function onKeyDown(ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        applyManualValue();
      }
      else if (ev.key === "Escape") {
        manualInput.removeEventListener("blur", onBlur);
        manualInput.removeEventListener("keydown", onKeyDown);
        manualInput.parentNode.removeChild(manualInput);
        durationValue.style.display = "";
      }
    }

    manualInput.addEventListener("blur", onBlur);
    manualInput.addEventListener("keydown", onKeyDown);
    manualInput.focus();
  });

  durationContainer.append(durationLabel, durationSlider, durationValue);

  settingsContainer.append(delayContainer, durationContainer);

  const updateBtn = document.createElement("span");
  updateBtn.className = "update-lyrics-btn";
  updateBtn.title = config.languageLabels.updateLyrics || 'Şarkı sözünü güncelle';
  updateBtn.innerHTML = '<i class="fa-solid fa-rotate"></i>';
  updateBtn.addEventListener("click", () => {
    const track = musicPlayerState.playlist[musicPlayerState.currentIndex];
    if (track) updateSingleTrackLyrics(track.Id);
  });

  headerContainer.append(settingsContainer, updateBtn);
  musicPlayerState.lyricsContainer.appendChild(headerContainer);

  const contentContainer = document.createElement("div");
  contentContainer.className = "lyrics-content-container";
  musicPlayerState.lyricsContainer.appendChild(contentContainer);

  if (typeof data === 'string' && data.trim().startsWith('{')) {
    try {
      data = JSON.parse(data);
    } catch (_) {}
  }

  if (typeof data === 'object' && Array.isArray(data.Lyrics)) {
    renderStructuredLyrics(data.Lyrics, contentContainer);
  } else if (typeof data === 'string') {
    if (data.includes('[')) {
      renderTimedTextLyrics(data, contentContainer);
    } else {
      renderPlainText(data, contentContainer);
    }
  }
}

function renderStructuredLyrics(lyricsArray, container) {
  const lines = [];

  lyricsArray.forEach(line => {
    const text = line.Text?.trim();
    if (!text) return;

    const time = line.Start ? line.Start / 10000000 : null;

    const lineContainer = document.createElement("div");
    lineContainer.className = "lyrics-line-container";

    const textEl = document.createElement("div");
    textEl.className = "lyrics-text";
    textEl.textContent = text;

    if (time != null) {
      const timeEl = document.createElement("span");
      timeEl.className = "lyrics-time";
      const m = Math.floor(time / 60);
      const s = Math.floor(time % 60).toString().padStart(2, '0');
      timeEl.textContent = `${m}:${s}`;
      lineContainer.appendChild(timeEl);
    }

    lineContainer.appendChild(textEl);
    container.appendChild(lineContainer);

    if (time != null) {
      lines.push({ time, element: lineContainer });
    }
  });

  musicPlayerState.currentLyrics = lines;
  musicPlayerState.syncedLyrics.lines = lines;
  musicPlayerState.syncedLyrics.currentLine = -1;
}

function createKaraokeWords(text) {
  const words = text.trim().split(/\s+/);
  return words.map(word => {
    const span = document.createElement("span");
    span.className = "karaoke-word";
    span.textContent = word + " ";
    return span;
  });
}

function renderTimedTextLyrics(text, container) {
  const lines = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2})\](.*)/;

  text.split('\n').forEach(raw => {
    const match = raw.match(regex);
    if (match) {
      const [, m, s, , content] = match;
      const time = parseInt(m) * 60 + parseInt(s);
      const lineContainer = document.createElement("div");
      lineContainer.className = "lyrics-line-container";

      const timeEl = document.createElement("span");
      timeEl.className = "lyrics-time";
      timeEl.textContent = `${m}:${s}`;
      lineContainer.appendChild(timeEl);

      const textEl = document.createElement("div");
      textEl.className = "lyrics-text";
      createKaraokeWords(content.trim()).forEach(span => textEl.appendChild(span));
      lineContainer.appendChild(textEl);

      container.appendChild(lineContainer);
      lines.push({ time, element: lineContainer });
    } else if (raw.trim()) {
      renderPlainLine(raw.trim(), container);
    }
  });

  musicPlayerState.currentLyrics = lines;
  musicPlayerState.syncedLyrics.lines = lines;
  musicPlayerState.syncedLyrics.currentLine = -1;
}

function renderPlainText(text, container) {
  text.split('\n').forEach(line => renderPlainLine(line, container));
}

function renderPlainLine(line, container) {
  const lineContainer = document.createElement("div");
  lineContainer.className = "lyrics-line-container";
  const textEl = document.createElement("div");
  textEl.className = "lyrics-text";
  textEl.textContent = line;
  lineContainer.appendChild(textEl);
  container.appendChild(lineContainer);
}

export function toggleLyrics() {
  musicPlayerState.lyricsActive = !musicPlayerState.lyricsActive;
  const el = musicPlayerState.lyricsContainer;
  if (musicPlayerState.lyricsActive) {
    el.classList.add("lyrics-visible");
    el.classList.remove("lyrics-hidden");
    musicPlayerState.lyricsBtn.innerHTML = '<i class="fas fa-align-left" style="color:#e91e63"></i>';
    fetchLyrics();
  } else {
    el.classList.remove("lyrics-visible");
    el.classList.add("lyrics-hidden");
    musicPlayerState.lyricsBtn.innerHTML = '<i class="fas fa-align-left"></i>';
  }
}

export function showNoLyricsMessage() {
  musicPlayerState.lyricsContainer.innerHTML = `<div class='lyrics-not-found'>${config.languageLabels.noLyricsFound}</div>`;
}

export function showLyricsError(msg) {
  musicPlayerState.lyricsContainer.innerHTML = `<div class='lyrics-error'>${config.languageLabels.lyricsError}: ${msg}</div>`;
}

export function updateSyncedLyrics(currentTime) {
  const lines = musicPlayerState.currentLyrics;
  const container = musicPlayerState.lyricsContainer;
  if (!lines?.length) return;

  const delay   = parseFloat(localStorage.getItem("lyricsDelay"))   || 0;
  const duration = parseFloat(localStorage.getItem("lyricsDuration")) || 5;
  const offset  = currentTime + delay;

  if (offset < lines[0].time) {
    container.scrollTop = 0;
    resetAllHighlights();
    musicPlayerState.syncedLyrics.currentLine = -1;
    return;
  }

  let currentIdx = 0;
  let nextIdx    = null;
  for (let i = 0; i < lines.length; i++) {
    if (offset >= lines[i].time) {
      currentIdx = i;
      nextIdx = i + 1 < lines.length ? i + 1 : null;
    } else {
      break;
    }
  }

  const currentLine = lines[currentIdx];
  const lineStart   = currentLine.time;
  const lineEnd     = lineStart + duration;

  if (offset < lineEnd) {
    musicPlayerState.syncedLyrics.currentLine = currentIdx;
    highlightLine(currentIdx, null);

  } else {

    if (nextIdx !== null && offset >= lines[nextIdx].time) {
      musicPlayerState.syncedLyrics.currentLine = nextIdx;
      const nextNext = (nextIdx + 1 < lines.length) ? nextIdx + 1 : null;
      highlightLine(nextIdx, nextNext);

    } else {
      musicPlayerState.syncedLyrics.currentLine = -1;
      highlightLine(-1, nextIdx);
    }
  }
}


function highlightLine(currentIdx, nextIdx) {
  const lines = musicPlayerState.currentLyrics;

  lines.forEach((lineObj, i) => {
    const el = lineObj.element;
    el.classList.remove("lyrics-active", "lyrics-next");

    const existingCheck = el.querySelector(".next-check");
    if (existingCheck) existingCheck.remove();
  });

  if (currentIdx >= 0) {
    const el = lines[currentIdx].element;
    el.classList.add("lyrics-active");
    smoothScrollIntoView(el);
  }

  if (nextIdx !== null) {
    const nextEl = lines[nextIdx].element;
    nextEl.classList.add("lyrics-next");
    const nextup = document.createElement("span");
    nextup.className = "next-check";
    nextup.innerHTML = '<i class="fas fa-arrow-right"></i>';
    nextEl.querySelector(".lyrics-text")?.prepend(nextup);
  }
}


function resetAllHighlights() {
  const lines = musicPlayerState.currentLyrics;
  lines?.forEach(line => {
    line.element.classList.remove("lyrics-active", "lyrics-next");
    line.element.querySelectorAll('.active').forEach(w => w.classList.remove('active'));
    const existingCheck = line.element.querySelector(".next-check");
    if (existingCheck) existingCheck.remove();
  });
}

function smoothScrollIntoView(element) {
  const parent = musicPlayerState.lyricsContainer;
  const containerHeight = parent.clientHeight;
  const elementRect = element.getBoundingClientRect();
  const containerRect = parent.getBoundingClientRect();

  const targetPosition = parent.scrollTop +
                       elementRect.top -
                       containerRect.top -
                       (containerHeight / 2) +
                       (elementRect.height / 2);
  smoothScrollTo(parent, targetPosition);
}

let isScrolling = false;
function smoothScrollTo(element, targetPosition, duration = 500) {
  if (isScrolling) return;
  isScrolling = true;

  const startPosition = element.scrollTop;
  const distance = targetPosition - startPosition;
  let startTime = null;

  function animation(currentTime) {
    if (!startTime) startTime = currentTime;
    const timeElapsed = currentTime - startTime;
    const progress = Math.min(timeElapsed / duration, 1);
    const easeProgress = easeOutQuad(progress);
    element.scrollTop = startPosition + (distance * easeProgress);

    if (timeElapsed < duration) {
      requestAnimationFrame(animation);
    } else {
      isScrolling = false;
    }
  }

  function easeOutQuad(t) {
    return t * (2 - t);
  }

  requestAnimationFrame(animation);
}

export function startLyricsSync() {
  if (musicPlayerState.audio && !musicPlayerState._lyricsEndListenerAdded) {
    musicPlayerState.audio.addEventListener('ended', () => {
      const container = musicPlayerState.lyricsContainer;
      container.scrollTop = 0;
      musicPlayerState.currentLyrics.forEach(line => {
        line.element.classList.remove('lyrics-active');
        line.element.querySelectorAll('.active').forEach(w => w.classList.remove('active'));
      });
    });
    musicPlayerState._lyricsEndListenerAdded = true;
  }

  function frame() {
    if (!musicPlayerState.audio) return;
    updateSyncedLyrics(musicPlayerState.audio.currentTime);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

async function updateSingleTrackLyrics(trackId) {
    try {
        delete musicPlayerState.lyricsCache[trackId];
        await musicDB.deleteLyrics(trackId);
        const track = musicPlayerState.playlist.find(t => t.Id === trackId);
        if (track) {
            const originalIndex = musicPlayerState.currentIndex;
            const originalPlaylist = [...musicPlayerState.playlist];

            musicPlayerState.playlist = [track];
            musicPlayerState.currentIndex = 0;

            await fetchLyrics();

            musicPlayerState.playlist = originalPlaylist;
            musicPlayerState.currentIndex = originalIndex;

            if (musicPlayerState.lyricsCache[trackId]) {
              showNotification(
                `<i class="fas fa-subtitles"></i> ${config.languageLabels.syncSingle}`,
                2000,
                'db'
              );
                return true;
            }
        }
    } catch (err) {
        console.error('Şarkı sözü güncelleme hatası:', err);
        showNotification(
                `<i class="fas fa-subtitles-slash"></i> ${config.languageLabels.syncSingleError}`,
                2000,
                'error'
              );
    }
    return false;
}
