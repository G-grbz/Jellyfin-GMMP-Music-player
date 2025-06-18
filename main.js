import { initPlayer, togglePlayerVisibility, isPlayerInitialized } from "./utils/mainIndex.js";
import { refreshPlaylist } from "./core/playlist.js";
import { updateProgress, updateDuration } from "./player/progress.js";
import { checkForNewMusic } from "./ui/artistModal.js";
import { loadJSMediaTags } from "./lyrics/id3Reader.js";
import { getConfig } from "./core/configLoader.js";

function forceSkinHeaderPointerEvents() {
  const apply = () => {
    document.querySelectorAll('html .skinHeader').forEach(el => {
      el.style.setProperty('pointer-events', 'all', 'important');
    });

    const playerToggle = document.querySelector('button#jellyfinPlayerToggle');
    if (playerToggle) {
      playerToggle.style.setProperty('display', 'block', 'important');
      playerToggle.style.setProperty('opacity', '1', 'important');
      playerToggle.style.setProperty('pointer-events', 'all', 'important');
      playerToggle.style.setProperty('background', 'none', 'important');
      playerToggle.style.setProperty('margin-left', '12px', 'important');
      playerToggle.style.setProperty('text-shadow', 'rgb(255, 255, 255) 0px 0px 2px', 'important');
      playerToggle.style.setProperty('color', 'inherit', 'important');
      playerToggle.style.setProperty('cursor', 'pointer', 'important');
      playerToggle.style.setProperty('border', 'none', 'important');
      playerToggle.style.setProperty('font-size', '1.2em', 'important');
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }

  const obs = new MutationObserver(apply);
  obs.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true
  });
}

forceSkinHeaderPointerEvents();

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
  btn.setAttribute("aria-label", "GMMP Aç/Kapa");
  btn.title = "GMMP";
  btn.innerHTML = `<i class="fas fa-play-pause fa-lg" aria-hidden="true"></i>`;
  Object.assign(btn.style, {
    marginLeft: "12px",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "inherit",
    textShadow: '0px 0px 3px #ffffff',
    fontSize: "1.2em",
  });
  return btn;
}

async function onToggleClick() {
  try {
    forceSkinHeaderPointerEvents();
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
    forceSkinHeaderPointerEvents();
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
  document.addEventListener("DOMContentLoaded", function() {
    forceSkinHeaderPointerEvents();
    addPlayerButton();
  });
} else {
  forceSkinHeaderPointerEvents();
  addPlayerButton();
}
