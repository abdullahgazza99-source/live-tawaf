const CACHE_NAME = 'tawaf-live-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './app.js',
    './manifest.json',
    // Library Eksternal (Tailwind, FontAwesome, Font)
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Amiri:wght@700&family=Inter:wght@400;500;600;700;800&display=swap'
];

// Install Service Worker & Simpan File ke Cache
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Menyimpan file ke cache (Offline Mode siap)');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Aktivasi & Hapus Cache Lama
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('Menghapus cache lama:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});

// Ambil data dari Cache jika Offline, atau ambil dari Internet jika Online
self.addEventListener('fetch', event => {
    // Jangan cache request Firebase (Harus online)
    if (event.request.url.includes('firebase') || event.request.url.includes('googleapis.com/google.firebase')) {
        return; 
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Jika ada di cache, gunakan itu (Offline)
                if (response) return response;
                
                // Jika tidak ada, ambil dari internet (Online)
                return fetch(event.request).then(networkResponse => {
                    // Simpan file baru ke cache (hanya jika file GET)
                    if (event.request.method === 'GET') {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return networkResponse;
                });
            }).catch(() => {
                // Fallback jika offline dan file tidak ada di cache
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            })
    );
});