// Where the shared world lives between sessions, so either player can pick it up when the other is away.
// With BLOB_READ_WRITE_TOKEN set (a Vercel Blob store), it survives the free server sleeping and restarting:
// each save is a new file and the last few are kept as backups. Without it, a local file (development).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const KEEP = 5;

function fileStore(file) {
  return {
    async get() { try { return await fs.readFile(file, 'utf8'); } catch { return null; } },
    async put(text) { await fs.writeFile(file + '.tmp', text); await fs.rename(file + '.tmp', file); },
  };
}

function blobStore() {
  const sdk = import('@vercel/blob');
  const newest = async () => { const { list } = await sdk; const { blobs } = await list({ prefix: 'world/' }); return blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)); };
  return {
    async get() { const [b] = await newest(); if (!b) return null; const r = await fetch(b.url, { cache: 'no-store' }); return r.ok ? r.text() : null; },
    async put(text) {
      const { put, del } = await sdk;
      await put(`world/save-${Date.now()}.json`, text, { access: 'public', addRandomSuffix: true, contentType: 'application/json' });
      const old = (await newest()).slice(KEEP); if (old.length) await del(old.map((b) => b.url));
    },
  };
}

// Guards against an out-of-date copy overwriting newer progress. Every save carries `rev` (counts up each save)
// and `base` (the rev its session started from), plus a random `session` id. A session that started from the newest
// save, or the session that is already writing, is accepted. A session that started from an older copy is turned away.
export function makeWorldStore(backend = process.env.BLOB_READ_WRITE_TOKEN ? blobStore() : fileStore(process.env.WORLD_FILE || path.join(os.tmpdir(), 'lasthaul-world.json'))) {
  let meta = null; // { rev, session } of what's stored
  const read = async () => { const t = await backend.get(); if (!meta) { try { const d = t && JSON.parse(t); meta = { rev: d ? d.rev || 0 : 0, session: d ? d.session : null }; } catch { meta = { rev: 0, session: null }; } } return t; };
  return {
    load: read,
    async save(text, force = false) {
      let d; try { d = JSON.parse(text); } catch { return 'Not a save.'; }
      if (!meta) await read();
      const rev = d.rev || 0, base = d.base || 0;
      if (!force && !(base >= meta.rev || (d.session && d.session === meta.session))) return 'stale';
      await backend.put(text);
      meta = { rev, session: d.session };
      return null;
    },
  };
}
