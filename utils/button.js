import { musicPlayerState } from "./core/state.js";
import { initPlayer } from "./mainIndex.js";
import { togglePlayerVisibility } from "./ui/playerUI.js";

export function createPlayButton() {
  const button = document.createElement("button");
  button.className = "music-button";
  button.innerHTML = '<i class="fas fa-music"></i>';
  button.addEventListener("click", () => {
    if (!musicPlayerState.playlist.length) {
      initPlayer();
    } else {
      togglePlayerVisibility();
    }
  });

  return button;
}
