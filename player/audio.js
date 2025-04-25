import { musicPlayerState } from "../core/state.js";
import { playNext } from "./playback.js";

export function handleSongEnd() {
  switch(musicPlayerState.userSettings.repeatMode) {
    case 'one':
      musicPlayerState.audio.currentTime = 0;
      musicPlayerState.audio.play().catch(e => console.error("Oynatma hatası:", e));
      break;
    case 'all':
      playNext();
      break;
    default:
      if (musicPlayerState.currentIndex < musicPlayerState.playlist.length - 1) {
        playNext();
      }
  }
}
