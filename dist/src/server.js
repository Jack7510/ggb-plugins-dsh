/**
 * @fileoverview Serves fixed GeoGebra assets and one in-memory preview on
 * loopback, with origin and filesystem boundaries.
 */
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compatibleRuntimeAsset } from './runtime-compatibility.js';
/** Installation root, resolved relative to the compiled module. */
export const root = fileURLToPath(new URL('../../', import.meta.url));
const mime = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.ogg': 'audio/ogg',
};
/** Resolves only fixed assets; a symlink escape remains forbidden. */
async function resolveAsset(pathname, runtime, hasPreview) {
    if (pathname === '/' || (pathname === '/preview' && hasPreview)) {
        return { path: resolve(root, 'viewer/index.html') };
    }
    if (!pathname.startsWith('/runtime/'))
        return { status: 404 };
    const path = await realpath(resolve(runtime, pathname.slice('/runtime/'.length)));
    return path.startsWith(runtime + sep) ? { path } : { status: 403 };
}
/** Handles the asset and same-origin preview notification routes. */
async function respond(req, res, runtime, state) {
    if (req.headers.host !== new URL(state.origin).host ||
        (req.headers.origin && req.headers.origin !== state.origin)) {
        res.writeHead(403).end();
        return;
    }
    if (state.material && req.method === 'POST' &&
        (req.url === '/preview-ready' || req.url === '/preview-close')) {
        if (req.headers.origin !== state.origin) {
            res.writeHead(403).end();
            return;
        }
        res.writeHead(204).end();
        if (req.url === '/preview-ready')
            state.ready();
        else
            state.finished();
        return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
        return;
    }
    try {
        const pathname = decodeURIComponent(new URL(req.url ?? '/', state.origin).pathname);
        const asset = await resolveAsset(pathname, runtime, !!state.material);
        if ('status' in asset) {
            res.writeHead(asset.status).end();
            return;
        }
        let data = await readFile(asset.path);
        const enginePrefix = '/runtime/GeoGebra/';
        if (pathname.startsWith(enginePrefix)) {
            data = compatibleRuntimeAsset(pathname.slice(enginePrefix.length), data);
        }
        if (pathname === '/preview') {
            const payload = JSON.stringify(state.material).replaceAll('<', '\\u003c');
            data = Buffer.from(data.toString('utf8').replace('<script src=', `<script>window.previewMaterial=${payload};</script><script src=`));
        }
        res.writeHead(200, {
            'Content-Type': mime[extname(asset.path)] ?? 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
        });
        res.end(req.method === 'HEAD' ? undefined : data);
    }
    catch {
        res.writeHead(404).end();
    }
}
/** Registers one material and the acknowledgements owned by this service. */
function publishPreview(state, material) {
    if (state.material)
        throw new Error('Preview already published');
    state.material = material;
    const loaded = new Promise(done => { state.ready = done; });
    const closed = new Promise(done => { state.finished = done; });
    return { url: state.origin + '/preview', loaded, closed };
}
/** Starts a loopback service; the caller must close it after use. */
export async function serve(runtimeDirectory = resolve(root, '.runtime')) {
    const runtime = await realpath(runtimeDirectory);
    const state = {
        origin: '', ready: () => { }, finished: () => { },
    };
    const server = createServer((req, res) => {
        void respond(req, res, runtime, state);
    });
    await new Promise((done, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', done);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('Missing HTTP port');
    }
    state.origin = `http://127.0.0.1:${address.port}`;
    return {
        url: state.origin,
        publishPreview: input => publishPreview(state, input),
        close: () => new Promise((done, reject) => {
            server.close(error => error ? reject(error) : done());
            server.closeAllConnections();
        }),
    };
}
