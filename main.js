import { initPlayer, togglePlayerVisibility, isPlayerInitialized } from "./utils/mainIndex.js";
import { refreshPlaylist } from "./core/playlist.js";
import { updateProgress, updateDuration } from "./player/progress.js";

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

function loadCSS() {
  const cssPath = "./GMMP/src/player.css";
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = cssPath;
  document.head.appendChild(link);
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

