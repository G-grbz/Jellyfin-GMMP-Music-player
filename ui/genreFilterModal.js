import { musicPlayerState } from "../core/state.js";
import { getConfig } from "../core/configLoader.js";
import { getAuthToken } from "../core/auth.js";
import { showNotification } from "../ui/notification.js";
import { refreshPlaylist } from "../core/playlist.js";

const config = getConfig();

export async function showGenreFilterModal() {
  try {
    const token = getAuthToken();
    const response = await fetch(`/MusicGenres?Recursive=true&IncludeItemTypes=MusicAlbum,Audio&Fields=PrimaryImageAspectRatio&EnableTotalRecordCount=false`, {
      headers: { 'X-Emby-Token': token }
    });

    if (!response.ok) throw new Error('Türler alınamadı');

    const data = await response.json();
    const genres = data.Items || [];

    if (genres.length === 0) {
      showNotification(
        `<i class="fas fa-exclamation-circle"></i> ${config.languageLabels.noGenresFound}`,
        2000,
        'error'
      );
      return;
    }

    console.log('Alınan türler:', genres);

    const modal = document.createElement('div');
    modal.className = 'genre-filter-modal';
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('role', 'dialog');

    const modalContent = document.createElement('div');
    modalContent.className = 'genre-filter-modal-content';

    const header = document.createElement('div');
    header.className = 'genre-filter-header';

    const title = document.createElement('h3');
    title.innerHTML = `<i class="fas fa-filter"></i> ${config.languageLabels.filterByGenre}`;
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'genre-filter-close';
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.onclick = () => document.body.removeChild(modal);
    closeBtn.setAttribute('aria-label', 'Close modal');
    header.appendChild(closeBtn);

    const searchContainer = document.createElement('div');
    searchContainer.className = 'genre-search-container';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = config.languageLabels.searchGenres;
    searchInput.className = 'genre-filter-search';
    searchInput.addEventListener('input', (e) => filterGenres(e.target.value.toLowerCase()));

    const searchIcon = document.createElement('i');
    searchIcon.className = 'fas fa-search genre-search-icon';
    searchContainer.append(searchIcon, searchInput);

    const genresContainer = document.createElement('div');
    genresContainer.className = 'genre-filter-container';

    const selectedCount = document.createElement('div');
    selectedCount.className = 'genre-selected-count';
    selectedCount.innerHTML = `<i class="fas fa-music"></i> ${getSelectedCountText()}`;

    const actionButtons = document.createElement('div');
    actionButtons.className = 'genre-filter-actions';

    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'genre-filter-select-all';
    selectAllBtn.innerHTML = `<i class="fas fa-check-double"></i> ${config.languageLabels.selectAll}`;
    selectAllBtn.onclick = selectAllGenres;

    const selectNoneBtn = document.createElement('button');
    selectNoneBtn.className = 'genre-filter-select-none';
    selectNoneBtn.innerHTML = `<i class="far fa-square"></i> ${config.languageLabels.selectNone}`;
    selectNoneBtn.onclick = selectNoGenres;

    const clearFilterBtn = document.createElement('button');
    clearFilterBtn.className = 'genre-filter-clear';
    clearFilterBtn.innerHTML = `<i class="fas fa-eraser"></i> ${config.languageLabels.clearFilter}`;
    clearFilterBtn.onclick = clearGenreFilter;

    const applyBtn = document.createElement('button');
    applyBtn.className = 'genre-filter-apply primary';
    applyBtn.innerHTML = `<i class="fas fa-check-circle"></i> ${config.languageLabels.applyFilter}`;
    applyBtn.onclick = applyGenreFilter;

    actionButtons.append(selectAllBtn, selectNoneBtn, clearFilterBtn, applyBtn);

    const sortedGenres = [...genres].sort((a, b) => a.Name.localeCompare(b.Name));
    let currentLetter = '';

    sortedGenres.forEach(genre => {
      const firstLetter = genre.Name.charAt(0).toUpperCase();

      if (firstLetter !== currentLetter) {
        currentLetter = firstLetter;
        const letterHeader = document.createElement('div');
        letterHeader.className = 'genre-letter-header';
        letterHeader.textContent = currentLetter;
        genresContainer.appendChild(letterHeader);
      }

      const genreItem = document.createElement('div');
      genreItem.className = 'genre-filter-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'genre-checkbox';
      checkbox.id = `genre-${genre.Name}`;
      checkbox.value = genre.Name;
      checkbox.checked = Array.isArray(musicPlayerState.selectedGenres) &&
                        musicPlayerState.selectedGenres.includes(genre.Name);

      const label = document.createElement('label');
      label.htmlFor = `genre-${genre.Name}`;
      label.innerHTML = `<i class="fas fa-headphones-alt genre-icon"></i> ${genre.Name}`;

      genreItem.append(checkbox, label);
      genresContainer.appendChild(genreItem);
    });

    updateSelectedCount();

    modalContent.append(
      header,
      searchContainer,
      genresContainer,
      selectedCount,
      actionButtons
    );

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(modal);
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    function filterGenres(searchTerm) {
      document.querySelectorAll('.genre-filter-item, .genre-letter-header').forEach(item => {
        if (item.classList.contains('genre-letter-header')) {
          item.style.display = 'none';
          const nextElements = [];
          let next = item.nextElementSibling;
          while (next && !next.classList.contains('genre-letter-header')) {
            nextElements.push(next);
            next = next.nextElementSibling;
          }

          const hasVisible = nextElements.some(el => {
            const genreName = el.textContent.toLowerCase();
            return genreName.includes(searchTerm) && el.style.display !== 'none';
          });

          item.style.display = hasVisible ? 'block' : 'none';
        } else {
          const genreName = item.textContent.toLowerCase();
          item.style.display = genreName.includes(searchTerm) ? 'flex' : 'none';
        }
      });
    }

    function getSelectedCountText() {
      const checkboxes = document.querySelectorAll('.genre-checkbox');
      const selectedCheckboxes = Array.from(checkboxes).filter(cb => cb.checked);
      const selected = selectedCheckboxes.length;
      const total = checkboxes.length;

      if (selected === 0 && Array.isArray(musicPlayerState.selectedGenres)) {
        return `${musicPlayerState.selectedGenres.length} ${config.languageLabels.genresSelected}`;
      }

      if (selected === 0) {
        return config.languageLabels.noGenresSelected;
      }

      if (selected === total) {
        return config.languageLabels.allGenresSelected;
      }

      return `${selected} ${config.languageLabels.genresSelected}`;
    }

    function updateSelectedCount() {
      selectedCount.innerHTML = `<i class="fas fa-music"></i> ${getSelectedCountText()}`;
    }

    function selectAllGenres() {
      const checkboxes = document.querySelectorAll('.genre-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = true;
      });
      updateSelectedCount();
      showNotification(
        `<i class="fas fa-check-circle"></i> ${checkboxes.length} ${config.languageLabels.genresSelected}`,
        2000,
        'success'
      );
    }

    function selectNoGenres() {
      document.querySelectorAll('.genre-checkbox').forEach(cb => {
        cb.checked = false;
      });
      updateSelectedCount();
      showNotification(
        `<i class="far fa-square"></i> ${config.languageLabels.noGenresSelected}`,
        2000,
        'info'
      );
    }

    function clearGenreFilter() {
      document.querySelectorAll('.genre-checkbox').forEach(cb => {
        cb.checked = false;
      });
      musicPlayerState.selectedGenres = [];
      refreshPlaylist();
      updateSelectedCount();
      showNotification(
        `<i class="fas fa-broom"></i> ${config.languageLabels.filterCleared}`,
        2000,
        'success'
      );
    }

    function applyGenreFilter() {
      const selectedGenres = Array.from(document.querySelectorAll('.genre-checkbox:checked'))
        .map(cb => cb.value);
      musicPlayerState.selectedGenres = selectedGenres;
      refreshPlaylist();
      document.body.removeChild(modal);
      document.removeEventListener('keydown', handleKeyDown);
    }

    document.querySelectorAll('.genre-checkbox').forEach(cb => {
      cb.addEventListener('change', updateSelectedCount);
    });

  } catch (error) {
    console.error('Tür filtresi açılırken hata:', error);
    showNotification(
      `<i class="fas fa-exclamation-triangle"></i> ${config.languageLabels.genreFilterError}`,
      2000,
      'error'
    );
  }
}
