import { musicPlayerState } from "../core/state.js";
import { getAuthToken } from "../core/auth.js";
import { playTrack } from "../player/playback.js";
import { showNotification } from "../ui/notification.js";
import { saveCurrentPlaylistToJellyfin } from "../core/playlist.js";
import { fetchJellyfinPlaylists } from "../core/jellyfinPlaylists.js";
import { getConfig } from "../core/configLoader.js";
import { musicDB } from "../utils/db.js";
import { updateNextTracks } from "./playerUI.js";
import { shuffleArray } from "../utils/domUtils.js";
import { showStatsModal } from "./statsModal.js";

const config = getConfig();
const DEFAULT_ARTWORK = "url('/web/GMMP/src/images/defaultArt.png')";
const SEARCH_DEBOUNCE_TIME = 300;
const TRACKS_PER_PAGE = config.sarkilimit;
const ALBUMS_PER_PAGE = config.albumlimit;
const BATCH_SIZE = config.gruplimit;
const allNewTracks = [];

let artistModal = null;
let searchDebounceTimer = null;
let allTracks = [];
let selectedTrackIds = new Set();
let currentPage = 1;
let totalPages = 1;
let totalTracks = 20;
let totalArtists = 0;
let totalAlbums = 0;
let currentPaginationMode = 'tracks';

export function getJellyfinCredentials() {
    try {
        const credentials = JSON.parse(sessionStorage.getItem('json-credentials'));
        let serverUrl = credentials?.Servers?.[0]?.RemoteAddress ||
                       credentials?.Servers?.[0]?.LocalAddress ||
                       credentials?.Servers?.[0]?.Url;
        if (serverUrl) {
            serverUrl = serverUrl.replace(/\/$/, '');
            if (!serverUrl.startsWith('http')) {
                serverUrl = window.location.protocol + '//' + serverUrl;
            }
        }

        return {
            serverUrl,
            userId: credentials?.Servers?.[0]?.UserId,
            apiKey: getAuthToken(),
            isValid: !!serverUrl && !!credentials?.Servers?.[0]?.UserId && !!getAuthToken()
        };
    } catch (error) {
        return { isValid: false };
    }
}

function groupTracksByAlbum(tracks) {
    const albums = {};
    tracks.forEach(track => {
        const albumArtist = track.AlbumArtist || track.Artists?.[0] || config.languageLabels.artistUnknown;
        const albumName = track.Album || config.languageLabels.unknownTrack;
        const albumKey = `${albumArtist} - ${albumName}`;

        if (!albums[albumKey]) {
            albums[albumKey] = [];
        }
        albums[albumKey].push(track);
    });
    return albums;
}

export function createArtistModal() {
    if (artistModal) return artistModal;

    artistModal = document.createElement("div");
    artistModal.id = "artist-modal";
    artistModal.className = "modal hidden";
    artistModal.setAttribute("aria-hidden", "true");

    const modalContent = document.createElement("div");
    modalContent.className = "modal-content modal-artist-content";

    const closeContainer = document.createElement("div");
    closeContainer.className = "modal-close-container";

    const fetchAllMusicBtn = document.createElement("div");
    fetchAllMusicBtn.className = "modal-fetch-all-music-btn";
    fetchAllMusicBtn.innerHTML = '<i class="fa-solid fa-music-magnifying-glass"></i>';
    fetchAllMusicBtn.title = config.languageLabels.fetchAllMusic || "Tüm müzikleri getir";
    fetchAllMusicBtn.onclick = loadAllMusicFromJellyfin;

    const fetchNewMusicBtn = document.createElement("div");
    fetchNewMusicBtn.className = "modal-fetch-new-music-btn";
    fetchNewMusicBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i>';
    fetchNewMusicBtn.title = config.languageLabels.syncDB || "Veri tabanını senkronize et";
    fetchNewMusicBtn.onclick = async () => {
    fetchNewMusicBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    showNotification(config.languageLabels.syncStarted || "Senkronizasyon başlatıldı...", 3000, 'db');

    try {
        await checkForNewMusic();
        showNotification(config.languageLabels.syncCompleted || "Senkronizasyon tamamlandı", 3000, 'success');
    } catch (error) {
        console.error('Senkronizasyon hatası:', error);
    } finally {
        fetchNewMusicBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i>';
    }
};

    const saveToPlaylistBtn = document.createElement("div");
    saveToPlaylistBtn.className = "modal-save-to-playlist-btn";
    saveToPlaylistBtn.innerHTML = '<i class="fas fa-save"></i>';
    saveToPlaylistBtn.title = config.languageLabels.saveToPlaylist || "Playlist'e kaydet";
    saveToPlaylistBtn.disabled = selectedTrackIds.size === 0;
    saveToPlaylistBtn.onclick = showSaveToPlaylistModal;

    const showStatsBtn = document.createElement("div");
    showStatsBtn.className = "modal-show-stats-btn";
    showStatsBtn.innerHTML = '<i class="fa-solid fa-chart-simple"></i>';
    showStatsBtn.title = config.languageLabels.stats || "İstatistikleri göster";
    showStatsBtn.onclick = () => showStatsModal();


    const headerActions = document.createElement("div");
    headerActions.className = "modal-header-actions";

    const closeBtn = document.createElement("span");
    closeBtn.className = "modal-close-btn";
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    closeBtn.onclick = () => toggleArtistModal(false);

    closeContainer.appendChild(showStatsBtn);
    closeContainer.appendChild(fetchAllMusicBtn);
    closeContainer.appendChild(fetchNewMusicBtn);
    closeContainer.appendChild(saveToPlaylistBtn);
    closeContainer.appendChild(closeBtn);
    modalContent.appendChild(closeContainer);

    const modalHeader = document.createElement("div");
    modalHeader.className = "modal-artist-header";

    const artistImage = document.createElement("div");
    artistImage.className = "modal-artist-image";
    artistImage.style.backgroundImage = DEFAULT_ARTWORK;

    const artistInfo = document.createElement("div");
    artistInfo.className = "modal-artist-info";

    const searchContainer = document.createElement("div");
    searchContainer.className = "modal-artist-search-container";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "modal-artist-search";
    searchInput.placeholder = config.languageLabels.placeholder;
    searchInput.addEventListener("input", (e) => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            filterArtistTracks(e.target.value);
        }, SEARCH_DEBOUNCE_TIME);
    });

    const clearSearchBtn = document.createElement("span");
    clearSearchBtn.className = "modal-search-clear hidden";
    clearSearchBtn.innerHTML = '<i class="fas fa-times"></i>';
    clearSearchBtn.onclick = () => {
    searchInput.value = "";
    clearSearchBtn.classList.add("hidden");
    filterArtistTracks("");
    };

    searchInput.addEventListener("input", (e) => {
    clearSearchBtn.classList.toggle("hidden", !e.target.value);
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        filterArtistTracks(e.target.value);
    }, SEARCH_DEBOUNCE_TIME);
    });

searchContainer.append(searchInput, clearSearchBtn);

    const artistName = document.createElement("h2");
    artistName.className = "modal-artist-name";
    artistName.textContent = "";

    const artistMeta = document.createElement("div");
    artistMeta.className = "modal-artist-meta";

    const tracksCount = document.createElement("span");
    tracksCount.className = "modal-artist-tracks-count";

    const albumCount = document.createElement("span");
    albumCount.className = "modal-artist-album-count";

    const artistCount = document.createElement("span");
    artistCount.className = "modal-artist-artist-count";

    artistMeta.append(tracksCount, albumCount, artistCount);
    artistInfo.append(artistName, artistMeta);
    modalHeader.append(artistImage, artistInfo, searchContainer, headerActions);

    const tracksContainer = document.createElement("div");
    tracksContainer.className = "modal-artist-tracks-container";

    const paginationContainer = document.createElement("div");
    paginationContainer.className = "modal-pagination-container";
    paginationContainer.style.display = "none";

    modalContent.append(modalHeader, tracksContainer, paginationContainer);
    artistModal.appendChild(modalContent);
    document.body.appendChild(artistModal);

    artistModal.addEventListener("click", (e) => {
        if (e.target === artistModal) toggleArtistModal(false);
    });

    return artistModal;
}


async function loadAllMusicFromJellyfin() {
    const artistModal = document.getElementById("artist-modal");
    if (!artistModal) return;

    const tracksContainer = artistModal.querySelector(".modal-artist-tracks-container");
    const paginationContainer = artistModal.querySelector(".modal-pagination-container");

    if (!tracksContainer || !paginationContainer) return;

    tracksContainer.innerHTML = '<div class="modal-loading-spinner"></div>';
    paginationContainer.style.display = "none";

    try {
        let allMusic = await musicDB.getAllTracks();
        let albums = new Set();
        let artists = new Set();

        if (allMusic.length === 0 || artistModal.querySelector(".modal-fetch-all-music-btn").classList.contains('force-refresh')) {
            const { serverUrl, userId, apiKey, isValid } = getJellyfinCredentials();

            if (isValid) {
                let musicUrl = `${window.location.origin}/Users/${userId}/Items?` + new URLSearchParams({
                    Recursive: true,
                    IncludeItemTypes: "Audio",
                    Fields: "PrimaryImageAspectRatio,MediaSources,AlbumArtist,Album,Artists",
                    Limit: 20000,
                    SortBy: "AlbumArtist,Album,SortName",
                    api_key: apiKey
                });

                const response = await fetch(musicUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                allMusic = data.Items || [];

                await musicDB.saveTracks(allMusic);
            }
        }
        allMusic.forEach(track => {
            if (track.Album) albums.add(track.Album);
            if (track.Artists) {
                track.Artists.forEach(artist => artists.add(artist));
            }
            if (track.AlbumArtist) {
                artists.add(track.AlbumArtist);
            }
        });

        allTracks = [...allMusic];
        totalTracks = allTracks.length;
        totalAlbums = albums.size;
        totalArtists = artists.size;
        currentPage = 1;

        if (currentPaginationMode === 'albums') {
            totalPages = Math.ceil(totalAlbums / ALBUMS_PER_PAGE);
        } else {
            totalPages = Math.ceil(totalTracks / TRACKS_PER_PAGE);
        }

        document.querySelectorAll('.modal-track-checkbox').forEach(checkbox => {
        if (previousSelected.has(checkbox.dataset.trackId)) {
            checkbox.checked = true;
            selectedTrackIds.add(checkbox.dataset.trackId);
        }
    });

        displayPaginatedTracks();
        updatePaginationControls();
        updateStatsDisplay();
        updateSelectAllLabel();
        if (totalPages > 1) {
            paginationContainer.style.display = "flex";
        }

    } catch (error) {
        tracksContainer.innerHTML = `
            <div class="modal-error-message">
                ${config.languageLabels.errorLoadAllMusic || "Tüm müzikler yüklenirken hata oluştu"}
                <div class="modal-error-detail">${error.message}</div>
            </div>
        `;
    }
}

function updateSelectAllLabel() {
    const selectAllLabel = document.querySelector(".modal-select-all-label");
    if (!selectAllLabel) return;

    const textSpan = selectAllLabel.querySelector(".select-all-text");
    const countSpan = selectAllLabel.querySelector(".selected-count");
    const selectAllCheckbox = document.getElementById("artist-modal-select-all");

    if (!textSpan || !countSpan || !selectAllCheckbox) return;

    const totalSelected = selectedTrackIds.size;
    const visibleCheckboxes = document.querySelectorAll('.modal-track-checkbox');

    if (totalSelected === 0) {
        textSpan.textContent = config.languageLabels.selectAll || "Tümünü seç";
        countSpan.textContent = "";
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else {
        textSpan.textContent = `${totalSelected} ${config.languageLabels.tracksSelected}`;

        const totalVisible = visibleCheckboxes.length;
        const selectedVisible = Array.from(visibleCheckboxes).filter(cb => cb.checked).length;

        selectAllCheckbox.checked = selectedVisible === totalVisible && totalVisible > 0;
        selectAllCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < totalVisible;
    }

    const playSelectedBtn = document.querySelector(".modal-play-selected-btn");
    if (playSelectedBtn) {
        playSelectedBtn.disabled = totalSelected === 0;
    }
}


function updateStatsDisplay() {
    const artistModal = document.getElementById("artist-modal");
    if (!artistModal) return;

    const artistNameElement = artistModal.querySelector(".modal-artist-name");
    const tracksCountElement = artistModal.querySelector(".modal-artist-tracks-count");
    const albumCountElement = artistModal.querySelector(".modal-artist-album-count");
    const artistCountElement = artistModal.querySelector(".modal-artist-artist-count");

    if (artistNameElement) artistNameElement.textContent = config.languageLabels.allMusic || "Tüm Müzikler";
    if (tracksCountElement) tracksCountElement.textContent = `${totalTracks} ${config.languageLabels.track || "parça"}`;
    if (albumCountElement) albumCountElement.textContent = `${totalAlbums} ${config.languageLabels.album || "albüm"}`;
    if (artistCountElement) artistCountElement.textContent = `${totalArtists} ${config.languageLabels.artist || "sanatçı"}`;
}

function updatePaginationControls() {
    const paginationContainer = document.querySelector("#artist-modal .modal-pagination-container");
    if (!paginationContainer) return;

    const searchInput = document.querySelector("#artist-modal .modal-artist-search");
    const searchQuery = searchInput?.value.trim().toLowerCase() || "";

    let filteredTracks = allTracks;
    let filteredAlbums = groupTracksByAlbum(allTracks);

    if (searchQuery) {
        filteredTracks = allTracks.filter(track => {
            const title = track.Name?.toLowerCase() || "";
            const album = track.Album?.toLowerCase() || "";
            const artist = track.Artists?.join(" ").toLowerCase() || "";
            const albumArtist = track.AlbumArtist?.toLowerCase() || "";
            return title.includes(searchQuery) ||
                   album.includes(searchQuery) ||
                   artist.includes(searchQuery) ||
                   albumArtist.includes(searchQuery);
        });

        const albums = groupTracksByAlbum(filteredTracks);
        const filteredAlbumKeys = Object.keys(albums).filter(key => {
            return albums[key].some(track => {
                const title = track.Name?.toLowerCase() || "";
                const album = track.Album?.toLowerCase() || "";
                const artist = track.Artists?.join(" ").toLowerCase() || "";
                const albumArtist = track.AlbumArtist?.toLowerCase() || "";
                return title.includes(searchQuery) ||
                       album.includes(searchQuery) ||
                       artist.includes(searchQuery) ||
                       albumArtist.includes(searchQuery);
            });
        });

        filteredAlbums = {};
        filteredAlbumKeys.forEach(key => {
            filteredAlbums[key] = albums[key];
        });
    }

    if (currentPaginationMode === 'albums') {
        totalPages = Math.ceil(Object.keys(filteredAlbums).length / ALBUMS_PER_PAGE);
    } else {
        totalPages = Math.ceil(filteredTracks.length / TRACKS_PER_PAGE);
    }

    if (currentPage > totalPages) {
        currentPage = totalPages > 0 ? totalPages : 1;
    }

    paginationContainer.innerHTML = '';

    const modeToggle = document.createElement("button");
    modeToggle.className = "pagination-mode-toggle";
    modeToggle.textContent = currentPaginationMode === 'albums' ?
        (config.languageLabels.showTracks || "Sadece Şarkıları Listele") :
        (config.languageLabels.showAlbums || "Albüm İsimleri İle Listele");
    modeToggle.onclick = () => {
        currentPaginationMode = currentPaginationMode === 'albums' ? 'tracks' : 'albums';
        currentPage = 1;
        updatePaginationControls();
        displayPaginatedTracks();
        updateSelectAllLabel();
    };

    const prevButton = document.createElement("button");
    prevButton.className = "pagination-button";
    prevButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevButton.disabled = currentPage === 1;
    prevButton.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            displayPaginatedTracks();
            updatePaginationControls();
            updateSelectAllLabel();
        }
    };

    const pageInfo = document.createElement("span");
    pageInfo.className = "pagination-info";
    pageInfo.textContent = `${currentPage} / ${totalPages}`;

    const nextButton = document.createElement("button");
    nextButton.className = "pagination-button";
    nextButton.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextButton.disabled = currentPage >= totalPages;
    nextButton.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            displayPaginatedTracks();
            updatePaginationControls();
            updateSelectAllLabel();
        }
    };

    const totalInfo = document.createElement("span");
    totalInfo.className = "pagination-total";

    if (currentPaginationMode === 'tracks') {
        totalInfo.textContent = searchQuery ?
            `${filteredTracks.length} ${config.languageLabels.track || "parça"}` :
            `${allTracks.length} ${config.languageLabels.track || "parça"}`;
    } else {
        const albumCount = searchQuery ?
            Object.keys(filteredAlbums).length :
            Object.keys(groupTracksByAlbum(allTracks)).length;
        totalInfo.textContent = `${albumCount} ${config.languageLabels.album || "albüm"}`;
    }

    paginationContainer.appendChild(modeToggle);
    paginationContainer.appendChild(prevButton);
    paginationContainer.appendChild(pageInfo);
    paginationContainer.appendChild(nextButton);
    paginationContainer.appendChild(totalInfo);
}

function displayPaginatedTracks() {
    const artistModal = document.getElementById("artist-modal");
    if (!artistModal) return;

    const tracksContainer = artistModal.querySelector(".modal-artist-tracks-container");
    if (!tracksContainer) return;

    const previousSelected = new Set(selectedTrackIds);

    tracksContainer.innerHTML = "";
    if (currentPaginationMode === 'albums') {
        const albums = groupTracksByAlbum(allTracks);
        const albumKeys = Object.keys(albums).sort();
        const searchInput = artistModal.querySelector(".modal-artist-search");

        if (searchInput && searchInput.value.trim()) {
            const query = searchInput.value.trim().toLowerCase();
            const filteredAlbums = {};

            albumKeys.forEach(key => {
                const albumTracks = albums[key];
                const hasMatch = albumTracks.some(track => {
                    const title = track.Name?.toLowerCase() || "";
                    const album = track.Album?.toLowerCase() || "";
                    const artist = track.Artists?.join(" ").toLowerCase() || "";
                    const albumArtist = track.AlbumArtist?.toLowerCase() || "";
                    return title.includes(query) ||
                           album.includes(query) ||
                           artist.includes(query) ||
                           albumArtist.includes(query);
                });

                if (hasMatch) {
                    filteredAlbums[key] = albumTracks;
                }
            });

            const filteredAlbumKeys = Object.keys(filteredAlbums).sort();
            totalPages = Math.ceil(filteredAlbumKeys.length / ALBUMS_PER_PAGE);

            const start = (currentPage - 1) * ALBUMS_PER_PAGE;
            const end = start + ALBUMS_PER_PAGE;
            const paginatedAlbumKeys = filteredAlbumKeys.slice(start, end);

            paginatedAlbumKeys.forEach(key => {
                const albumTracks = filteredAlbums[key];
                displayAlbumWithTracks(albumTracks[0], albumTracks);
            });
        } else {
            totalPages = Math.ceil(albumKeys.length / ALBUMS_PER_PAGE);

            const start = (currentPage - 1) * ALBUMS_PER_PAGE;
            const end = start + ALBUMS_PER_PAGE;
            const paginatedAlbumKeys = albumKeys.slice(start, end);

            paginatedAlbumKeys.forEach(key => {
                const albumTracks = albums[key];
                displayAlbumWithTracks(albumTracks[0], albumTracks);
            });
        }
    } else {
        const start = (currentPage - 1) * TRACKS_PER_PAGE;
        const end = start + TRACKS_PER_PAGE;
        const searchInput = artistModal.querySelector(".modal-artist-search");

        if (searchInput && searchInput.value.trim()) {
            const query = searchInput.value.trim().toLowerCase();
            const filteredTracks = allTracks.filter(track => {
                const title = track.Name?.toLowerCase() || "";
                const album = track.Album?.toLowerCase() || "";
                const artist = track.Artists?.join(" ").toLowerCase() || "";
                const albumArtist = track.AlbumArtist?.toLowerCase() || "";
                return title.includes(query) ||
                       album.includes(query) ||
                       artist.includes(query) ||
                       albumArtist.includes(query);
            });

            totalPages = Math.ceil(filteredTracks.length / TRACKS_PER_PAGE);
            const paginatedTracks = filteredTracks.slice(start, end);
            displayTracksWithoutAlbums(paginatedTracks);
        } else {
            totalPages = Math.ceil(allTracks.length / TRACKS_PER_PAGE);
            const paginatedTracks = allTracks.slice(start, end);
            displayTracksWithoutAlbums(paginatedTracks);
        }
    }

    setTimeout(() => {
    document.querySelectorAll('.modal-track-checkbox').forEach(checkbox => {
        if (selectedTrackIds.has(checkbox.dataset.trackId)) {
            checkbox.checked = true;
        } else {
            checkbox.checked = false;
        }
    });
    updateSelectAllLabel();
    updatePaginationControls();
}, 0);
}

function displayAlbumWithTracks(album, tracks) {
    const artistModal = document.getElementById("artist-modal");
    if (!artistModal) return;

    const tracksContainer = artistModal.querySelector(".modal-artist-tracks-container");
    if (!tracksContainer) return;

    const albumHeader = createAlbumHeader(album, getJellyfinCredentials().apiKey);
    tracksContainer.appendChild(albumHeader);

    tracks.forEach((track, index) => {
        const trackElement = createTrackElement(track, index, true);
        tracksContainer.appendChild(trackElement);
    });
}

function displayPaginatedAlbums() {
    const start = (currentPage - 1) * ALBUMS_PER_PAGE;
    const end = start + ALBUMS_PER_PAGE;
    const albums = {};
    allTracks.forEach(track => {
        const albumArtist = track.AlbumArtist || track.Artists?.[0] || config.languageLabels.artistUnknown;
        const albumName = track.Album || config.languageLabels.unknownTrack;
        const albumKey = `${albumArtist} - ${albumName}`;

        if (!albums[albumKey]) {
            albums[albumKey] = [];
        }
        albums[albumKey].push(track);
    });

    const albumKeys = Object.keys(albums).sort();
    const paginatedAlbumKeys = albumKeys.slice(start, end);
    const paginatedTracks = [];
    paginatedAlbumKeys.forEach(key => {
        paginatedTracks.push(...albums[key]);
    });

    displayArtistTracks(paginatedTracks);
}


export async function checkForNewMusic() {
    try {
        const { serverUrl, userId, apiKey, isValid } = getJellyfinCredentials();
        if (!isValid) return;

        const allMusicUrl = `${window.location.origin}/Users/${userId}/Items?` + new URLSearchParams({
            Recursive: true,
            IncludeItemTypes: "Audio",
            Fields: "PrimaryImageAspectRatio,MediaSources,AlbumArtist,Album,Artists,Genres",
            Limit: 20000,
            SortBy: "DateCreated",
            SortOrder: "Ascending",
            api_key: apiKey
        });

        const allMusicResponse = await fetch(allMusicUrl);
        if (!allMusicResponse.ok) throw new Error(`HTTP ${allMusicResponse.status}`);
        const allMusicData = await allMusicResponse.json();
        const currentTracks = allMusicData.Items || [];
        const currentTrackIds = new Set(currentTracks.map(item => item.Id));

        const dbTracks = await musicDB.getAllTracks();
        const dbTrackIds = new Set(dbTracks.map(track => track.Id));

        const deletedTrackIds = new Set();
        dbTrackIds.forEach(id => {
            if (!currentTrackIds.has(id)) {
                deletedTrackIds.add(id);
            }
        });

        const newTrackIds = new Set();
        currentTrackIds.forEach(id => {
            if (!dbTrackIds.has(id)) {
                newTrackIds.add(id);
            }
        });

        if (deletedTrackIds.size > 0) {
            await musicDB.deleteTracks(Array.from(deletedTrackIds));
        }

        if (newTrackIds.size > 0) {
            const newTracks = currentTracks.filter(track => newTrackIds.has(track.Id));
            await musicDB.addOrUpdateTracks(newTracks);
        }

        await musicDB.addOrUpdateTracks(currentTracks);

        if (newTrackIds.size > 0 || deletedTrackIds.size > 0) {
            let notificationMessage = '';

            if (newTrackIds.size > 0) {
                showNotification(
                    `${newTrackIds.size} ${config.languageLabels.dbnewTracksAdded || "yeni şarkı eklendi"}`,
                    4000,
                    'db'
                );
            }

            if (deletedTrackIds.size > 0) {
                showNotification(
                    `${deletedTrackIds.size} ${config.languageLabels.dbtracksRemoved || "şarkı silindi"}`,
                    4000,
                    'db'
                );
            }
        }

        const artistModal = document.getElementById("artist-modal");
        if (artistModal && !artistModal.classList.contains("hidden")) {
            const artistNameElement = artistModal.querySelector(".modal-artist-name");
            if (artistNameElement) {
                const artistName = artistNameElement.textContent;
                if (artistName === (config.languageLabels.allMusic || "Tüm Müzikler")) {
                    loadAllMusicFromJellyfin();
                } else {
                    const currentTrack = musicPlayerState.playlist?.[musicPlayerState.currentIndex];
                    const artistId = currentTrack?.ArtistItems?.[0]?.Id ||
                                    currentTrack?.AlbumArtistId ||
                                    currentTrack?.ArtistId ||
                                    null;
                    loadArtistTracks(artistName, artistId);
                }
            }
        }

    } catch (error) {
        console.error('Müzik senkronizasyonu sırasında hata:', error);
        showNotification(
            config.languageLabels.syncError || "Senkronizasyon sırasında hata oluştu",
            4000,
            'error'
        );
    }
}

async function getLastTrack() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('DateCreated');
        const request = index.openCursor(null, 'prev');

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            resolve(cursor ? cursor.value : null);
        };
        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

document.addEventListener('DOMContentLoaded', () => {

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data.type === 'newMusicAdded') {
                showNotification(
                    `${event.data.count} ${config.languageLabels.dbnewTracksAdded || "yeni şarkı eklendi"}`,
                    "info"
                );
            }
        });
    }
});

async function showSaveToPlaylistModal() {
    if (selectedTrackIds.size === 0) {
        showNotification(config.languageLabels.noSelection || "Hiç şarkı seçilmedi", "warning");
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
    nameInput.value = `${artistModal.querySelector(".modal-artist-name").textContent} - ${new Date().toLocaleString('tr-TR', {
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
            showNotification(
                `${tracksToSave.length} ${config.languageLabels.track} ${isNew ? config.languageLabels.playlistCreatedSuccessfully : config.languageLabels.addingsuccessful}`,
                "addlist"
            );
            closeModal();
        } catch (err) {
            console.error(err);
            showNotification(config.languageLabels.playlistSaveError, "error");
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

function filterArtistTracks(query) {
    query = query.trim().toLowerCase();
    const artistModal = document.getElementById("artist-modal");

    if (!query) {
        const artistNameElement = artistModal.querySelector(".modal-artist-name");
        if (artistNameElement) {
            const artistName = artistNameElement.textContent;
            if (artistName === (config.languageLabels.allMusic || "Tüm Müzikler")) {
                loadAllMusicFromJellyfin();
            } else {
                const currentTrack = musicPlayerState.playlist?.[musicPlayerState.currentIndex];
                const artistId = currentTrack?.ArtistItems?.[0]?.Id ||
                                currentTrack?.AlbumArtistId ||
                                currentTrack?.ArtistId ||
                                null;
                loadArtistTracks(artistName, artistId);
            }
        }
        return;
    }

    currentPage = 1;
    updatePaginationControls();
    displayPaginatedTracks();
    updateSelectAllLabel();

    const filteredTracks = allTracks.filter(track => {
        const title = track.Name?.toLowerCase() || "";
        const album = track.Album?.toLowerCase() || "";
        const artist = track.Artists?.join(" ").toLowerCase() || "";
        const albumArtist = track.AlbumArtist?.toLowerCase() || "";
        return title.includes(query) ||
               album.includes(query) ||
               artist.includes(query) ||
               albumArtist.includes(query);
    });

    currentPage = 1;

    if (currentPaginationMode === 'albums') {
        const albums = groupTracksByAlbum(filteredTracks);
        totalPages = Math.ceil(Object.keys(albums).length / ALBUMS_PER_PAGE);
    } else {
        totalPages = Math.ceil(filteredTracks.length / TRACKS_PER_PAGE);
    }

    updatePaginationControls();
    displayPaginatedTracks();
    updateSelectAllLabel();
}

async function loadArtistImage(artistId) {
    const artistImage = document.querySelector("#artist-modal .modal-artist-image");
    const { serverUrl, apiKey, isValid } = getJellyfinCredentials();

    if (!isValid || !artistId) {
        artistImage.style.backgroundImage = DEFAULT_ARTWORK;
        return;
    }

    try {
        let primaryImageUrl = `${window.location.origin}/Items/${artistId}/Images/Primary?fillHeight=300&quality=96`;
        if (apiKey) primaryImageUrl += `&api_key=${apiKey}`;

        const img = new Image();
        img.src = primaryImageUrl;

        img.onload = () => {
            artistImage.style.backgroundImage = `url('${primaryImageUrl}')`;
        };

        img.onerror = () => {
            artistImage.style.backgroundImage = DEFAULT_ARTWORK;
        };

    } catch (error) {
        artistImage.style.backgroundImage = DEFAULT_ARTWORK;
    }
}

async function loadArtistDetails(artistId) {
    const { serverUrl, userId, apiKey, isValid } = getJellyfinCredentials();
    if (!isValid || !artistId) return null;

    try {
        const url = `${window.location.origin}/Users/${userId}/Items/${artistId}?api_key=${apiKey}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const artistName = data.Name || data.OriginalTitle || config.languageLabels.artistUnknown;
        document.querySelector("#artist-modal .modal-artist-name").textContent = artistName;

        return data;
    } catch (error) {
        return null;
    }
}

async function loadArtistTracks(artistName, artistId) {
    const artistModal = document.getElementById("artist-modal");
    if (!artistModal) return;

    const tracksContainer = artistModal.querySelector(".modal-artist-tracks-container");
    const paginationContainer = artistModal.querySelector(".modal-pagination-container");

    if (!tracksContainer || !paginationContainer) return;

    tracksContainer.innerHTML = '<div class="modal-loading-spinner"></div>';
    paginationContainer.style.display = "none";

    try {
        let tracks = [];
        let albums = new Set();
        let artists = new Set();
        let artistDetails = null;

        const dbTracks = await musicDB.getAllTracks();

        if (artistId) {
            tracks = dbTracks.filter(track =>
                track.ArtistItems?.some(artist => artist.Id === artistId) ||
                track.AlbumArtistId === artistId ||
                track.ArtistId === artistId
            );

            artistDetails = await loadArtistDetails(artistId);
        } else {
            tracks = dbTracks.filter(track =>
                track.Artists?.includes(artistName) ||
                track.AlbumArtist === artistName
            );
        }

        tracks.forEach(track => {
            if (track.Album) albums.add(track.Album);
            if (track.Artists) track.Artists.forEach(artist => artists.add(artist));
            if (track.AlbumArtist) artists.add(track.AlbumArtist);
        });

        allTracks = [...tracks];
        totalTracks = allTracks.length;
        totalAlbums = albums.size;
        totalArtists = artists.size;

        currentPage = 1;
        totalPages = Math.ceil(totalTracks / TRACKS_PER_PAGE);

        displayPaginatedTracks();
        updatePaginationControls();
        updateSelectAllLabel();

        const artistNameElement = artistModal.querySelector(".modal-artist-name");
        const tracksCountElement = artistModal.querySelector(".modal-artist-tracks-count");
        const albumCountElement = artistModal.querySelector(".modal-artist-album-count");
        const artistCountElement = artistModal.querySelector(".modal-artist-artist-count");

        if (artistNameElement) artistNameElement.textContent = artistName || config.languageLabels.artistUnknown;
        if (tracksCountElement) tracksCountElement.textContent = `${totalTracks} ${config.languageLabels.track || "parça"}`;
        if (albumCountElement) albumCountElement.textContent = `${totalAlbums} ${config.languageLabels.album || "albüm"}`;
        if (artistCountElement) artistCountElement.textContent = `${totalArtists} ${config.languageLabels.artist || "sanatçı"}`;

        if (totalPages > 1) {
            paginationContainer.style.display = "flex";
        }

        const oldBio = document.querySelector(".modal-bio-container");
        if (oldBio) oldBio.remove();

        if (artistDetails?.Overview) {
            const bioContainer = document.createElement("div");
            bioContainer.className = "modal-bio-container";

            const bioToggle = document.createElement("button");
            bioToggle.className = "modal-bio-toggle collapsed";
            bioToggle.innerHTML = `<i class="fas fa-chevron-down"></i> ${config.languageLabels.visibleBio}`;

            const artistBio = document.createElement("div");
            artistBio.className = "modal-artist-bio";

            const bioText = artistDetails.Overview;
            const safeBioText = bioText.replace(
                /(?<!\b(?:Mr|Mrs|Ms|Dr|Prof|Sn|St|vs|No|etc|Jr|Sr|Ltd|Inc|Co|Doç|Av|Yrd|Öğr\.?Gör|Arş\.?Gör|Bkz))\.(\s+)(?=\p{Lu})/gu,
                '.<br>'
            );
            artistBio.innerHTML = safeBioText;

            bioToggle.addEventListener("click", () => {
                bioToggle.classList.toggle("collapsed");
                bioToggle.classList.toggle("expanded");
                artistBio.classList.toggle("expanded");

                if (bioToggle.classList.contains("expanded")) {
                    bioToggle.innerHTML = `<i class="fas fa-chevron-up"></i> ${config.languageLabels.hiddenBio}`;
                } else {
                    bioToggle.innerHTML = `<i class="fas fa-chevron-down"></i> ${config.languageLabels.visibleBio}`;
                }
            });

            bioContainer.append(bioToggle, artistBio);
            document.querySelector(".modal-artist-info").appendChild(bioContainer);
        }

    } catch (error) {
        tracksContainer.innerHTML = `
            <div class="modal-error-message">
                ${config.languageLabels.errorAlbum}
                <div class="modal-error-detail">${error.message}</div>
            </div>
        `;
    }
}

function displayArtistTracksWithAlbums(tracks, albumRepresentatives) {
    const artistModal = document.getElementById("artist-modal");
    if (!artistModal) return;

    const tracksContainer = artistModal.querySelector(".modal-artist-tracks-container");
    const headerActions = artistModal.querySelector(".modal-header-actions");
    const { apiKey } = getJellyfinCredentials();

    if (!tracksContainer || !headerActions) return;

    tracksContainer.innerHTML = "";
    setupHeaderActions(headerActions);

    if (!tracks || tracks.length === 0) {
        showNoTracksMessage(tracksContainer);
        return;
    }

    const albums = groupTracksByAlbum(tracks);
    albumRepresentatives.forEach(album => {
        const albumKey = `${album.AlbumArtist || album.Artists?.[0] || config.languageLabels.artistUnknown} - ${album.Album || config.languageLabels.unknownTrack}`;

        if (albums[albumKey]) {
            const albumHeader = createAlbumHeader(album, apiKey);
            tracksContainer.appendChild(albumHeader);
            albums[albumKey].forEach((track, index) => {
                const trackElement = createTrackElement(track, index, true);
                tracksContainer.appendChild(trackElement);
            });
        }
    });

    updateSelectAllState(tracks);
}

function displayTracksWithoutAlbums(tracks) {
    const artistModal = document.getElementById("artist-modal");
    if (!artistModal) return;

    const tracksContainer = artistModal.querySelector(".modal-artist-tracks-container");
    const headerActions = artistModal.querySelector(".modal-header-actions");

    if (!tracksContainer || !headerActions) return;
    tracksContainer.innerHTML = "";
    setupHeaderActions(headerActions);

    if (!tracks || tracks.length === 0) {
        showNoTracksMessage(tracksContainer);
        return;
    }

    tracks.forEach((track, index) => {
        const trackElement = createTrackElement(track, index, false);
        tracksContainer.appendChild(trackElement);
    });

    updateSelectAllState(tracks);
}

function setupHeaderActions(headerActions) {
    headerActions.innerHTML = "";
    const selectAllContainer = document.createElement("div");
    selectAllContainer.className = "modal-select-all-container";

    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllCheckbox.id = "artist-modal-select-all";
    selectAllCheckbox.className = "modal-select-all-checkbox";
    selectAllCheckbox.title = config.languageLabels.selectAll;

    const selectAllLabel = document.createElement("label");
    selectAllLabel.htmlFor = "artist-modal-select-all";
    selectAllLabel.className = "modal-select-all-label";

    const textSpan = document.createElement("span");
    textSpan.className = "select-all-text";
    textSpan.textContent = config.languageLabels.selectAll || "Tümünü seç";

    const countSpan = document.createElement("span");
    countSpan.className = "selected-count";

    selectAllLabel.append(textSpan, countSpan);
    selectAllContainer.append(selectAllCheckbox, selectAllLabel);

    const playSelectedContainer = document.createElement("div");
    playSelectedContainer.className = "modal-play-selected-container";

    const playSelectedBtn = document.createElement("button");
    playSelectedBtn.className = "modal-play-selected-btn";
    playSelectedBtn.title = config.languageLabels.addToExisting;
    playSelectedBtn.innerHTML = '<i class="fa-solid fa-plus-large"></i>';
    playSelectedBtn.disabled = selectedTrackIds.size === 0;
    playSelectedBtn.onclick = handlePlaySelected;

    playSelectedContainer.appendChild(playSelectedBtn);
    headerActions.append(selectAllContainer, playSelectedContainer);

    const updateSelectAllLabel = () => {
    const visibleCheckboxes = document.querySelectorAll('.modal-track-checkbox');
    const visibleTrackIds = Array.from(visibleCheckboxes).map(cb => cb.dataset.trackId);
    const visibleSelectedCount = visibleTrackIds.filter(id => selectedTrackIds.has(id)).length;

    const allVisibleSelected = visibleCheckboxes.length > 0 &&
                                visibleSelectedCount === visibleCheckboxes.length;

    const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

    if (allVisibleSelected) {
        textSpan.textContent = config.languageLabels.allSelected || "Tümü seçildi";
        selectAllCheckbox.checked = true;
    } else if (someVisibleSelected) {
        textSpan.textContent = config.languageLabels.selected || "Seçilen";
        selectAllCheckbox.checked = false;
    } else {
        textSpan.textContent = config.languageLabels.selectAll || "Tümünü seç";
        selectAllCheckbox.checked = false;
    }
    countSpan.textContent = visibleSelectedCount > 0 ? ` (${visibleSelectedCount})` : "";

    playSelectedBtn.disabled = selectedTrackIds.size === 0;
};

    updateSelectAllLabel();

    selectAllCheckbox.addEventListener("change", (e) => {
        const checkboxes = document.querySelectorAll('.modal-track-checkbox');
        const shouldSelect = e.target.checked;

        checkboxes.forEach(checkbox => {
            checkbox.checked = shouldSelect;
            const trackId = checkbox.dataset.trackId;
            if (trackId) {
                if (shouldSelect) {
                    selectedTrackIds.add(trackId);
                } else {
                    selectedTrackIds.delete(trackId);
                }
            }
        });
        updateSelectAllLabel();
    });

    document.addEventListener('change', (e) => {
    if (e.target.classList.contains('modal-track-checkbox')) {
        const trackId = e.target.dataset.trackId;
        if (trackId) {
            if (e.target.checked) {
                selectedTrackIds.add(trackId);
            } else {
                selectedTrackIds.delete(trackId);
            }
        }
        updateSelectAllLabel();
    }
});
}

function createAlbumHeader(album, apiKey) {
    const albumHeader = document.createElement("div");
    albumHeader.className = "modal-album-header";

    const albumCover = document.createElement("div");
    albumCover.className = "modal-album-cover";

    const albumId = album.AlbumId || album.Id;
    const imageTag = album.AlbumPrimaryImageTag || album.PrimaryImageTag;

    if (albumId && imageTag) {
        let imageUrl = `${window.location.origin}/Items/${albumId}/Images/Primary?fillHeight=100&quality=80&tag=${imageTag}`;
        if (apiKey) imageUrl += `&api_key=${apiKey}`;

        const img = new Image();
        img.src = imageUrl;

        img.onload = () => {
            albumCover.style.backgroundImage = `url('${imageUrl}')`;
        };

        img.onerror = () => {
            albumCover.style.backgroundImage = DEFAULT_ARTWORK;
        };
    } else {
        albumCover.style.backgroundImage = DEFAULT_ARTWORK;
    }

    const albumInfo = document.createElement("div");
    albumInfo.className = "modal-album-info";

    const albumTitle = document.createElement("h3");
    albumTitle.className = "modal-album-title";
    albumTitle.textContent = `${album.AlbumArtist || album.Artists?.[0] || config.languageLabels.artistUnknown} - ${album.Album || config.languageLabels.unknownTrack}`;

    const albumYear = document.createElement("div");
    albumYear.className = "modal-album-year";
    albumYear.textContent = album.ProductionYear || "";

    albumInfo.append(albumTitle, albumYear);
    albumHeader.append(albumCover, albumInfo);

    return albumHeader;
}

function createTrackElement(track, index, showPosition = true) {
    const trackElement = document.createElement("div");
    trackElement.className = "modal-artist-track-item";

    const trackCheckbox = document.createElement("input");
    trackCheckbox.type = "checkbox";
    trackCheckbox.className = "modal-track-checkbox";
    trackCheckbox.dataset.trackId = track.Id;
    trackCheckbox.checked = selectedTrackIds.has(track.Id);
    trackCheckbox.addEventListener("change", (e) => {
        if (e.target.checked) {
            selectedTrackIds.add(track.Id);
        } else {
            selectedTrackIds.delete(track.Id);
        }
        updateSelectAllLabel();
        updatePaginationControls();
    });

    if (showPosition) {
        const trackPosition = document.createElement("div");
        trackPosition.className = "modal-track-position";
        trackPosition.textContent = (index + 1).toString().padStart(2, '0');
        trackElement.appendChild(trackPosition);
    }

    const trackInfo = document.createElement("div");
    trackInfo.className = "modal-track-info";

    const trackTitle = document.createElement("div");
    trackTitle.className = "modal-track-title";
    trackTitle.textContent = track.Name || config.languageLabels.unknownTrack;

    if (!showPosition) {
        const trackArtist = document.createElement("div");
        trackArtist.className = "modal-track-artist";
        trackArtist.textContent = track.Artists?.join(", ") || track.AlbumArtist || config.languageLabels.artistUnknown;
        trackInfo.appendChild(trackArtist);

        if (track.ProductionYear) {
            const trackYear = document.createElement("div");
            trackYear.className = "modal-track-year";
            trackYear.textContent = track.ProductionYear;
            trackInfo.appendChild(trackYear);
        }
    }

    const trackDuration = document.createElement("div");
    trackDuration.className = "modal-track-duration";
    trackDuration.textContent = formatDuration(track);

    trackInfo.prepend(trackTitle);
    trackElement.append(trackCheckbox, trackInfo, trackDuration);

    trackElement.addEventListener("click", (e) => {
        if (e.target.tagName === 'INPUT') return;
        handleTrackClick(track);
    });

    return trackElement;
}

function handleTrackClick(track) {
    const newPlaylist = [...musicPlayerState.playlist];
    const currentIndex = musicPlayerState.currentIndex;
    const existingIndex = newPlaylist.findIndex(t => t.Id === track.Id);

    if (existingIndex === -1) {
        newPlaylist.splice(currentIndex + 1, 0, track);
        musicPlayerState.playlist = newPlaylist;
        const newOriginal = [...musicPlayerState.originalPlaylist];
        newOriginal.splice(currentIndex + 1, 0, track);
        musicPlayerState.originalPlaylist = newOriginal;

        showNotification(config.languageLabels.addingsuccessful, 2000, 'addplaylist');
        playTrack(currentIndex + 1);
    } else {
        showNotification(config.languageLabels.alreadyInTrack, 2000, 'addplaylist');
        playTrack(existingIndex);
    }
}


function handlePlaySelected() {
    if (selectedTrackIds.size === 0) return;

    const selectedTracks = allTracks.filter(track => selectedTrackIds.has(track.Id));
    if (selectedTracks.length === 0) return;

    const uniqueTracks = selectedTracks.filter(track =>
    !musicPlayerState.playlist.some(t => t.Id === track.Id)
);

if (uniqueTracks.length === 0) {
    showNotification(config.languageLabels.noTracksToSave, 2000, 'addplaylist');
    return;
}

const duplicateCount = selectedTracks.length - uniqueTracks.length;
if (duplicateCount > 0) {
    const duplicateTracks = selectedTracks.filter(track =>
        musicPlayerState.playlist.some(t => t.Id === track.Id)
    );

    const trackNames = duplicateTracks.slice(0, 3).map(track => track.Name);
    const remainingCount = duplicateCount - 3;

    let message;
    if (duplicateCount <= 3) {
        message = `${config.languageLabels.alreadyInPlaylist} (${duplicateCount}): ${trackNames.join(', ')}`;
    } else {
        message = `${config.languageLabels.alreadyInPlaylist} (${duplicateCount}): ${trackNames.join(', ')} ${config.languageLabels.ayrica} ${remainingCount} ${config.languageLabels.moreTracks}`;
    }

    showNotification(message, 4000, 'addlist');
}

    musicPlayerState.playlist.push(...uniqueTracks);
    musicPlayerState.originalPlaylist.push(...uniqueTracks);
    musicPlayerState.userAddedTracks.push(...uniqueTracks);
    musicPlayerState.effectivePlaylist = [
        ...musicPlayerState.playlist,
        ...musicPlayerState.userAddedTracks
    ];

    if (musicPlayerState.userSettings.shuffle) {
        musicPlayerState.effectivePlaylist = shuffleArray([...musicPlayerState.effectivePlaylist]);
        musicPlayerState.isShuffled = true;
    }

    showNotification(`${uniqueTracks.length} ${config.languageLabels.tracks}`, 2000, 'addplaylist');
    toggleArtistModal(false);
    updateNextTracks();
}


function updateSelectAllState(tracks = []) {
    const selectAllCheckbox = document.querySelector("#artist-modal-select-all");
    const playSelectedBtn = document.querySelector(".modal-play-selected-btn");

    if (!selectAllCheckbox || !playSelectedBtn) return;

    const visibleTracks = tracks.length > 0 ? tracks :
        Array.from(document.querySelectorAll('.modal-track-checkbox'))
            .map(cb => ({ Id: cb.dataset.trackId }));

    const allSelected = visibleTracks.length > 0 &&
        visibleTracks.every(track => selectedTrackIds.has(track.Id));

    selectAllCheckbox.checked = allSelected;
    playSelectedBtn.disabled = selectedTrackIds.size === 0;
}

function showNoTracksMessage(container) {
    container.innerHTML = `<div class="modal-no-tracks">${config.languageLabels.noTrack}</div>`;
}

function formatDuration(track) {
    if (track.RunTimeTicks) {
        const seconds = Math.floor(track.RunTimeTicks / 10000000);
        return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
    }
    return track.Duration || "0:00";
}


export async function toggleArtistModal(show, artistName = "", artistId = null) {
    if (!artistModal) createArtistModal();

    if (show) {
        if (!artistModal.classList.contains("hidden")) {
        } else {
            selectedTrackIds = new Set();
        }

        const tracksContainer = document.querySelector("#artist-modal .modal-artist-tracks-container");
        tracksContainer.innerHTML = '<div class="modal-loading-spinner"></div>';

        document.querySelector("#artist-modal .modal-artist-name").textContent = artistName || config.languageLabels.artistUnknown;
        document.querySelector("#artist-modal .modal-artist-image").style.backgroundImage = DEFAULT_ARTWORK;

        const artistMeta = document.querySelector("#artist-modal .modal-artist-meta");
        artistMeta.innerHTML = '';

        const tracksCountElement = document.createElement("span");
        tracksCountElement.className = "modal-artist-tracks-count";
        tracksCountElement.textContent = config.languageLabels.loading || "Yükleniyor...";

        const albumCountElement = document.createElement("span");
        albumCountElement.className = "modal-artist-album-count";

        artistMeta.append(tracksCountElement, albumCountElement);

        document.querySelector("#artist-modal .modal-artist-search").value = "";

        const oldBio = document.querySelector("#artist-modal .modal-bio-container");
        if (oldBio) oldBio.remove();

        artistModal.style.display = "flex";
        artistModal.classList.remove("hidden");
        artistModal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";

        try {
            await loadArtistTracks(artistName, artistId);

            if (artistId) {
                await loadArtistImage(artistId);
            }
            updateSelectAllLabel();
        } catch (error) {
            console.error("Modal açılırken hata:", error);
        }
    } else {
        artistModal.style.display = "none";
        artistModal.classList.add("hidden");
        artistModal.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
    }
}

export function setupArtistClickHandler() {
    const artistElement = musicPlayerState.modernArtistEl;
    if (artistElement) {
        artistElement.style.cursor = "pointer";
        artistElement.addEventListener("click", async () => {
            const artistName = artistElement.textContent.trim();
            if (artistName && artistName !== config.languageLabels.artistUnknown) {
                const currentTrack = musicPlayerState.playlist?.[musicPlayerState.currentIndex];
                const artistId = currentTrack?.ArtistItems?.[0]?.Id ||
                                currentTrack?.AlbumArtistId ||
                                currentTrack?.ArtistId ||
                                null;

                await toggleArtistModal(true, artistName, artistId);
            }
        });
    }
}
