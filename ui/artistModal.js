import { musicPlayerState } from "../core/state.js";
import { getAuthToken } from "../core/auth.js";
import { playTrack } from "../player/playback.js";
import { showNotification } from "../ui/notification.js";
import { saveCurrentPlaylistToJellyfin } from "../core/playlist.js";
import { fetchJellyfinPlaylists } from "../core/jellyfinPlaylists.js";
import { getConfig } from "../core/configLoader.js";

const config = getConfig();
const DEFAULT_ARTWORK = "url('/web/GMMP/src/images/defaultArt.png')";
const SEARCH_DEBOUNCE_TIME = 300;

let artistModal = null;
let searchDebounceTimer = null;
let allTracks = [];
let selectedTrackIds = new Set();

function getJellyfinCredentials() {
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
        console.error('Jellyfin kimlik bilgileri alınırken hata:', error);
        return { isValid: false };
    }
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

    const saveToPlaylistBtn = document.createElement("div");
    saveToPlaylistBtn.className = "modal-save-to-playlist-btn";
    saveToPlaylistBtn.innerHTML = '<i class="fas fa-save"></i>';
    saveToPlaylistBtn.title = config.languageLabels.saveToPlaylist || "Playlist'e kaydet";
    saveToPlaylistBtn.disabled = selectedTrackIds.size === 0;
    saveToPlaylistBtn.onclick = showSaveToPlaylistModal;

    const headerActions = document.createElement("div");
    headerActions.className = "modal-header-actions";

    const closeBtn = document.createElement("span");
    closeBtn.className = "modal-close-btn";
    closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    closeBtn.onclick = () => toggleArtistModal(false);

    closeContainer.appendChild(fetchAllMusicBtn);
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

    searchContainer.append(searchInput);

    const artistName = document.createElement("h2");
    artistName.className = "modal-artist-name";
    artistName.textContent = "";

    const artistMeta = document.createElement("div");
    artistMeta.className = "modal-artist-meta";

    const tracksCount = document.createElement("span");
    tracksCount.className = "modal-artist-tracks-count";

    const albumCount = document.createElement("span");
    albumCount.className = "modal-artist-album-count";

    artistMeta.append(tracksCount, albumCount);
    artistInfo.append(artistName, artistMeta);
    modalHeader.append(artistImage, artistInfo, searchContainer, headerActions);

    const tracksContainer = document.createElement("div");
    tracksContainer.className = "modal-artist-tracks-container";

    modalContent.append(modalHeader, tracksContainer);
    artistModal.appendChild(modalContent);
    document.body.appendChild(artistModal);

    artistModal.addEventListener("click", (e) => {
        if (e.target === artistModal) toggleArtistModal(false);
    });

    return artistModal;
}

async function loadAllMusicFromJellyfin() {
    const tracksContainer = document.querySelector("#artist-modal .modal-artist-tracks-container");
    tracksContainer.innerHTML = '<div class="modal-loading-spinner"></div>';

    try {
        const { serverUrl, userId, apiKey, isValid } = getJellyfinCredentials();
        let allMusic = [];
        let albums = new Set();
        let artists = new Set();

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

            allMusic.forEach(track => {
                if (track.Album) albums.add(track.Album);
                if (track.Artists) {
                    track.Artists.forEach(artist => artists.add(artist));
                }
                if (track.AlbumArtist) {
                    artists.add(track.AlbumArtist);
                }
            });
        }

        allTracks = [...allMusic];

        displayArtistTracks(allTracks);

        const tracksCountElement = document.querySelector("#artist-modal .modal-artist-tracks-count");
        const albumCountElement = document.querySelector("#artist-modal .modal-artist-album-count");
        const artistNameElement = document.querySelector("#artist-modal .modal-artist-name");

        artistNameElement.textContent = config.languageLabels.allMusic || "Tüm Müzikler";
        tracksCountElement.textContent = `${allTracks.length} ${config.languageLabels.track}`;
        albumCountElement.textContent = `${albums.size} ${config.languageLabels.album}`;

        const artistMeta = document.querySelector("#artist-modal .modal-artist-meta");
        const artistCount = document.createElement("span");
        artistCount.className = "modal-artist-artist-count";
        artistCount.textContent = `${artists.size} ${config.languageLabels.artist}`;

        artistMeta.innerHTML = '';
        artistMeta.append(tracksCountElement, albumCountElement, artistCount);

    } catch (error) {
        console.error("Tüm müzikler yüklenirken hata:", error);
        tracksContainer.innerHTML = `
            <div class="modal-error-message">
                ${config.languageLabels.errorLoadAllMusic || "Tüm müzikler yüklenirken hata oluştu"}
                <div class="modal-error-detail">${error.message}</div>
            </div>
        `;
    }
}

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
    modalTitle.textContent = config.languageLabels.saveToPlaylist || "Playlist'e Ekle";
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
    loadingOption.textContent = config.languageLabels.loadingPlaylists || "Listeler yükleniyor...";
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
                "success"
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

    if (!query) {
        displayArtistTracks(allTracks);
        return;
    }

    const filteredTracks = allTracks.filter(track => {
        const title = track.Name?.toLowerCase() || "";
        const album = track.Album?.toLowerCase() || "";
        return title.includes(query) || album.includes(query);
    });

    displayArtistTracks(filteredTracks);
}

async function loadArtistImage(artistId) {
    const artistImage = document.querySelector("#artist-modal .modal-artist-image");
    const { serverUrl, userId, apiKey, isValid } = getJellyfinCredentials();

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
        console.error("Sanatçı resmi yüklenirken hata:", error);
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
        console.error("Sanatçı detayları alınırken hata:", error);
        return null;
    }
}

async function loadArtistTracks(artistName, artistId) {
    const tracksContainer = document.querySelector("#artist-modal .modal-artist-tracks-container");
    tracksContainer.innerHTML = '<div class="modal-loading-spinner"></div>';

    try {
        const { serverUrl, userId, apiKey, isValid } = getJellyfinCredentials();
        let tracks = [];
        let albums = new Set();
        let artistDetails = null;

        if (artistId) {
            artistDetails = await loadArtistDetails(artistId);
        }

        if (isValid) {
            let tracksUrl = `${window.location.origin}/Users/${userId}/Items?` + new URLSearchParams({
                Recursive: true,
                IncludeItemTypes: "Audio",
                ArtistIds: artistId,
                Fields: "PrimaryImageAspectRatio,MediaSources,AlbumArtist,Album,Artists",
                Limit: 20000,
                SortBy: "Album,SortName",
                api_key: apiKey
            });

            const tracksResponse = await fetch(tracksUrl);
            if (!tracksResponse.ok) throw new Error(`HTTP ${tracksResponse.status}`);
            const tracksData = await tracksResponse.json();
            tracks = tracksData.Items || [];
            tracks.forEach(track => {
                if (track.Album) albums.add(track.Album);
            });
        }

        allTracks = [...tracks];

        displayArtistTracks(allTracks);
        await loadArtistImage(artistId);
        const artistNameElement = document.querySelector("#artist-modal .modal-artist-name");
        const tracksCountElement = document.querySelector("#artist-modal .modal-artist-tracks-count");
        const albumCountElement = document.querySelector("#artist-modal .modal-artist-album-count");

        if (!artistNameElement.textContent.trim()) {
            artistNameElement.textContent = artistName || config.languageLabels.artistUnknown;
        }

        tracksCountElement.textContent = `${allTracks.length} ${config.languageLabels.track}`;
        albumCountElement.textContent = `${albums.size} ${config.languageLabels.album}`;

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
        console.error("Sanatçı şarkıları yüklenirken hata:", error);
        tracksContainer.innerHTML = `
            <div class="modal-error-message">
                ${config.languageLabels.errorAlbum}
                <div class="modal-error-detail">${error.message}</div>
            </div>
        `;
    }
}

function displayArtistTracks(tracks) {
    const tracksContainer = document.querySelector("#artist-modal .modal-artist-tracks-container");
    const headerActions = document.querySelector("#artist-modal .modal-header-actions");
    const { serverUrl, apiKey } = getJellyfinCredentials();

    if (!tracks || tracks.length === 0) {
        tracksContainer.innerHTML = `<div class="modal-no-tracks">${config.languageLabels.noTrack}</div>`;
        clearHeaderActions();
        return;
    }

    tracksContainer.innerHTML = "";
    clearHeaderActions();

    const selectAllContainer = document.createElement("div");
    selectAllContainer.className = "modal-select-all-container";

    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllCheckbox.id = "artist-modal-select-all";
    selectAllCheckbox.className = "modal-select-all-checkbox";
    selectAllCheckbox.title = config.languageLabels.selectAll;

    const selectAllLabel = document.createElement("label");
    selectAllLabel.htmlFor = "artist-modal-select-all";
    selectAllLabel.textContent = config.languageLabels.selectAll;
    selectAllLabel.style.color = "#fff";
    selectAllLabel.style.cursor = "pointer";

    selectAllContainer.appendChild(selectAllCheckbox);
    selectAllContainer.appendChild(selectAllLabel);

    const playSelectedContainer = document.createElement("div");
    playSelectedContainer.className = "modal-play-selected-container";

    const playSelectedBtn = document.createElement("button");
    playSelectedBtn.className = "modal-play-selected-btn";
    playSelectedBtn.title = config.languageLabels.addToExisting;
    playSelectedBtn.innerHTML = '<i class="fa-solid fa-plus-large"></i>';
    playSelectedBtn.disabled = selectedTrackIds.size === 0;

    playSelectedContainer.appendChild(playSelectedBtn);

    if (headerActions) {
        headerActions.appendChild(selectAllContainer);
        headerActions.appendChild(playSelectedContainer);
    }

    function clearHeaderActions() {
      if (!headerActions) return;
      headerActions.innerHTML = "";
    }

    const updateSelectAllState = () => {
        const allSelected = tracks.length > 0 && tracks.every(track => selectedTrackIds.has(track.Id));
        selectAllCheckbox.checked = allSelected;
        playSelectedBtn.disabled = selectedTrackIds.size === 0;
    };

    selectAllCheckbox.addEventListener("change", (e) => {
        const checked = e.target.checked;
        if (checked) {
            tracks.forEach(track => selectedTrackIds.add(track.Id));
        } else {
            tracks.forEach(track => selectedTrackIds.delete(track.Id));
        }
        tracksContainer.querySelectorAll('.modal-track-checkbox').forEach(cb => cb.checked = checked);
        updateSelectAllState();
    });

    playSelectedBtn.addEventListener("click", () => {
        if (selectedTrackIds.size === 0) return;

        const selectedTracks = allTracks.filter(track => selectedTrackIds.has(track.Id));
        if (selectedTracks.length === 0) return;

        const newPlaylist = [...musicPlayerState.playlist];

        selectedTracks.forEach(track => {
            const alreadyExists = newPlaylist.some(t =>
                t.Id === track.Id || t.Name === track.Name
            );
            if (!alreadyExists) {
                newPlaylist.push(track);
            }
        });

        musicPlayerState.playlist = newPlaylist;
        showNotification(`${selectedTracks.length} ${config.languageLabels.tracks}`, 2000);
        toggleArtistModal(false);
    });

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

    Object.keys(albums).sort().forEach(albumKey => {
        const albumHeader = document.createElement("div");
        albumHeader.className = "modal-album-header";

        const albumCover = document.createElement("div");
        albumCover.className = "modal-album-cover";

        const firstTrack = albums[albumKey][0];
        if (firstTrack.AlbumId && (firstTrack.AlbumPrimaryImageTag || firstTrack.PrimaryImageTag)) {
            const imageTag = firstTrack.AlbumPrimaryImageTag || firstTrack.PrimaryImageTag;
            let imageUrl = `${window.location.origin}/Items/${firstTrack.AlbumId}/Images/Primary?fillHeight=100&quality=80&tag=${imageTag}`;
            if (apiKey) imageUrl += `&api_key=${apiKey}`;
            albumCover.style.backgroundImage = `url('${imageUrl}')`;
        } else {
            albumCover.style.backgroundImage = DEFAULT_ARTWORK;
        }

        const albumInfo = document.createElement("div");
        albumInfo.className = "modal-album-info";

        const albumTitle = document.createElement("h3");
        albumTitle.className = "modal-album-title";
        albumTitle.textContent = albumKey;

        const albumYear = document.createElement("div");
        albumYear.className = "modal-album-year";
        albumYear.textContent = firstTrack.ProductionYear || "";

        albumInfo.append(albumTitle, albumYear);
        albumHeader.append(albumCover, albumInfo);
        tracksContainer.appendChild(albumHeader);

        albums[albumKey].forEach((track, index) => {
            const trackElement = document.createElement("div");
            trackElement.className = "modal-artist-track-item";

            const trackCheckbox = document.createElement("input");
            trackCheckbox.type = "checkbox";
            trackCheckbox.className = "modal-track-checkbox";
            trackCheckbox.checked = selectedTrackIds.has(track.Id);
            trackCheckbox.addEventListener("change", (e) => {
                if (e.target.checked) {
                    selectedTrackIds.add(track.Id);
                } else {
                    selectedTrackIds.delete(track.Id);
                }
                updateSelectAllState();
            });

            const trackPosition = document.createElement("div");
            trackPosition.className = "modal-track-position";
            trackPosition.textContent = (index + 1).toString().padStart(2, '0');

            const trackInfo = document.createElement("div");
            trackInfo.className = "modal-track-info";

            const trackTitle = document.createElement("div");
            trackTitle.className = "modal-track-title";
            trackTitle.textContent = track.Name || config.languageLabels.unknownTrack;

            const trackDuration = document.createElement("div");
            trackDuration.className = "modal-track-duration";

            if (track.RunTimeTicks) {
                const seconds = Math.floor(track.RunTimeTicks / 10000000);
                trackDuration.textContent = `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
            } else if (track.Duration) {
                trackDuration.textContent = track.Duration;
            } else {
                trackDuration.textContent = "0:00";
            }

            trackInfo.append(trackTitle);
            trackElement.append(trackCheckbox, trackPosition, trackInfo, trackDuration);

            trackElement.addEventListener("click", (e) => {
                if (e.target.tagName === 'INPUT') return;

                const newPlaylist = [...musicPlayerState.playlist];
                const currentIndex = musicPlayerState.currentIndex;
                const existingIndex = newPlaylist.findIndex(t =>
                    t.Id === track.Id || t.Name === track.Name
                );

                if (existingIndex === -1) {
                    newPlaylist.splice(currentIndex + 1, 0, track);
                    musicPlayerState.playlist = newPlaylist;

                    showNotification(
                        `${config.languageLabels.addingsuccessful}`,
                        2000,
                        'addplaylist'
                    );

                    const newIndex = currentIndex + 1;
                    playTrack(newIndex);
                } else {
                    showNotification(
                        `${config.languageLabels.alreadyInTrack}`,
                        2000,
                        'addplaylist'
                    );
                    playTrack(existingIndex);
                }
            });

            tracksContainer.appendChild(trackElement);
        });
    });

    updateSelectAllState();
}

export async function toggleArtistModal(show, artistName = "", artistId = null) {
    if (!artistModal) createArtistModal();

    if (show) {
        selectedTrackIds = new Set();

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
        } catch (error) {
            console.error("Error loading artist tracks:", error);
            tracksContainer.innerHTML = `
                <div class="modal-error-message">
                    ${config.languageLabels.errorLoadTracks || "Şarkılar yüklenirken hata oluştu"}
                    <div class="modal-error-detail">${error.message}</div>
                </div>
            `;
        }

        setTimeout(() => {
            const searchInput = document.querySelector("#artist-modal .modal-artist-search");
            if (searchInput) searchInput.focus();
        }, 100);
    } else {
        const artistMeta = document.querySelector("#artist-modal .modal-artist-meta");
        if (artistMeta) artistMeta.innerHTML = '';

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
