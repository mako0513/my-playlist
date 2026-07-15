'use strict';

const STORAGE_KEY = 'myplaylist.v1';
const { extractVideoId, encodeShare, decodeShare } = MyPlaylistLib;

const $ = (id) => document.getElementById(id);

// ---------- 状態 ----------
let state = load();
let player = null;
let playerReady = false;
let currentIndex = -1;   // 再生中の曲（-1 = 未再生）
let isPlaying = false;
let toastTimer = null;

function defaultState() {
  return {
    version: 1,
    playlists: [{ id: newId(), name: 'お気に入り', tracks: [] }],
    currentPlaylistId: null,
    settings: { shuffle: false, repeat: 'all' },  // repeat: 'all' | 'one' | 'off'
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.version === 1 && Array.isArray(s.playlists) && s.playlists.length > 0) return s;
    }
  } catch { /* 壊れていたら初期化 */ }
  return defaultState();
}

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function newId() { return 'p' + Math.random().toString(36).slice(2, 10); }

function currentPlaylist() {
  let pl = state.playlists.find(p => p.id === state.currentPlaylistId);
  if (!pl) { pl = state.playlists[0]; state.currentPlaylistId = pl.id; }
  return pl;
}

// ---------- 曲の追加 ----------
async function addTrackFromUrl(url) {
  const videoId = extractVideoId(url);
  if (!videoId) { toast('YouTubeのURLとして認識できませんでした'); return; }
  const pl = currentPlaylist();
  if (pl.tracks.some(t => t.videoId === videoId)) { toast('この曲はすでにリストにあります'); return; }
  $('addBtn').disabled = true;
  const title = await fetchTitle(videoId);
  $('addBtn').disabled = false;
  pl.tracks.push({ videoId, title, broken: false });
  save(); renderTracks();
  $('urlInput').value = '';
  toast(`追加しました: ${title}`);
}

async function fetchTitle(videoId) {
  const watchUrl = 'https://www.youtube.com/watch?v=' + videoId;
  const endpoints = [
    'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(watchUrl),
    'https://noembed.com/embed?url=' + encodeURIComponent(watchUrl),
  ];
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep);
      if (!res.ok) continue;
      const data = await res.json();
      if (data && typeof data.title === 'string' && data.title) return data.title;
    } catch { /* 次のエンドポイントへ */ }
  }
  return '(タイトル未取得)';
}

// ---------- プレーヤー ----------
window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player('player', {
    width: '100%', height: '100%',
    playerVars: { playsinline: 1, rel: 0 },
    events: {
      onReady: () => { playerReady = true; },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.ENDED) handleEnded();
        else if (e.data === YT.PlayerState.PLAYING) { isPlaying = true; updateControls(); }
        else if (e.data === YT.PlayerState.PAUSED) { isPlaying = false; updateControls(); }
      },
      onError: () => {
        const pl = currentPlaylist();
        const t = pl.tracks[currentIndex];
        if (t) { t.broken = true; save(); renderTracks(); toast(`再生できない曲をスキップ: ${t.title}`); }
        setTimeout(() => advance(true), 800);
      },
    },
  });
};

function playAt(index) {
  const pl = currentPlaylist();
  if (!playerReady) { toast('プレーヤー準備中です。少し待ってください'); return; }
  if (!pl.tracks[index]) return;
  currentIndex = index;
  player.loadVideoById(pl.tracks[index].videoId);
  renderTracks(); updateControls();
}

function handleEnded() {
  if (state.settings.repeat === 'one') { player.seekTo(0); player.playVideo(); return; }
  advance(false);
}

// manual=true: ボタン操作やエラースキップ（必ず進む）／ false: 自然終了（repeat設定に従う）
function advance(manual) {
  const pl = currentPlaylist();
  const n = pl.tracks.length;
  if (n === 0) return;
  if (state.settings.shuffle && n > 1) {
    let i;
    do { i = Math.floor(Math.random() * n); } while (i === currentIndex);
    playAt(i); return;
  }
  const next = currentIndex + 1;
  if (next < n) { playAt(next); return; }
  if (manual || state.settings.repeat === 'all') playAt(0);
  else { isPlaying = false; updateControls(); }  // repeat off: 停止
}

function playPrev() {
  const n = currentPlaylist().tracks.length;
  if (n === 0) return;
  playAt((currentIndex - 1 + n) % n);
}

function togglePlay() {
  const pl = currentPlaylist();
  if (pl.tracks.length === 0) { toast('まずYouTubeのURLを追加してください'); return; }
  if (currentIndex < 0) { playAt(0); return; }
  if (!playerReady) return;
  if (isPlaying) player.pauseVideo(); else player.playVideo();
}

// ---------- 共有 ----------
function shareCurrentPlaylist() {
  const pl = currentPlaylist();
  if (pl.tracks.length === 0) { toast('共有する曲がありません'); return; }
  const url = location.origin + location.pathname + '#import=' + encodeShare(pl);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(
      () => toast('共有URLをコピーしました。AirDropやLINEで自分のiPhoneへ送って開いてください'),
      () => window.prompt('このURLをコピーしてください', url),
    );
  } else {
    window.prompt('このURLをコピーしてください', url);
  }
}

function handleImportHash() {
  if (!location.hash.startsWith('#import=')) return;
  const decoded = decodeShare(location.hash.slice('#import='.length));
  history.replaceState(null, '', location.pathname + location.search);
  if (!decoded) { toast('共有URLを読み取れませんでした'); return; }
  if (!confirm(`プレイリスト「${decoded.name}」（${decoded.tracks.length}曲）を取り込みますか？`)) return;
  let name = decoded.name; let n = 2;
  while (state.playlists.some(p => p.name === name)) name = `${decoded.name} (${n++})`;
  const pl = { id: newId(), name, tracks: decoded.tracks };
  state.playlists.push(pl);
  state.currentPlaylistId = pl.id;
  save(); render();
  toast(`「${name}」を取り込みました`);
}

// ---------- プレイリスト操作 ----------
function newPlaylist() {
  const name = (window.prompt('新しいプレイリストの名前', '') || '').trim();
  if (!name) return;
  const pl = { id: newId(), name, tracks: [] };
  state.playlists.push(pl);
  state.currentPlaylistId = pl.id;
  stopCurrent(); save(); render();
}

function renamePlaylist() {
  const pl = currentPlaylist();
  const name = (window.prompt('新しい名前', pl.name) || '').trim();
  if (!name) return;
  pl.name = name; save(); renderSelector();
}

function deletePlaylist() {
  const pl = currentPlaylist();
  if (!confirm(`「${pl.name}」（${pl.tracks.length}曲）を削除しますか？`)) return;
  state.playlists = state.playlists.filter(p => p.id !== pl.id);
  if (state.playlists.length === 0) state.playlists = defaultState().playlists;
  state.currentPlaylistId = state.playlists[0].id;
  stopCurrent(); save(); render();
}

function switchPlaylist(id) {
  state.currentPlaylistId = id;
  stopCurrent(); save(); render();
}

function stopCurrent() {
  currentIndex = -1; isPlaying = false;
  if (playerReady) player.stopVideo();
}

function moveTrack(index, delta) {
  const tracks = currentPlaylist().tracks;
  const j = index + delta;
  if (j < 0 || j >= tracks.length) return;
  [tracks[index], tracks[j]] = [tracks[j], tracks[index]];
  if (currentIndex === index) currentIndex = j;
  else if (currentIndex === j) currentIndex = index;
  save(); renderTracks();
}

function deleteTrack(index) {
  const tracks = currentPlaylist().tracks;
  const t = tracks[index];
  if (!t) return;
  if (!confirm(`「${t.title}」を削除しますか？`)) return;
  tracks.splice(index, 1);
  if (currentIndex === index) { stopCurrent(); }
  else if (currentIndex > index) currentIndex--;
  save(); renderTracks();
}

// ---------- 描画 ----------
function render() { renderSelector(); renderTracks(); updateControls(); }

function renderSelector() {
  const sel = $('playlistSelect');
  sel.textContent = '';
  for (const p of state.playlists) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name}（${p.tracks.length}曲）`;
    sel.appendChild(opt);
  }
  sel.value = currentPlaylist().id;
}

function renderTracks() {
  const ol = $('trackList');
  ol.textContent = '';
  const tracks = currentPlaylist().tracks;
  if (tracks.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-note';
    li.textContent = 'まだ曲がありません。上の欄にYouTubeのURLを貼って「追加」を押してください。';
    ol.appendChild(li);
    renderSelector();
    return;
  }
  tracks.forEach((t, i) => {
    const li = document.createElement('li');
    if (i === currentIndex) li.classList.add('playing');

    const img = document.createElement('img');
    img.src = `https://i.ytimg.com/vi/${t.videoId}/mqdefault.jpg`;
    img.alt = ''; img.loading = 'lazy';
    li.appendChild(img);

    const btn = document.createElement('button');
    btn.className = 'track-title' + (t.broken ? ' broken' : '');
    btn.textContent = (t.broken ? '⚠ ' : '') + t.title;
    btn.addEventListener('click', () => playAt(i));
    li.appendChild(btn);

    if (t.broken) {
      const a = document.createElement('a');
      a.className = 'yt-link';
      a.href = `https://www.youtube.com/watch?v=${t.videoId}`;
      a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'YouTubeで開く';
      li.appendChild(a);
    }

    const ops = document.createElement('div');
    ops.className = 'track-ops';
    const up = document.createElement('button');
    up.textContent = '↑'; up.title = '上へ';
    up.addEventListener('click', () => moveTrack(i, -1));
    const down = document.createElement('button');
    down.textContent = '↓'; down.title = '下へ';
    down.addEventListener('click', () => moveTrack(i, 1));
    const del = document.createElement('button');
    del.textContent = '✕'; del.title = '削除';
    del.addEventListener('click', () => deleteTrack(i));
    ops.append(up, down, del);
    li.appendChild(ops);

    ol.appendChild(li);
  });
  renderSelector();  // 曲数表示を更新
}

function updateControls() {
  $('playBtn').textContent = isPlaying ? '⏸' : '▶';
  $('shuffleBtn').classList.toggle('on', state.settings.shuffle);
  const r = state.settings.repeat;
  $('repeatBtn').textContent = r === 'one' ? '🔂' : '🔁';
  $('repeatBtn').classList.toggle('on', r !== 'off');
  $('repeatBtn').title = r === 'all' ? 'リピート: 全曲' : r === 'one' ? 'リピート: 1曲' : 'リピート: オフ';
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

// ---------- イベント ----------
$('addBtn').addEventListener('click', () => addTrackFromUrl($('urlInput').value));
$('urlInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTrackFromUrl($('urlInput').value); });
$('playBtn').addEventListener('click', togglePlay);
$('nextBtn').addEventListener('click', () => advance(true));
$('prevBtn').addEventListener('click', playPrev);
$('shuffleBtn').addEventListener('click', () => {
  state.settings.shuffle = !state.settings.shuffle;
  save(); updateControls();
  toast(state.settings.shuffle ? 'シャッフル: オン' : 'シャッフル: オフ');
});
$('repeatBtn').addEventListener('click', () => {
  const order = { all: 'one', one: 'off', off: 'all' };
  state.settings.repeat = order[state.settings.repeat] || 'all';
  save(); updateControls();
});
$('shareBtn').addEventListener('click', shareCurrentPlaylist);
$('playlistSelect').addEventListener('change', (e) => switchPlaylist(e.target.value));
$('newPlaylistBtn').addEventListener('click', newPlaylist);
$('renamePlaylistBtn').addEventListener('click', renamePlaylist);
$('deletePlaylistBtn').addEventListener('click', deletePlaylist);

// ---------- 起動 ----------
render();
handleImportHash();
