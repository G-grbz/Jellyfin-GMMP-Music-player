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

const config = getConfig();
const BATCH_SIZE = config.gruplimit;

export function showStatsModal() {
    const existing = document.getElementById("music-stats-modal");
    if (existing) {
        existing.classList.remove("hidden");
        return;
    }

    const modal = document.createElement("div");
    modal.id = "music-stats-modal";
    modal.className = "modal";

    const modalContent = document.createElement("div");
    modalContent.className = "modal-content modal-stats-content";

    const loadingSpinner = document.createElement("div");
    loadingSpinner.className = "modal-loading-spinner";
    modalContent.appendChild(loadingSpinner);

    const closeRefreshContainer = document.createElement("div");
    closeRefreshContainer.className = "modallist-close-container";

    const closeBtn = document.createElement("span");
    closeBtn.className = "modal-close-btn";
    const closeIcon = document.createElement("i");
    closeIcon.className = "fa-solid fa-xmark";
    closeBtn.appendChild(closeIcon);

    const refreshBtn = document.createElement("span");
    refreshBtn.className = "modal-refresh-btn";
    refreshBtn.title = config.languageLabels.refreshData || "İstatistikleri Yenile";
    const refreshIcon = document.createElement("i");
    refreshIcon.className = "fa-solid fa-rotate";
    refreshBtn.appendChild(refreshIcon);

    closeRefreshContainer.appendChild(refreshBtn);
    closeRefreshContainer.appendChild(closeBtn);

    const title = document.createElement("h2");
    title.className = "modal-stats-title";
    title.textContent = config.languageLabels.statsTitle || "Veritabanı İstatistikleri";

    const modalBody = document.createElement("div");
    modalBody.className = "modal-stats-body";
    modalBody.style.display = "none";

    const statItems = [
    {
        id: "stat-total-tracks",
        className: "stat-item",
        icon: '<i class="fa-solid fa-music"></i>',
        label: config.languageLabels.totalTracks || "Toplam Şarkı"
    },
    {
        id: "stat-total-albums",
        className: "stat-item",
        icon: '<i class="fa-solid fa-compact-disc"></i>',
        label: config.languageLabels.totalAlbums || "Albüm Sayısı"
    },
    {
        id: "stat-total-artists",
        className: "stat-item",
        icon: '<i class="fa-solid fa-user"></i>',
        label: config.languageLabels.totalArtists || "Sanatçı Sayısı"
    },
    {
        id: "stat-db-size",
        className: "stat-item",
        icon: '<i class="fa-solid fa-database"></i>',
        label: config.languageLabels.databaseSize || "Veritabanı Boyutu"
    }
];


    statItems.forEach(item => {
        const el = document.createElement("div");
        el.id = item.id;
        el.className = item.className;
        el.innerHTML = `${item.icon} ${item.label}: <span class="stat-value">...</span>`;
        modalBody.appendChild(el);
    });

    const updatesSection = createStatSection(
        config.languageLabels.recentUpdates || "Son Güncellenenler",
        "stat-recent-updates",
        "show-all-updates",
        config.languageLabels.showAllUpdates || "Diğer Tüm Güncellenenler"
    );
    modalBody.appendChild(updatesSection);


    const deletesSection = createStatSection(
        config.languageLabels.recentDeletes || "Son Silinenler",
        "stat-recent-deletes",
        "show-all-deletes",
        config.languageLabels.showAllDeletes || "Diğer Tüm Silinenler"
    );
    modalBody.appendChild(deletesSection);

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "modal-stats-actions";

    const clearDbBtn = document.createElement("button");
    clearDbBtn.id = "clear-db-btn";
    clearDbBtn.className = "btn btn-danger";
    const clearDbIcon = document.createElement("i");
    clearDbIcon.className = "fa-solid fa-trash";
    clearDbBtn.appendChild(clearDbIcon);
    clearDbBtn.appendChild(document.createTextNode(` ${config.languageLabels.clearDatabase || "Veritabanını Sil"}`));

    const backupSection = document.createElement("div");
    backupSection.className = "stat-section";

    const backupTitle = document.createElement("h3");
    backupTitle.className = "stat-section-title";
    backupTitle.textContent = config.languageLabels.backupRestore || "Yedekle ve Geri Yükle";
    backupSection.appendChild(backupTitle);

    const backupBtn = document.createElement("button");
    backupBtn.id = "backup-db-btn";
    backupBtn.className = "btn btn-primary";
    backupBtn.innerHTML = '<i class="fas fa-download"></i> ' + (config.languageLabels.backupDatabase || "Veritabanını Yedekle");
    backupBtn.onclick = backupDatabase;

    const restoreBtn = document.createElement("button");
    restoreBtn.id = "restore-db-btn";
    restoreBtn.className = "btn btn-warning";
    restoreBtn.innerHTML = '<i class="fas fa-upload"></i> ' + (config.languageLabels.restoreDatabase || "Yedekten Geri Yükle");
    restoreBtn.onclick = () => document.getElementById('restore-file-input').click();

    const restoreFileInput = document.createElement("input");
    restoreFileInput.type = "file";
    restoreFileInput.id = "restore-file-input";
    restoreFileInput.accept = ".json";
    restoreFileInput.style.display = "none";
    restoreFileInput.addEventListener("change", handleRestoreFile);

    actionsDiv.append(backupBtn);
    actionsDiv.appendChild(restoreBtn);
    actionsDiv.appendChild(restoreFileInput);
    actionsDiv.appendChild(clearDbBtn);
    modalBody.appendChild(actionsDiv);

    modalContent.appendChild(closeRefreshContainer);
    modalContent.appendChild(title);
    modalContent.appendChild(modalBody);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    loadStatsIntoModal().finally(() => {
        loadingSpinner.style.display = "none";
        modalBody.style.display = "flex";
    });

    const detailedModal = document.createElement("div");
    detailedModal.id = "detailed-list-modal";
    detailedModal.className = "modal hidden";

    const detailedContent = document.createElement("div");
    detailedContent.className = "modal-content";

    const detailedCloseContainer = document.createElement("div");
    detailedCloseContainer.className = "modallist-close-container";

    const detailedCloseBtn = document.createElement("span");
    detailedCloseBtn.className = "modal-close-btn";
    const detailedCloseIcon = document.createElement("i");
    detailedCloseIcon.className = "fa-solid fa-xmark";
    detailedCloseBtn.appendChild(detailedCloseIcon);

    detailedCloseContainer.appendChild(detailedCloseBtn);

    const detailedListContainer = document.createElement("div");
    detailedListContainer.className = "detailed-list-container";
    detailedListContainer.id = "detailed-list-content";

    const detailedTitleContainer = document.createElement("div");
    detailedTitleContainer.className = "modallist-title-container";

    const detailedTitle = document.createElement("h2");
    detailedTitle.id = "detailed-list-title";

    detailedTitleContainer.appendChild(detailedTitle);

    detailedContent.appendChild(detailedTitleContainer);
    detailedContent.appendChild(detailedCloseContainer);
    detailedContent.appendChild(detailedListContainer);
    detailedModal.appendChild(detailedContent);
    document.body.appendChild(detailedModal);

    closeBtn.onclick = () => modal.classList.add("hidden");
    detailedCloseBtn.onclick = () => detailedModal.classList.add("hidden");

    refreshBtn.onclick = async () => {
        refreshIcon.classList.add("fa-spin");
        await loadStatsIntoModal();
        refreshIcon.classList.remove("fa-spin");
    };

    modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.add("hidden");
    });

    detailedModal.addEventListener("click", (e) => {
        if (e.target === detailedModal) detailedModal.classList.add("hidden");
    });

    const toggleDetailedModal = (title, items, formatter) => {
        const isOpen = !detailedModal.classList.contains("hidden");
        if (isOpen) {
            detailedModal.classList.add("hidden");
        } else {
            const titleEl = document.getElementById("detailed-list-title");
            const contentEl = document.getElementById("detailed-list-content");

            titleEl.textContent = title;
            contentEl.innerHTML = '';

            items.forEach((item, index) => {
                const itemDiv = document.createElement("div");
                itemDiv.className = "detailed-list-item";
                itemDiv.innerHTML = formatter(item, index);
                contentEl.appendChild(itemDiv);
            });

            detailedModal.classList.remove("hidden");
        }
    };

    document.getElementById('show-all-updates').addEventListener('click', async () => {
    const button = document.getElementById('show-all-updates');
    const originalContent = button.innerHTML;

    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    button.disabled = true;

    try {
        const stats = await musicDB.getStats();
        toggleDetailedModal(
            config.languageLabels.allUpdatedTracks || "Son Güncellenen Tüm Parçalar",
            stats.recentlyUpdated,
            formatTrackInfo
        );
    } catch (error) {
        console.error('Güncellenenler yüklenirken hata:', error);
        showNotification(config.languageLabels.loadError || "Yükleme sırasında hata oluştu", 3000, 'error');
    } finally {
        button.innerHTML = originalContent;
        button.disabled = false;
    }
});

    document.getElementById('show-all-deletes').addEventListener('click', async () => {
    const button = document.getElementById('show-all-deletes');
    const originalContent = button.innerHTML;

    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    button.disabled = true;

    try {
        const recentlyDeleted = await musicDB.getRecentlyDeleted();
        const items = recentlyDeleted.map(d => ({
            ...d.trackData,
            deletedAt: d.deletedAt
        }));
        toggleDetailedModal(
            config.languageLabels.allDeletedTracks || "Son Silinen Tüm Parçalar",
            items,
            (item) => formatTrackInfo(item, item.deletedAt)
        );
    } catch (error) {
        console.error('Silinenler yüklenirken hata:', error);
        showNotification(config.languageLabels.loadError || "Yükleme sırasında hata oluştu", 3000, 'error');
    } finally {
        button.innerHTML = originalContent;
        button.disabled = false;
    }
});

    document.getElementById('clear-db-btn').addEventListener('click', async () => {
    const confirmed = confirm(config.languageLabels.confirmClearDatabase || "Tüm veritabanını temizlemek istediğinize emin misiniz? Bu işlem geri alınamaz!");
    if (confirmed) {
        try {
            const db = await musicDB.openDB();
            const transaction = db.transaction(['tracks', 'deletedTracks'], 'readwrite');
            const tracksStore = transaction.objectStore('tracks');
            await new Promise((resolve, reject) => {
                const clearTracksRequest = tracksStore.clear();
                clearTracksRequest.onsuccess = resolve;
                clearTracksRequest.onerror = reject;
            });
            const deletedStore = transaction.objectStore('deletedTracks');
            await new Promise((resolve, reject) => {
                const clearDeletedRequest = deletedStore.clear();
                clearDeletedRequest.onsuccess = resolve;
                clearDeletedRequest.onerror = reject;
            });

            showNotification(
                config.languageLabels.databaseCleared || "Veritabanı başarıyla temizlendi",
                3000,
                'success'
            );
            await loadStatsIntoModal();
        } catch (error) {
            console.error('Veritabanı temizlenirken hata:', error);
            showNotification(
                config.languageLabels.clearDatabaseError || "Veritabanı temizlenirken hata oluştu",
                3000,
                'error'
                );
            }
        }
    });
    loadStatsIntoModal();
}


async function backupDatabase() {
    const backupBtn = document.getElementById('backup-db-btn');
    const originalBackupText = backupBtn.innerHTML;
    backupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' +
                         (config.languageLabels.backupInProgress || "Yedekleniyor...");
    backupBtn.disabled = true;

    try {
        const [allTracks, stats, recentlyDeleted] = await Promise.all([
            musicDB.getAllTracks(),
            musicDB.getStats(),
            musicDB.getRecentlyDeleted()
        ]);

        const backupData = {
            metadata: {
                version: 1,
                createdAt: new Date().toISOString(),
                totalTracks: stats.totalTracks,
                totalAlbums: stats.totalAlbums,
                totalArtists: stats.totalArtists
            },
            tracks: allTracks,
            deletedTracks: recentlyDeleted
        };

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `GMMP-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showNotification(config.languageLabels.backupSuccess || "Veritabanı başarıyla yedeklendi", 3000, 'success');
        }, 100);
    } catch (error) {
        console.error('Yedekleme hatası:', error);
        showNotification(config.languageLabels.backupError || "Yedekleme sırasında hata oluştu", 3000, 'error');
    } finally {
        backupBtn.innerHTML = originalBackupText;
        backupBtn.disabled = false;
    }
}

async function handleRestoreFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const confirmed = confirm(config.languageLabels.confirmRestore || "Veritabanını yedekten geri yüklemek istediğinize emin misiniz? Mevcut verilerin üzerine yazılacak!");
    if (!confirmed) return;
    const restoreBtn = document.getElementById('restore-db-btn');
    const originalRestoreText = restoreBtn.innerHTML;
    restoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' +
                          (config.languageLabels.restoreInProgress || "Geri yükleniyor...");
    restoreBtn.disabled = true;
    const progressContainer = document.createElement('div');
    progressContainer.className = 'restore-progress-container';
    progressContainer.innerHTML = `
        <div class="restore-progress-bar">
            <div class="restore-progress-fill"></div>
        </div>
        <div class="restore-progress-text">0%</div>
    `;
    document.querySelector('.modal-stats-body').appendChild(progressContainer);

    try {
        const fileContent = await readFileAsText(file);
        const backupData = JSON.parse(fileContent);

        if (!backupData.tracks || !Array.isArray(backupData.tracks)) {
            throw new Error(config.languageLabels.invalidBackupFile || "Geçersiz yedek dosyası");
        }

        showNotification(config.languageLabels.restoreStarted || "Geri yükleme başlatıldı...", 3000, 'db');
        const updateProgress = (percentage, message) => {
            const fill = progressContainer.querySelector('.restore-progress-fill');
            const text = progressContainer.querySelector('.restore-progress-text');
            fill.style.width = `${percentage}%`;
            text.textContent = message || `${percentage}%`;
        };

        await musicDB.deleteAllTracks();
        updateProgress(20, config.languageLabels.cleaningDatabase || "Veritabanı temizleniyor...");
        const totalBatches = Math.ceil(backupData.tracks.length / BATCH_SIZE);

        for (let i = 0; i < totalBatches; i++) {
            const start = i * BATCH_SIZE;
            const end = start + BATCH_SIZE;
            const batch = backupData.tracks.slice(start, end);
            await musicDB.saveTracksInBatches(batch, BATCH_SIZE);

            const progress = 20 + Math.floor((i / totalBatches) * 60);
            updateProgress(progress, `${config.languageLabels.restoringTracks || "Şarkılar geri yükleniyor"} (${start}-${end > backupData.tracks.length ? backupData.tracks.length : end}/${backupData.tracks.length})`);
        }

        updateProgress(80, config.languageLabels.restoringDeletedItems || "Silinmiş öğeler geri yükleniyor...");

        if (backupData.deletedTracks && Array.isArray(backupData.deletedTracks)) {
            try {
                const db = await musicDB.openDB();
                const clearTransaction = db.transaction(['deletedTracks'], 'readwrite');
                const clearStore = clearTransaction.objectStore('deletedTracks');
                await new Promise((resolve, reject) => {
                    const clearRequest = clearStore.clear();
                    clearRequest.onsuccess = resolve;
                    clearRequest.onerror = reject;
                });

                const addTransaction = db.transaction(['deletedTracks'], 'readwrite');
                const addStore = addTransaction.objectStore('deletedTracks');

                for (let i = 0; i < backupData.deletedTracks.length; i++) {
                    const deletedItem = backupData.deletedTracks[i];
                    try {
                        addStore.add(deletedItem);
                    } catch (addError) {
                        console.warn('Silinmiş öğe eklenirken hata:', addError);
                    }
                    if (i % 10 === 0) {
                        const progress = 80 + Math.floor((i / backupData.deletedTracks.length) * 20);
                        updateProgress(progress);
                    }
                }

                await new Promise((resolve) => {
                    addTransaction.oncomplete = resolve;
                    addTransaction.onerror = (error) => {
                        console.warn('Silinmiş öğeler eklenirken hata:', error);
                        resolve();
                    };
                });

            } catch (deletedItemsError) {
                console.warn('Silinmiş öğeler geri yüklenirken hata:', deletedItemsError);
                showNotification(
                    config.languageLabels.restorePartialSuccess ||
                    "Şarkılar geri yüklendi ancak silinmiş öğeler yüklenemedi",
                    4000,
                    'warning'
                );
            }
        }

        updateProgress(100, config.languageLabels.restoreComplete || "Geri yükleme tamamlandı!");
        showNotification(config.languageLabels.restoreSuccess || "Veritabanı başarıyla geri yüklendi", 3000, 'success');
        await loadStatsIntoModal();
    } catch (error) {
        console.error('Geri yükleme hatası:', error);
        showNotification(
            (config.languageLabels.restoreError || "Geri yükleme sırasında hata oluştu: ") + error.message,
            5000,
            'error'
        );
    } finally {
        restoreBtn.innerHTML = originalRestoreText;
        restoreBtn.disabled = false;
        if (progressContainer.parentNode) {
            progressContainer.parentNode.removeChild(progressContainer);
        }
        event.target.value = '';
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
}

function createStatSection(title, listId, buttonId, buttonText) {
    const section = document.createElement("div");
    section.className = "stat-section";

    const titleEl = document.createElement("h3");
    titleEl.className = "stat-section-title";
    titleEl.textContent = title;
    section.appendChild(titleEl);

    const listContainer = document.createElement("div");
    listContainer.className = "stat-list-container";

    const listEl = document.createElement("div");
    listEl.className = "stat-list";
    listEl.id = listId;
    listContainer.appendChild(listEl);

    const button = document.createElement("button");
    button.className = "stat-more-btn";
    button.id = buttonId;
    button.textContent = buttonText;
    listContainer.appendChild(button);

    section.appendChild(listContainer);
    return section;
}

async function loadStatsIntoModal() {
    try {
        const [stats, recentlyDeleted, dbSize] = await Promise.all([
            musicDB.getStats(),
            musicDB.getRecentlyDeleted(),
            getDatabaseSize()
        ]);

        document.querySelector("#stat-total-tracks .stat-value").textContent = stats.totalTracks;
        document.querySelector("#stat-total-albums .stat-value").textContent = stats.totalAlbums;
        document.querySelector("#stat-total-artists .stat-value").textContent = stats.totalArtists;
        document.querySelector("#stat-db-size .stat-value").textContent = dbSize;

        await loadRecentItems(
            stats.recentlyUpdated,
            'stat-recent-updates',
            config.languageLabels.recentUpdates || "Son Güncellenenler",
            (item) => formatTrackInfo(item)
        );
        await loadRecentItems(
            recentlyDeleted.map(d => d.trackData),
            'stat-recent-deletes',
            config.languageLabels.recentDeletes || "Son Silinenler",
            (item, index) => formatTrackInfo(item, recentlyDeleted[index].deletedAt)
        );
    } catch (error) {
        console.error('İstatistikler yüklenirken hata:', error);
        showNotification(
            config.languageLabels.loadStatsError || "İstatistikler yüklenirken hata oluştu",
            3000,
            'error'
        );
    }
}

async function getDatabaseSize() {
    try {
        const [allTracks, stats, recentlyDeleted] = await Promise.all([
            musicDB.getAllTracks(),
            musicDB.getStats(),
            musicDB.getRecentlyDeleted()
        ]);

        const sizeObject = {
            metadata: {
                version: 1,
                createdAt: new Date().toISOString(),
                totalTracks: stats.totalTracks,
                totalAlbums: stats.totalAlbums,
                totalArtists: stats.totalArtists
            },
            tracks: allTracks,
            deletedTracks: recentlyDeleted
        };

        const jsonString = JSON.stringify(sizeObject);
        const sizeInBytes = new TextEncoder().encode(jsonString).length;
        const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);

        return `${sizeInMB} MB`;
    } catch (error) {
        console.error('Gerçek DB boyutu hesaplanamadı:', error);
        return '? MB';
    }
}


async function calculateApproximateSize(resolve) {
    try {
        const db = await musicDB.openDB();
        const transaction = db.transaction(['tracks', 'deletedTracks'], 'readonly');

        const getStoreDataSize = async (storeName) => {
            return new Promise((res) => {
                const store = transaction.objectStore(storeName);
                const request = store.openCursor();
                let totalBytes = 0;

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const json = JSON.stringify(cursor.value);
                        totalBytes += new TextEncoder().encode(json).length;
                        cursor.continue();
                    } else {
                        res(totalBytes);
                    }
                };

                request.onerror = () => res(0);
            });
        };

        const [tracksSize, deletedSize] = await Promise.all([
            getStoreDataSize('tracks'),
            getStoreDataSize('deletedTracks'),
        ]);

        const totalBytes = tracksSize + deletedSize;
        const approxSizeMB = totalBytes / (1024 * 1024);

        resolve(`${approxSizeMB.toFixed(2)} MB ${config.languageLabels.approxSizeSuffix}`);
    } catch (error) {
        console.error('DB hesaplamasında hata:', error);
        resolve("? MB");
    }
}


async function loadRecentItems(items, containerId, sectionTitle, formatter) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

   if (items.length === 0) {
    container.innerHTML = `<div class="no-items">${config.languageLabels.noData}</div>`;
    return;
}

    const maxVisible = 5;
    const visibleItems = items.slice(0, maxVisible);
    visibleItems.forEach((item, index) => {
        container.innerHTML += formatter(item, index);
    });
}

function formatTrackInfo(track, customDate = null) {
    const date = new Date(customDate || track.LastUpdated);
    const dateStr = date.toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const artists = Array.isArray(track.Artists) ? track.Artists.join(', ') :
                   track.AlbumArtist || config.languageLabels.artistUnknown;

    return `
        <div class="track-info">
            <div class="track-name">${track.Name || config.languageLabels.unknownTrack}</div>
            <div class="track-artist">${artists}</div>
            <div class="track-date">${dateStr}</div>
        </div>
    `;
}


function showDetailedList(title, items, formatter) {
    const modal = document.getElementById('detailed-list-modal');
    const titleEl = document.getElementById('detailed-list-title');
    const contentEl = document.getElementById('detailed-list-content');

    titleEl.textContent = title;
    contentEl.innerHTML = '';

    items.forEach((item, index) => {
        contentEl.innerHTML += `
            <div class="detailed-list-item">
                ${formatter(item, index)}
            </div>
        `;
    });

    modal.classList.remove('hidden');
}
