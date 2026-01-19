import { BehaviorSubject, shareReplay, defer, filter, switchMap, Subject, merge } from "rxjs";
import { openJar, type Jar } from "../utils/Jar";
import { agreedEula } from "./Settings";

const CREDENTIALS_KEY = 'hytale-downloader-credentials';
const JAR_CACHE_DB = 'hytale-jar-cache';
const JAR_CACHE_VERSION = 2; // Increment to invalidate old caches
const JAR_CACHE_STORE = 'jars';
const CLIENT_ID = 'hytale-downloader';
// Use proxied paths to avoid CORS issues (see vite.config.ts)
const OAUTH_BASE = '/oauth2';
const GAME_ASSETS_BASE = '/game-assets';
const R2_BUCKET_HOST = 'ht-game-assets-release.de7106a42bcf6cf632edbccda3ea1394.r2.cloudflarestorage.com';

// Rewrite R2 URLs to go through our proxy to avoid CORS issues
function proxyR2Url(url: string): string {
    try {
        const parsed = new URL(url);
        if (parsed.host === R2_BUCKET_HOST) {
            return `/r2-proxy${parsed.pathname}${parsed.search}`;
        }
    } catch {
        // Not a valid URL, return as-is
    }
    return url;
}

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

// Trigger to retry jar download after successful authentication
const authSuccessful = new Subject<void>();
export interface HytaleJar {
    version: string;
    jar: Jar;
}

interface Credentials {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    branch: string;
}

interface TokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

interface DeviceAuthResponse {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    expires_in: number;
    interval: number;
}

interface VersionInfo {
    version: string;
    download_url: string;
    sha256: string;
    url?: string;
}

interface DownloadUrlResponse {
    url: string;
}

export const loadProgress = new BehaviorSubject<number | undefined>(undefined);
export const needsAuth = new BehaviorSubject<boolean>(false);
export const deviceAuthState = new BehaviorSubject<{
    userCode: string;
    verificationUri: string;
    verificationUriComplete?: string;
    expiresAt: number;
} | null>(null);
export const authError = new BehaviorSubject<string | null>(null);

let pollingAbortController: AbortController | null = null;

export function initiateLogin(patchline: string = 'release'): void {
    initiateDeviceAuthFlow(patchline);
}

export function cancelLogin(): void {
    if (pollingAbortController) {
        pollingAbortController.abort();
        pollingAbortController = null;
    }
    deviceAuthState.next(null);
    authError.next(null);
}

function getStoredCredentials(): Credentials | null {
    const stored = localStorage.getItem(CREDENTIALS_KEY);
    if (!stored) return null;

    try {
        return JSON.parse(stored);
    } catch {
        return null;
    }
}

function saveCredentials(credentials: Credentials): void {
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
}

async function refreshAccessToken(credentials: Credentials): Promise<Credentials> {
    const response = await fetch(`${OAUTH_BASE}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: credentials.refresh_token
        })
    });

    if (!response.ok) {
        throw new Error('Failed to refresh token');
    }

    const data: TokenResponse = await response.json();
    const newCredentials: Credentials = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
        branch: credentials.branch
    };

    saveCredentials(newCredentials);
    return newCredentials;
}

async function initiateDeviceAuthFlow(patchline: string = 'release'): Promise<void> {
    authError.next(null);

    try {
        // Request device authorization
        const response = await fetch(`${OAUTH_BASE}/device/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                scope: 'offline auth:downloader'
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Device auth request failed:', errorText);
            authError.next('Failed to start login. Please try again.');
            return;
        }

        const data: DeviceAuthResponse = await response.json();
        console.log('Device auth response:', data);

        // Show the user code and verification URI
        deviceAuthState.next({
            userCode: data.user_code,
            verificationUri: data.verification_uri,
            verificationUriComplete: data.verification_uri_complete,
            expiresAt: Date.now() + data.expires_in * 1000
        });

        // Start polling for token
        pollForToken(data.device_code, data.interval, patchline);
    } catch (error) {
        console.error('Device auth error:', error);
        authError.next('Failed to connect to authentication server.');
    }
}

async function pollForToken(deviceCode: string, interval: number, patchline: string): Promise<void> {
    pollingAbortController = new AbortController();
    const { signal } = pollingAbortController;

    const pollInterval = Math.max(interval, 5) * 1000; // Minimum 5 seconds

    while (!signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        if (signal.aborted) break;

        try {
            const response = await fetch(`${OAUTH_BASE}/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    client_id: CLIENT_ID,
                    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                    device_code: deviceCode
                }),
                signal
            });

            if (response.ok) {
                const data: TokenResponse = await response.json();
                const credentials: Credentials = {
                    access_token: data.access_token,
                    refresh_token: data.refresh_token,
                    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
                    branch: patchline
                };

                saveCredentials(credentials);
                deviceAuthState.next(null);
                needsAuth.next(false);
                pollingAbortController = null;

                // Signal that authentication succeeded
                authSuccessful.next();
                console.log('Authentication successful!');
                return;
            }

            const errorData = await response.json().catch(() => ({}));
            const error = errorData.error || 'unknown_error';

            if (error === 'authorization_pending') {
                // User hasn't authorized yet, keep polling
                continue;
            } else if (error === 'slow_down') {
                // Increase polling interval
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            } else if (error === 'expired_token') {
                authError.next('Login session expired. Please try again.');
                deviceAuthState.next(null);
                break;
            } else if (error === 'access_denied') {
                authError.next('Login was denied.');
                deviceAuthState.next(null);
                break;
            } else {
                console.error('Token polling error:', errorData);
                authError.next('Login failed. Please try again.');
                deviceAuthState.next(null);
                break;
            }
        } catch (error) {
            if (signal.aborted) break;
            console.error('Polling error:', error);
        }
    }

    pollingAbortController = null;
}

async function getValidCredentials(patchline: string = 'release'): Promise<Credentials | null> {
    let credentials = getStoredCredentials();

    if (!credentials || credentials.branch !== patchline) {
        console.log('No valid credentials found - authentication required');
        needsAuth.next(true);
        return null;
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (credentials.expires_at < now) {
        try {
            credentials = await refreshAccessToken(credentials);
        } catch (error) {
            console.error('Failed to refresh token, authentication required', error);
            needsAuth.next(true);
            return null;
        }
    }

    return credentials;
}

async function downloadHytaleJar(patchline: string = 'release'): Promise<HytaleJar> {
    console.log(`Loading Hytale jar for patchline: ${patchline}`);
    loadProgress.next(10);

    const credentials = await getValidCredentials(patchline);

    // If credentials is null, authentication was initiated via About modal
    if (!credentials) {
        console.log('Waiting for user to authenticate via login button...');
        loadProgress.next(undefined);
        // Return a promise that never resolves - download will retry after auth succeeds
        return new Promise(() => { });
    }

    loadProgress.next(20);

    // Get Version Info
    const versionResponse = await fetch(`${GAME_ASSETS_BASE}/version/${patchline}.json`, {
        headers: { 'Authorization': `Bearer ${credentials.access_token}` }
    });

    if (!versionResponse.ok) {
        throw new Error(`Failed to fetch version info: ${versionResponse.statusText}`);
    }

    const versionData: { url: string; } = await versionResponse.json();
    const versionInfoResponse = await fetch(proxyR2Url(versionData.url));

    if (!versionInfoResponse.ok) {
        throw new Error(`Failed to fetch version info from ${versionData.url}`);
    }

    const versionInfo: VersionInfo = await versionInfoResponse.json();
    loadProgress.next(30);

    // Check if we have this version cached
    const cached = await getCachedJar(patchline);
    if (cached && cached.version === versionInfo.version) {
        console.log(`Using cached Hytale jar version ${cached.version}`);
        loadProgress.next(90);
        const jar = await openJar(cached.blob);
        loadProgress.next(undefined);
        return { version: cached.version, jar };
    }

    console.log(`Downloading Hytale version ${versionInfo.version}`);

    // Get Download URL
    const downloadUrlResponse = await fetch(`${GAME_ASSETS_BASE}/${versionInfo.download_url}`, {
        headers: { 'Authorization': `Bearer ${credentials.access_token}` }
    });

    if (!downloadUrlResponse.ok) {
        throw new Error(`Failed to get download URL: ${downloadUrlResponse.statusText}`);
    }

    const downloadUrlData: DownloadUrlResponse = await downloadUrlResponse.json();
    loadProgress.next(40);

    // Download the ZIP file
    const zipResponse = await fetch(proxyR2Url(downloadUrlData.url));

    if (!zipResponse.ok) {
        throw new Error(`Failed to download Hytale jar: ${zipResponse.statusText}`);
    }

    const contentLength = zipResponse.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!zipResponse.body || total === 0) {
        // No Content-Length header (common with proxied requests) - use blob() without streaming progress
        console.log('Downloading jar (size unknown, no progress tracking available)...');
        loadProgress.next(50); // Show some progress
        const blob = await zipResponse.blob();
        loadProgress.next(70);
        const innerJarBlob = await extractInnerJar(blob);
        loadProgress.next(85);
        await setCachedJar(patchline, versionInfo.version, innerJarBlob);
        loadProgress.next(95);
        const jar = await openJar(innerJarBlob);
        loadProgress.next(undefined);
        console.log(`Successfully downloaded and cached Hytale ${patchline} patchline (version ${versionInfo.version})`);
        return { version: versionInfo.version, jar };
    }

    const reader = zipResponse.body.getReader();
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

    // The download is a wrapper zip - extract Server/HytaleServer.jar from it
    const innerJarBlob = await extractInnerJar(blob);

    // Cache the extracted jar for future use
    await setCachedJar(patchline, versionInfo.version, innerJarBlob);
    const jar = await openJar(innerJarBlob);
    loadProgress.next(undefined);

    console.log(`Successfully downloaded and cached Hytale ${patchline} patchline (version ${versionInfo.version})`);
    return { version: versionInfo.version, jar };
}

async function extractInnerJar(wrapperBlob: Blob): Promise<Blob> {
    const wrapperJar = await openJar(wrapperBlob);
    const innerJarEntry = wrapperJar.entries['Server/HytaleServer.jar'];

    if (!innerJarEntry) {
        throw new Error('Server/HytaleServer.jar not found in downloaded archive');
    }

    const innerJarData = await innerJarEntry.bytes();
    return new Blob([innerJarData as BlobPart]);
}

// Only start download after user has agreed to EULA and has valid credentials
// Also retry whenever authentication succeeds
export const hytaleJar = merge(
    agreedEula.observable.pipe(filter(agreed => agreed === true)),
    authSuccessful
).pipe(
    switchMap(() => defer(() => {
        const credentials = getStoredCredentials();
        if (!credentials) {
            console.log('Waiting for authentication before downloading jar...');
            needsAuth.next(true);
            return new Promise<HytaleJar>(() => { });
        }
        // downloadHytaleJar returns a Promise, which defer handles correctly
        return downloadHytaleJar();
    })),
    shareReplay({ bufferSize: 1, refCount: true })
);