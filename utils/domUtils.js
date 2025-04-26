export function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function setupMobileTouchControls() {
  const controls = document.querySelector('.player-controls');
  if (!controls) return;

  let startX, scrollLeft;
  let isDragging = false;

  controls.addEventListener('touchstart', (e) => {
    isDragging = true;
    startX = e.touches[0].pageX - controls.offsetLeft;
    scrollLeft = controls.scrollLeft;
  }, { passive: false });

  controls.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.touches[0].pageX - controls.offsetLeft;
    const walk = (x - startX) * 2;
    controls.scrollLeft = scrollLeft - walk;
  }, { passive: false });

  controls.addEventListener('touchend', () => {
    isDragging = false;
  });
}
