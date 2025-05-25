import { getAuthToken } from "../core/auth.js";
import { getConfig } from "../core/configLoader.js";
import { musicPlayerState } from "../core/state.js";
import { playTrack } from "../player/playback.js";
import { showNotification } from "./notification.js";
import { readID3Tags, arrayBufferToBase64 } from "../lyrics/id3Reader.js";
import { saveCurrentPlaylistToJellyfin } from "../core/playlist.js";
import { fetchJellyfinPlaylists } from "../core/jellyfinPlaylists.js";

const config = getConfig();
const DEFAULT_ARTWORK = "url('/web/GMMP/src/images/defaultArt.png')";

let topTracksOverlay = null;
let activeTab = 'top';
let trackLimit = 20;
let selectedTrackIds = new Set();
let allTracks = [];

export function showTopTracksModal() {
  if (topTracksOverlay) {
    topTracksOverlay.classList.toggle('visible');
    return;
  }

  topTracksOverlay = document.createElement('div');
  topTracksOverlay.className = 'top-tracks-overlay';

  const modal = document.createElement('div');
  modal.className = 'top-tracks-modal';
  modal.id = 'top-tracks-modal';

  const header = document.createElement('div');
  header.className = 'top-tracks-header';

  const title = document.createElement('h3');
  title.className = 'top-tracks-title';
  title.textContent = config.languageLabels.myMusic || 'Müzik Kütüphanem';

  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'top-tracks-actions';

  const limitSelector = document.createElement('select');
  limitSelector.className = 'top-tracks-limit-selector';
  [20,50,100,200,400,600,800,1000].forEach(n => {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = `${n}`;
    if (n === trackLimit) opt.selected = true;
    limitSelector.appendChild(opt);
  });
  limitSelector.onchange = () => {
    trackLimit = parseInt(limitSelector.value, 10);
    loadTracks();
  };
  actionsContainer.appendChild(limitSelector);

  const selectAllBtn = document.createElement('button');
  selectAllBtn.className = 'top-tracks-action-btn';
  selectAllBtn.innerHTML = '<i class="fas fa-check-square"></i>';
  selectAllBtn.title = config.languageLabels.selectAll || 'Tümünü seç';
  selectAllBtn.onclick = toggleSelectAll;
  actionsContainer.appendChild(selectAllBtn);

  const playSelectedBtn = document.createElement('button');
  playSelectedBtn.className = 'top-tracks-action-btn';
  playSelectedBtn.innerHTML = '<i class="fas fa-play"></i>';
  playSelectedBtn.title = config.languageLabels.playSelected || 'Seçilenleri çal';
  playSelectedBtn.disabled = true;
  playSelectedBtn.onclick = playSelectedTracks;
  actionsContainer.appendChild(playSelectedBtn);

  const addToQueueBtn = document.createElement('button');
  addToQueueBtn.className = 'top-tracks-action-btn';
  addToQueueBtn.innerHTML = '<i class="fas fa-plus"></i>';
  addToQueueBtn.title = config.languageLabels.addToQueue || 'Sıraya ekle';
  addToQueueBtn.disabled = true;
  addToQueueBtn.onclick = addSelectedToQueue;
  actionsContainer.appendChild(addToQueueBtn);

  const saveToPlaylistBtn = document.createElement('button');
  saveToPlaylistBtn.className = 'top-tracks-action-btn';
  saveToPlaylistBtn.innerHTML = '<i class="fas fa-save"></i>';
  saveToPlaylistBtn.title = config.languageLabels.saveToPlaylist || 'Listeye kaydet';
  saveToPlaylistBtn.disabled = true;
  saveToPlaylistBtn.onclick = showSaveToPlaylistModal;
  actionsContainer.appendChild(saveToPlaylistBtn);

  const closeBtn = document.createElement('div');
  closeBtn.className = 'top-tracks-close';
  closeBtn.innerHTML = '<i class="fas fa-times"></i>';
  closeBtn.onclick = () => topTracksOverlay.classList.remove('visible');

  header.append(title, actionsContainer, closeBtn);

  const tabContainer = document.createElement('div');
  tabContainer.className = 'top-tracks-tabs';

  ['top','recent','latest'].forEach(tabKey => {
    const tab = document.createElement('div');
    tab.className = 'top-tracks-tab' + (tabKey === activeTab ? ' active' : '');
    tab.dataset.tab = tabKey;
    tab.textContent = {
      top: config.languageLabels.topTracks || 'En Çok Dinlenenler',
      recent: config.languageLabels.recentTracks || 'Son Dinlenenler',
      latest: config.languageLabels.latestTracks || 'Son Eklenenler'
    }[tabKey];
    tab.onclick = () => switchTab(tabKey);
    tabContainer.appendChild(tab);
  });

  const grid = document.createElement('div');
  grid.className = 'top-tracks-grid';

  modal.append(header, tabContainer, grid);
  topTracksOverlay.appendChild(modal);
  document.body.appendChild(topTracksOverlay);

  topTracksOverlay.addEventListener('click', e => {
    if (e.target === topTracksOverlay) {
      topTracksOverlay.classList.remove('visible');
    }
  });

  setTimeout(() => {
    topTracksOverlay.classList.add('visible');
    loadTracks();
  }, 10);
}


function toggleSelectAll() {
  const checkboxes = Array.from(document.querySelectorAll('.top-track-checkbox'));
  if (checkboxes.length === 0) return;

  const allChecked = selectedTrackIds.size === checkboxes.length;

  if (allChecked) {
    checkboxes.forEach(cb => cb.checked = false);
    selectedTrackIds.clear();
  } else {
    checkboxes.forEach(cb => {
      cb.checked = true;
      selectedTrackIds.add(cb.dataset.trackId);
    });
  }

  updateActionButtons();
}


function updateActionButtons() {
  const [selectAllBtn, playBtn, queueBtn, saveBtn] = Array.from(
    document.querySelectorAll('.top-tracks-action-btn')
  );

  const hasSelection = selectedTrackIds.size > 0;
  playBtn.disabled = !hasSelection;
  queueBtn.disabled = !hasSelection;
  saveBtn.disabled = !hasSelection;
}

function playSelectedTracks() {
  if (selectedTrackIds.size === 0) return;

  const selectedTracks = allTracks.filter(track => selectedTrackIds.has(track.Id));
  if (selectedTracks.length === 0) return;

  musicPlayerState.playlist = [...selectedTracks];
  musicPlayerState.originalPlaylist = [...selectedTracks];
  musicPlayerState.currentIndex = 0;

  playTrack(0);
  topTracksModal.classList.remove('visible');

  showNotification(
    `<i class="fas fa-music"></i> ${selectedTracks.length} ${config.languageLabels.tracksPlaying}`,
    2000,
    'success'
  );
}

function addSelectedToQueue() {
  if (selectedTrackIds.size === 0) return;

  const selectedTracks = allTracks.filter(track => selectedTrackIds.has(track.Id));
  if (selectedTracks.length === 0) return;

  musicPlayerState.playlist.push(...selectedTracks);
  musicPlayerState.originalPlaylist.push(...selectedTracks);

  showNotification(
    `<i class="fas fa-plus"></i> ${selectedTracks.length} ${config.languageLabels.track} ${config.languageLabels.tracksAddedToQueue}`,
    2000,
    'success'
  );
}

async function showSaveToPlaylistModal() {
  if (selectedTrackIds.size === 0) {
    showNotification(
      `<i class="fas fa-exclamation-triangle"></i> ${config.languageLabels.noSelection || "Hiç şarkı seçilmedi"}`,
      3000,
      'warning'
    );
    return;
  }

  const modal = document.createElement("div");
  modal.className = "playlist-save-modal";

  const modalContent = document.createElement("div");
  modalContent.className = "playlist-save-modal-content";

  const modalHeader = document.createElement("div");
  modalHeader.className = "playlist-save-modal-header";

  const modalTitle = document.createElement("h3");
  modalTitle.textContent = config.languageLabels.saveToPlaylist || "Seçilenleri Kaydet";
  modalHeader.appendChild(modalTitle);

  const closeButton = document.createElement("span");
  closeButton.className = "playlist-save-modal-close";
  closeButton.innerHTML = '<i class="fas fa-times"></i>';
  closeButton.onclick = () => closeModal();
  modalHeader.appendChild(closeButton);

  const modalBody = document.createElement("div");
  modalBody.className = "playlist-save-modal-body";

  const nameInputContainer = document.createElement("div");
  nameInputContainer.className = "name-input-container";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = config.languageLabels.enterPlaylistName;
  nameInput.value = `${activeTab === 'top' ? config.languageLabels.topTracks : activeTab === 'recent' ? config.languageLabels.recentlyPlayed : config.languageLabels.latestTracks} - ${new Date().toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })}`;
  nameInputContainer.appendChild(nameInput);

  const publicLabel = document.createElement("label");
  publicLabel.className = "public-checkbox-label";
  const publicCheckbox = document.createElement("input");
  publicCheckbox.type = "checkbox";
  publicCheckbox.id = "playlist-public";
  publicLabel.appendChild(publicCheckbox);
  publicLabel.appendChild(document.createTextNode(config.languageLabels.makePlaylistPublic));

  const actionContainer = document.createElement("div");
  actionContainer.className = "action-container";

  const newPlaylistOption = document.createElement("div");
  newPlaylistOption.className = "radio-option";
  const newPlaylistRadio = document.createElement("input");
  newPlaylistRadio.type = "radio";
  newPlaylistRadio.name = "saveAction";
  newPlaylistRadio.id = "new-playlist";
  newPlaylistRadio.value = "new";
  newPlaylistRadio.checked = true;
  newPlaylistRadio.onchange = togglePlaylistSelection;
  const newPlaylistLabel = document.createElement("label");
  newPlaylistLabel.htmlFor = "new-playlist";
  newPlaylistLabel.textContent = config.languageLabels.newPlaylist || "Yeni liste oluştur";
  newPlaylistOption.appendChild(newPlaylistRadio);
  newPlaylistOption.appendChild(newPlaylistLabel);

  const existingPlaylistOption = document.createElement("div");
  existingPlaylistOption.className = "radio-option";
  const existingPlaylistRadio = document.createElement("input");
  existingPlaylistRadio.type = "radio";
  existingPlaylistRadio.name = "saveAction";
  existingPlaylistRadio.id = "existing-playlist";
  existingPlaylistRadio.value = "existing";
  existingPlaylistRadio.onchange = togglePlaylistSelection;
  const existingPlaylistLabel = document.createElement("label");
  existingPlaylistLabel.htmlFor = "existing-playlist";
  existingPlaylistLabel.textContent = config.languageLabels.addToExisting || "Mevcut listeye ekle";
  existingPlaylistOption.appendChild(existingPlaylistRadio);
  existingPlaylistOption.appendChild(existingPlaylistLabel);

  actionContainer.appendChild(newPlaylistOption);
  actionContainer.appendChild(existingPlaylistOption);

  const playlistSelectContainer = document.createElement("div");
  playlistSelectContainer.className = "playlist-select-container";
  playlistSelectContainer.style.display = "none";

  const playlistSelectLabel = document.createElement("label");
  playlistSelectLabel.textContent = config.languageLabels.selectPlaylist || "Liste seçin:";

  const playlistSelect = document.createElement("select");
  playlistSelect.className = "playlist-select";
  playlistSelect.disabled = true;

  const loadingOption = document.createElement("option");
  loadingOption.value = "";
  loadingOption.textContent = config.languageLabels.loadingPlaylists || "Listeler getiriliyor...";
  playlistSelect.appendChild(loadingOption);

  playlistSelectContainer.appendChild(playlistSelectLabel);
  playlistSelectContainer.appendChild(playlistSelect);

  const selectedCountContainer = document.createElement("div");
  selectedCountContainer.className = "selected-count-container";
  selectedCountContainer.textContent = `${selectedTrackIds.size} ${config.languageLabels.tracksSelected || "şarkı seçildi"}`;

  modalBody.appendChild(nameInputContainer);
  modalBody.appendChild(publicLabel);
  modalBody.appendChild(actionContainer);
  modalBody.appendChild(playlistSelectContainer);
  modalBody.appendChild(selectedCountContainer);

  const modalFooter = document.createElement("div");
  modalFooter.className = "playlist-save-modal-footer";

  const saveButton = document.createElement("button");
  saveButton.className = "playlist-save-modal-save";
  saveButton.textContent = config.languageLabels.save || "Kaydet";
  saveButton.onclick = async () => {
    const tracksToSave = allTracks.filter(track => selectedTrackIds.has(track.Id));
    const isNew = newPlaylistRadio.checked;
    const playlistId = isNew ? null : playlistSelect.value;
    const playlistName = isNew ? nameInput.value : playlistSelect.options[playlistSelect.selectedIndex].text;

    try {
      await saveCurrentPlaylistToJellyfin(
        playlistName,
        publicCheckbox.checked,
        tracksToSave,
        isNew,
        playlistId
      );

      const message = isNew
        ? `<i class="fas fa-check-circle"></i> ${config.languageLabels.playlistCreatedSuccessfully} (${tracksToSave.length} ${config.languageLabels.track})`
        : `<i class="fas fa-check-circle"></i> ${tracksToSave.length} ${config.languageLabels.track} ${config.languageLabels.addingsuccessful}`;

      showNotification(message, 3000, 'addlist');
      closeModal();
    } catch (err) {
      console.error(err);
      showNotification(
        `<i class="fas fa-exclamation-circle"></i> ${config.languageLabels.playlistSaveError}`,
        4000,
        'error'
      );
    }
  };

  modalFooter.appendChild(saveButton);
  modalContent.appendChild(modalHeader);
  modalContent.appendChild(modalBody);
  modalContent.appendChild(modalFooter);
  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  loadExistingPlaylists(playlistSelect);

  modal.onclick = (e) => {
    if (e.target === modal) {
      closeModal();
    }
  };

  nameInput.focus();

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      closeModal();
    }
  };
  document.addEventListener("keydown", handleKeyDown);

  function togglePlaylistSelection() {
    const isNew = newPlaylistRadio.checked;
    nameInputContainer.style.display = isNew ? "block" : "none";
    playlistSelectContainer.style.display = isNew ? "none" : "block";
    publicLabel.style.display = isNew ? "block" : "none";
  }

  function closeModal() {
    document.removeEventListener("keydown", handleKeyDown);
    document.body.removeChild(modal);
  }
}

async function loadExistingPlaylists(selectElement) {
  try {
    const playlists = await fetchJellyfinPlaylists();
    selectElement.innerHTML = '';

    if (playlists.length === 0) {
      const noPlaylistOption = document.createElement("option");
      noPlaylistOption.value = "";
      noPlaylistOption.textContent = config.languageLabels.noPlaylists || "Hiç çalma listesi bulunamadı";
      selectElement.appendChild(noPlaylistOption);
      selectElement.disabled = true;
      return;
    }

    playlists.sort((a, b) => a.name.localeCompare(b.name));

    playlists.forEach(playlist => {
      const option = document.createElement("option");
      option.value = playlist.id;
      option.textContent = playlist.name;
      selectElement.appendChild(option);
    });

    selectElement.disabled = false;
  } catch (error) {
    console.error("Listeler yüklenirken hata:", error);
    selectElement.innerHTML = '';

    const errorOption = document.createElement("option");
    errorOption.value = "";
    errorOption.textContent = config.languageLabels.loadError || "Listeler yüklenemedi";
    selectElement.appendChild(errorOption);
    selectElement.disabled = true;
  }
}

function switchTab(tab) {
  if (activeTab === tab) return;

  activeTab = tab;
  selectedTrackIds.clear();
  updateActionButtons();

  const tabs = document.querySelectorAll('.top-tracks-tab');
  tabs.forEach(t => t.classList.remove('active'));
  document.querySelector(`.top-tracks-tab[data-tab="${tab}"]`).classList.add('active');

  loadTracks();
}

async function loadTracks() {
  const grid = document.querySelector('.top-tracks-grid');
  if (!grid) return;

  grid.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>';

  try {
    const token = getAuthToken();
    const userId = await window.ApiClient.getCurrentUserId();

    let apiUrl;
    switch (activeTab) {
      case 'top':
        apiUrl = `/Users/${userId}/Items?SortBy=PlayCount&SortOrder=Descending&IncludeItemTypes=Audio&Recursive=true&Limit=${trackLimit}`;
        break;
      case 'recent':
        apiUrl = `/Users/${userId}/Items?SortBy=DatePlayed&SortOrder=Descending&IncludeItemTypes=Audio&Recursive=true&Limit=${trackLimit}`;
        break;
      case 'latest':
        apiUrl = `/Users/${userId}/Items?SortBy=DateCreated&SortOrder=Descending&IncludeItemTypes=Audio&Recursive=true&Limit=${trackLimit}`;
        break;
      default:
        apiUrl = `/Users/${userId}/Items?SortBy=PlayCount&SortOrder=Descending&IncludeItemTypes=Audio&Recursive=true&Limit=20`;
    }

    const response = await fetch(apiUrl, {
      headers: { "X-Emby-Token": token }
    });

    if (!response.ok) throw new Error('Tracks could not be loaded');

    const data = await response.json();
    allTracks = data.Items || [];

    if (allTracks.length === 0) {
      grid.innerHTML = `<div class="no-tracks">${
        config.languageLabels.noTracks || 'Şarkı bulunamadı'
      }</div>`;
      return;
    }

    grid.innerHTML = '';

    for (const track of allTracks) {
      const trackElement = document.createElement('div');
      trackElement.className = 'top-track-item';
      trackElement.dataset.trackId = track.Id;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'top-track-checkbox';
      checkbox.dataset.trackId = track.Id;
      checkbox.checked = selectedTrackIds.has(track.Id);
      checkbox.addEventListener('change', (e) => {
        const trackId = e.target.dataset.trackId;
        if (e.target.checked) {
          selectedTrackIds.add(trackId);
        } else {
          selectedTrackIds.delete(trackId);
        }
        updateActionButtons();
      });

      const coverElement = document.createElement('div');
      coverElement.className = 'top-track-cover';
      coverElement.style.backgroundImage = DEFAULT_ARTWORK;

      const infoElement = document.createElement('div');
      infoElement.className = 'top-track-info';

      const nameElement = document.createElement('div');
      nameElement.className = 'top-track-name';
      nameElement.textContent = track.Name || config.languageLabels.unknownTrack;

      const artistElement = document.createElement('div');
      artistElement.className = 'top-track-artist';
      artistElement.textContent = track.Artists?.join(', ') || track.AlbumArtist || config.languageLabels.unknownArtist;

      if (activeTab === 'top' && track.PlayCount) {
        const playCountElement = document.createElement('div');
        playCountElement.className = 'top-track-playcount';
        playCountElement.innerHTML = `<i class="fas fa-play"></i> ${track.PlayCount}`;
        infoElement.appendChild(playCountElement);
      }

      if (activeTab === 'recent' && track.UserData?.LastPlayedDate) {
        const lastPlayedElement = document.createElement('div');
        lastPlayedElement.className = 'top-track-lastplayed';
        const playedDate = new Date(track.UserData.LastPlayedDate);
        lastPlayedElement.innerHTML = `<i class="fas fa-clock"></i> ${formatDate(playedDate)}`;
        infoElement.appendChild(lastPlayedElement);
      }

      if (activeTab === 'latest' && track.DateCreated) {
        const addedDateElement = document.createElement('div');
        addedDateElement.className = 'top-track-addeddate';
        const createdDate = new Date(track.DateCreated);
        addedDateElement.innerHTML = `<i class="fas fa-calendar-plus"></i> ${formatDate(createdDate)}`;
        infoElement.appendChild(addedDateElement);
      }

      infoElement.appendChild(nameElement);
      infoElement.appendChild(artistElement);
      trackElement.appendChild(checkbox);
      trackElement.appendChild(coverElement);
      trackElement.appendChild(infoElement);
      grid.appendChild(trackElement);

      loadTrackImage(track, coverElement);

      trackElement.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;

        addAndPlayTrack(track);
      });
    }
  } catch (error) {
    grid.innerHTML = `<div class="error-message">${
      config.languageLabels.loadError || 'Yüklenirken hata oluştu'
    }</div>`;
  }
}

function formatDate(date) {
  const now = new Date();
  const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) {
    return config.languageLabels.today || 'Bugün';
  } else if (diffInDays === 1) {
    return config.languageLabels.yesterday || 'Dün';
  } else if (diffInDays < 7) {
    return `${diffInDays} ${config.languageLabels.daysAgo || 'gün önce'}`;
  } else {
    return date.toLocaleDateString(config.language || 'tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }
}

async function loadTrackImage(track, element) {
  try {
    const imageTag = track.AlbumPrimaryImageTag || track.PrimaryImageTag;
    if (imageTag) {
      const imageId = track.AlbumId || track.Id;
      const imageUrl = `/Items/${imageId}/Images/Primary?fillHeight=300&fillWidth=300&quality=80&tag=${imageTag}`;
      element.style.backgroundImage = `url('${imageUrl}')`;
    }
  } catch (error) {
    console.error('Şarkı görseli yüklenemedi:', error);
  }
}

function addAndPlayTrack(track) {
  const playlist = musicPlayerState.playlist;
  const existingIndex = playlist.findIndex(t => t.Id === track.Id);

  if (existingIndex >= 0) {
    playTrack(existingIndex);
  } else {
    const newIndex = playlist.length;
    playlist.push(track);
    playTrack(newIndex);
  }
}
