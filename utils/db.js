export class MusicDB {
    constructor() {
        this.dbName = 'JellyfinMusicDB';
        this.dbVersion = 5;
        this.storeName = 'tracks';
        this.db = null;
        this.initPromise = null;
    }

    async getAllTracks() {
        const tx = await this.transaction([this.storeName], 'readonly');
        const store = tx.objectStore(this.storeName);

        return new Promise((resolve, reject) => {
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (event) => {
                console.error('Tüm parçalar alınırken hata:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    async openDB() {
        if (this.db) return this.db;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;

                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, {
                        keyPath: 'Id',
                        autoIncrement: false
                    });

                    store.createIndex('DateCreated', 'DateCreated', { unique: false });
                    store.createIndex('Album', 'Album', { unique: false });
                    store.createIndex('Artists', 'Artists', { multiEntry: true });
                    store.createIndex('AlbumArtist', 'AlbumArtist', { unique: false });
                    store.createIndex('ArtistIds', 'ArtistItems.Id', { multiEntry: true });
                    store.createIndex('AlbumId', 'AlbumId', { unique: false });
                }

                if (oldVersion < 2) {
                    const store = request.transaction.objectStore(this.storeName);
                    if (!store.indexNames.contains('DateCreated')) {
                        store.createIndex('DateCreated', 'DateCreated', { unique: false });
                    }
                }

                if (oldVersion < 3) {
                    const store = request.transaction.objectStore(this.storeName);
                    if (!store.indexNames.contains('ArtistIds')) {
                        store.createIndex('ArtistIds', 'ArtistItems.Id', { multiEntry: true });
                    }
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.db.onclose = () => console.warn('DB connection closed unexpectedly');
                this.db.onversionchange = () => this.db.close();

                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('DB open error:', event.target.error);
                reject(new Error('DB_OPEN_FAILED'));
            };
        });

        return this.initPromise;
    }

    async transaction(storeNames, mode = 'readonly') {
        await this.openDB();
        return this.db.transaction(storeNames, mode);
    }

    async bulkPut(tracks) {
    const tx = await this.transaction([this.storeName], 'readwrite');
    const store = tx.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
        const promises = tracks.map(track => {
            if (!track.DateCreated) {
                track.DateCreated = new Date().toISOString();
            }

            return new Promise((res, rej) => {
                const req = store.put(track);
                req.onsuccess = () => res();
                req.onerror = (e) => rej(e.target.error);
            });
        });

        Promise.all(promises)
            .then(() => resolve())
            .catch(reject);
    });
}

    async bulkDelete(ids) {
        const tx = await this.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);

        return new Promise((resolve, reject) => {
            const promises = ids.map(id => {
                return new Promise((res, rej) => {
                    const req = store.delete(id);
                    req.onsuccess = () => res();
                    req.onerror = (e) => rej(e.target.error);
                });
            });

            Promise.all(promises)
                .then(() => resolve())
                .catch(reject);
        });
    }

    async getTracksByArtist(artistNameOrId) {
        const tx = await this.transaction([this.storeName], 'readonly');
        const store = tx.objectStore(this.storeName);

        return new Promise((resolve, reject) => {
            let request;

            if (typeof artistNameOrId === 'string') {
                const artistNameLower = artistNameOrId.toLowerCase();
                const index = store.index('Artists');
                const request = index.openCursor();
                const results = [];

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const artists = cursor.value.Artists || [];
                        if (artists.some(a => a.toLowerCase().includes(artistNameLower))) {
                            results.push(cursor.value);
                        }
                        cursor.continue();
                    } else {
                        resolve(results);
                    }
                };

                request.onerror = (event) => reject(event.target.error);
            } else {
                const index = store.index('ArtistIds');
                request = index.getAll(IDBKeyRange.only(artistNameOrId));

                request.onsuccess = () => resolve(request.result || []);
                request.onerror = (event) => reject(event.target.error);
            }
        });
    }

    async getTracksByAlbum(albumIdOrName) {
        const tx = await this.transaction([this.storeName], 'readonly');
        const store = tx.objectStore(this.storeName);

        return new Promise((resolve, reject) => {
            let request;

            if (typeof albumIdOrName === 'string') {
                const albumNameLower = albumIdOrName.toLowerCase();
                const index = store.index('Album');
                const request = index.openCursor();
                const results = [];

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        if (cursor.value.Album?.toLowerCase().includes(albumNameLower)) {
                            results.push(cursor.value);
                        }
                        cursor.continue();
                    } else {
                        resolve(results);
                    }
                };

                request.onerror = (event) => reject(event.target.error);
            } else {
                const index = store.index('AlbumId');
                request = index.getAll(IDBKeyRange.only(albumIdOrName));

                request.onsuccess = () => resolve(request.result || []);
                request.onerror = (event) => reject(event.target.error);
            }
        });
    }

    async getPaginatedTracks({ page = 1, pageSize = 100, sortBy = 'DateCreated', sortDirection = 'prev' }) {
        const tx = await this.transaction([this.storeName], 'readonly');
        const store = tx.objectStore(this.storeName);
        const index = store.index(sortBy);

        return new Promise((resolve, reject) => {
            const request = index.openCursor(null, sortDirection);
            const results = [];
            let advanced = false;
            let counter = 0;

            request.onsuccess = (event) => {
                const cursor = event.target.result;

                if (!cursor) {
                    resolve({
                        tracks: results,
                        total: counter,
                        page,
                        pageSize,
                        totalPages: Math.ceil(counter / pageSize)
                    });
                    return;
                }

                counter++;

                if (!advanced && page > 1) {
                    const skip = (page - 1) * pageSize;
                    if (counter <= skip) {
                        cursor.advance(skip);
                        advanced = true;
                        return;
                    }
                }

                if (results.length < pageSize) {
                    results.push(cursor.value);
                }

                if (results.length >= pageSize) {
                    return;
                }

                cursor.continue();
            };

            request.onerror = (event) => reject(event.target.error);
        });
    }

async getStats() {
    const tx = await this.transaction([this.storeName], 'readonly');
    const store = tx.objectStore(this.storeName);

    const totalTracks = await new Promise((resolve) => {
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
    });

    let uniqueAlbums = 0;
    try {
        if (store.indexNames.contains('Album')) {
            uniqueAlbums = await this.countDistinct(store, 'Album');
        } else {
            const allTracks = await this.getAllTracks();
            uniqueAlbums = new Set(allTracks.map(t => t.Album)).size;
        }
    } catch (e) {
        const allTracks = await this.getAllTracks();
        uniqueAlbums = new Set(allTracks.map(t => t.Album)).size;
    }

    let uniqueArtists = 0;
    try {
        if (store.indexNames.contains('Artists')) {
            uniqueArtists = await this.countDistinct(store, 'Artists');
        } else if (store.indexNames.contains('AlbumArtist')) {
            const albumArtists = await this.countDistinct(store, 'AlbumArtist');
            const allTracks = await this.getAllTracks();
            const trackArtists = new Set(allTracks.flatMap(t => t.Artists || [])).size;
            uniqueArtists = Math.max(albumArtists, trackArtists);
        } else {
            const allTracks = await this.getAllTracks();
            const artists = new Set(allTracks.flatMap(t => [
                ...(t.Artists || []),
                t.AlbumArtist
            ].filter(Boolean))).size;
            uniqueArtists = artists;
        }
    } catch (e) {
        const allTracks = await this.getAllTracks();
        uniqueArtists = new Set(allTracks.flatMap(t => [
            ...(t.Artists || []),
            t.AlbumArtist
        ].filter(Boolean))).size;
    }

    return {
        tracks: totalTracks,
        albums: uniqueAlbums,
        artists: uniqueArtists
    };
}

    async count(store) {
        return new Promise((resolve, reject) => {
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async countDistinct(store, indexName) {
        return new Promise((resolve, reject) => {
            const index = store.index(indexName);
            const request = index.openKeyCursor();
            const distinctValues = new Set();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (Array.isArray(cursor.key)) {
                        cursor.key.forEach(k => distinctValues.add(k));
                    } else {
                        distinctValues.add(cursor.key);
                    }
                    cursor.continue();
                } else {
                    resolve(distinctValues.size);
                }
            };

            request.onerror = (event) => reject(event.target.error);
        });
    }

    async clearOldTracks(thresholdDate) {
        const tx = await this.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);
        const index = store.index('DateCreated');

        return new Promise((resolve, reject) => {
            const range = IDBKeyRange.upperBound(thresholdDate);
            const request = index.openCursor(range);
            const idsToDelete = [];

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    idsToDelete.push(cursor.primaryKey);
                    cursor.continue();
                } else {
                    this.bulkDelete(idsToDelete)
                        .then(resolve)
                        .catch(reject);
                }
            };

            request.onerror = (event) => reject(event.target.error);
        });
    }

    async getLastTrack() {
        const tx = await this.transaction([this.storeName], 'readonly');
        const store = tx.objectStore(this.storeName);
        const index = store.index('DateCreated');

        return new Promise((resolve, reject) => {
            const request = index.openCursor(null, 'prev');

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                resolve(cursor ? cursor.value : null);
            };

            request.onerror = (event) => reject(event.target.error);
        });
    }

    async getFirstTrack() {
        const tx = await this.transaction([this.storeName], 'readonly');
        const store = tx.objectStore(this.storeName);
        const index = store.index('DateCreated');

        return new Promise((resolve, reject) => {
            const request = index.openCursor(null, 'next');

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                resolve(cursor ? cursor.value : null);
            };

            request.onerror = (event) => reject(event.target.error);
        });
    }

    async optimize() {
    }

    async close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.initPromise = null;
        }
    }
}

export const musicDB = new MusicDB();
