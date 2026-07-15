(function (global) {
  'use strict';

  const ID_RE = /^[A-Za-z0-9_-]{11}$/;

  function extractVideoId(input) {
    if (typeof input !== 'string') return null;
    const s = input.trim();
    if (ID_RE.test(s)) return s;
    let url;
    try { url = new URL(s); } catch { return null; }
    const host = url.hostname.replace(/^(www|m)\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      return ID_RE.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'music.youtube.com') {
      const v = url.searchParams.get('v');
      if (v && ID_RE.test(v)) return v;
      const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})(?:[/?]|$)/);
      if (m) return m[1];
    }
    return null;
  }

  function toBase64Url(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(b64u) {
    const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }

  function encodeShare(playlist) {
    const compact = { n: playlist.name, t: playlist.tracks.map(t => [t.videoId, t.title]) };
    return toBase64Url(JSON.stringify(compact));
  }

  function decodeShare(encoded) {
    try {
      const obj = JSON.parse(fromBase64Url(encoded));
      if (!obj || typeof obj.n !== 'string' || !Array.isArray(obj.t)) return null;
      const tracks = [];
      for (const item of obj.t) {
        if (!Array.isArray(item) || typeof item[0] !== 'string' || !ID_RE.test(item[0])) return null;
        tracks.push({
          videoId: item[0],
          title: typeof item[1] === 'string' && item[1] ? item[1] : '(タイトル未取得)',
          broken: false,
        });
      }
      return { name: obj.n, tracks };
    } catch {
      return null;
    }
  }

  const lib = { extractVideoId, encodeShare, decodeShare };
  if (typeof module !== 'undefined' && module.exports) module.exports = lib;
  global.MyPlaylistLib = lib;
})(globalThis);
