import { BehaviorSubject, shareReplay, defer, filter, switchMap } from "rxjs";
import { openJar, type Jar } from "../utils/Jar";
import { agreedEula } from "./Settings";

const JAR_CACHE_DB = 'hytale-jar-cache';
const JAR_CACHE_VERSION = 2; // Increment to invalidate old caches
const JAR_CACHE_STORE = 'jars';
const MAVEN_BASE = '/maven/release/com/hypixel/hytale/Server';

// IndexedDB cache for downloaded jars
async function openCacheDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(JAR_CACHE_DB, JAR_CACHE_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = () => {
            const db = request.result;
            // Delete old store if exists (cache invalidation)
            if (db.objectStoreNames.contains(JAR_CACHE_STORE)) {
                db.deleteObjectStore(JAR_CACHE_STORE);
            }
            db.createObjectStore(JAR_CACHE_STORE);
        };
    });
}

interface CachedJar {
    version: string;
    patchline: string;
    blob: Blob;
    cachedAt: number;
}

async function getCachedJar(patchline: string): Promise<CachedJar | null> {
    try {
        const db = await openCacheDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(JAR_CACHE_STORE, 'readonly');
            const store = tx.objectStore(JAR_CACHE_STORE);
            const request = store.get(patchline);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result || null);
        });
    } catch (error) {
        console.warn('Failed to read from jar cache:', error);
        return null;
    }
}

async function setCachedJar(patchline: string, version: string, blob: Blob): Promise<void> {
    try {
        const db = await openCacheDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(JAR_CACHE_STORE, 'readwrite');
            const store = tx.objectStore(JAR_CACHE_STORE);
            const cached: CachedJar = { version, patchline, blob, cachedAt: Date.now() };
            const request = store.put(cached, patchline);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    } catch (error) {
        console.warn('Failed to write to jar cache:', error);
    }
}

export interface HytaleJar {
    version: string;
    jar: Jar;
}

export const loadProgress = new BehaviorSubject<number | undefined>(undefined);

async function fetchLatestVersion(): Promise<string> {
    const response = await fetch(`${MAVEN_BASE}/maven-metadata.xml`);

    if (!response.ok) {
        throw new Error(`Failed to fetch Maven metadata: ${response.statusText}`);
    }

    const text = await response.text();
    const xml = new DOMParser().parseFromString(text, 'text/xml');
    const latest = xml.querySelector('versioning > release')?.textContent
        ?? xml.querySelector('versioning > latest')?.textContent;

    if (!latest) {
        throw new Error('Could not determine latest version from Maven metadata');
    }

    return latest;
}

async function downloadHytaleJar(patchline: string = 'release'): Promise<HytaleJar> {
    console.log(`Loading Hytale jar for patchline: ${patchline}`);
    loadProgress.next(10);

    const version = await fetchLatestVersion();
    loadProgress.next(20);

    // Check if we have this version cached
    const cached = await getCachedJar(patchline);
    if (cached && cached.version === version) {
        console.log(`Using cached Hytale jar version ${cached.version}`);
        loadProgress.next(90);
        const jar = await openJar(cached.blob);
        loadProgress.next(undefined);
        return { version: cached.version, jar };
    }

    console.log(`Downloading Hytale version ${version}`);
    loadProgress.next(30);

    const jarUrl = `${MAVEN_BASE}/${version}/Server-${version}.jar`;
    const jarResponse = await fetch(jarUrl);

    if (!jarResponse.ok) {
        throw new Error(`Failed to download Hytale jar: ${jarResponse.statusText}`);
    }

    loadProgress.next(40);

    const contentLength = jarResponse.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!jarResponse.body || total === 0) {
        // No Content-Length header - use blob() without streaming progress
        console.log('Downloading jar (size unknown, no progress tracking available)...');
        loadProgress.next(50);
        const blob = await jarResponse.blob();
        loadProgress.next(85);
        await setCachedJar(patchline, version, blob);
        loadProgress.next(95);
        const jar = await openJar(blob);
        loadProgress.next(undefined);
        console.log(`Successfully downloaded and cached Hytale server jar (version ${version})`);
        return { version, jar };
    }

    const reader = jarResponse.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedLength = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        const percent = 40 + Math.round((receivedLength / total) * 50);
        loadProgress.next(percent);
    }

    const blob = new Blob(chunks as BlobPart[]);

    // Cache the jar for future use
    await setCachedJar(patchline, version, blob);
    const jar = await openJar(blob);
    loadProgress.next(undefined);

    console.log(`Successfully downloaded and cached Hytale server jar (version ${version})`);
    return { version, jar };
}

// Only start download after user has agreed to EULA
export const hytaleJar = agreedEula.observable.pipe(
    filter(agreed => agreed === true),
    switchMap(() => defer(() => downloadHytaleJar())),
    shareReplay({ bufferSize: 1, refCount: true })
);
