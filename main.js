import { initPlayer, togglePlayerVisibility, isPlayerInitialized } from "./utils/mainIndex.js";
import { refreshPlaylist } from "./core/playlist.js";
import { updateProgress, updateDuration } from "./player/progress.js";
import { checkForNewMusic } from "./ui/artistModal.js";
import { loadJSMediaTags } from "./lyrics/id3Reader.js";
import { getConfig } from "./core/configLoader.js";

const config = getConfig();

function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Zaman aşımı bekleniyor ${selector}`));
    }, timeout);
  });
}

export function loadCSS() {
  const { playerTheme: theme = 'dark', playerStyle = 'player', fullscreenMode = false } = getConfig();
  document.querySelectorAll('link[data-jellyfin-player-css]').forEach(l => l.remove());

  const baseLink = document.createElement('link');
  baseLink.rel = 'stylesheet';
  baseLink.setAttribute('data-jellyfin-player-css', 'base');
  baseLink.href = `./GMMP/src/${playerStyle}-${theme}.css`;
  document.head.appendChild(baseLink);

  if (fullscreenMode && isMobileDevice()) {
    const fsLink = document.createElement('link');
    fsLink.rel = 'stylesheet';
    fsLink.setAttribute('data-jellyfin-player-css', 'fullscreen');
    fsLink.href = `./GMMP/src/fullscreen.css`;
    document.head.appendChild(fsLink);
  }
}

export function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function createPlayerButton() {
  const btn = document.createElement("button");
  btn.id = "jellyfinPlayerToggle";
  btn.setAttribute("aria-label", "Müzik Oynatıcıyı Aç/Kapa");
  btn.title = "Müzik Oynatıcı";
  btn.innerHTML = `<i class="fas fa-play-pause fa-lg" aria-hidden="true"></i>`;
  Object.assign(btn.style, {
    marginLeft: "12px",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "inherit",
    fontSize: "1.2em"
  });
  return btn;
}

async function onToggleClick() {
  try {
    if (!isPlayerInitialized()) {
      await loadJSMediaTags();
      checkForNewMusic();

      await initPlayer();
      await new Promise(resolve => setTimeout(resolve, 500));

      togglePlayerVisibility();
      await refreshPlaylist();

      setTimeout(() => {
        updateDuration();
        updateProgress();
      }, 1000);
    } else {
      togglePlayerVisibility();
      checkForNewMusic();
    }
  } catch (err) {
    console.error("GMMP geçiş hatası:", err);
  }
}

export async function addPlayerButton() {
  try {
    loadCSS();
    const header = await waitForElement(".headerRight");
    if (document.getElementById("jellyfinPlayerToggle")) return;

    const btn = createPlayerButton();
    header.insertBefore(btn, header.firstChild);
    btn.addEventListener("click", onToggleClick);
  } catch (err) {
    console.error("GMMP butonu eklenemedi:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", addPlayerButton);
} else {
  addPlayerButton();
}
