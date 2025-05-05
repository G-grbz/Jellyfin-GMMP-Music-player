export class MusicDB {
    constructor() {
        this.dbName = 'JellyfinMusicDB';
        this.dbVersion = this.calculateDbVersion();
        this.storeName = 'tracks';
        this.db = null;
    }

    calculateDbVersion() {
        const versionHistory = {
            1: 'İlk versiyon - temel track depolama',
            2: 'DateCreated index eklendi',
            3: 'Artist bilgileri için yeni indexler eklendi',
            4: 'Yeni eklenenler için geliştirildi',
            5: 'geliştirildi'
        };
        return Math.max(...Object.keys(versionHistory).map(Number));
    }

    async openDB() {
        return new Promise((resolve, reject) => {
            if (this.db) return resolve(this.db);

            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'Id' });
                    store.createIndex('DateCreated', 'DateCreated', { unique: false });
                    store.createIndex('Album', 'Album', { unique: false });
                    store.createIndex('Artist', 'Artists', { multiEntry: true });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('Veritabanı açılırken hata:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async getAllTracks() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (event) => {
                console.error('Parçalar alınırken hata:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async getTracksPaginated(page = 1, pageSize = 100) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                const allTracks = request.result || [];
                const start = (page - 1) * pageSize;
                const end = start + pageSize;
                resolve({
                    tracks: allTracks.slice(start, end),
                    total: allTracks.length,
                    page,
                    pageSize,
                    totalPages: Math.ceil(allTracks.length / pageSize)
                });
            };
            request.onerror = (event) => {
                console.error('Parçalar alınırken hata:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async getLastTrack() {
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
                console.error('Son parça alınırken hata:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async saveTracks(tracks) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            tracks.forEach(track => {
                store.put(track);
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => {
                console.error('Parçalar kaydedilirken hata:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async saveTracksInBatches(tracks, batchSize = 100) {
        for (let i = 0; i < tracks.length; i += batchSize) {
            const batch = tracks.slice(i, i + batchSize);
            await this.saveTracks(batch);
            console.log(`Toplu kayıt: ${i}-${i + batchSize} arası parçalar kaydedildi`);
        }
    }

    async addOrUpdateTracks(tracks) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            tracks.forEach(track => {
                store.put(track);
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => {
                console.error('Parçalar güncellenirken hata:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async deleteTracks(ids) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            ids.forEach(id => {
                store.delete(id);
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => {
                console.error('Parçalar silinirken hata:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async getTrackCount() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => {
                console.error('Parça sayısı alınırken hata:', event.target.error);
                reject(event.target.error);
            };
        });
    }
}

async function getTracksByArtist(artistNameOrId) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);

        let request;
        if (typeof artistNameOrId === 'string') {
            const index = store.index('Artists');
            request = index.getAll(artistNameOrId);
        } else {
            const index = store.index('ArtistIds');
            request = index.getAll(artistNameOrId);
        }

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
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

export const musicDB = new MusicDB();
