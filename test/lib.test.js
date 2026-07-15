'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { extractVideoId, encodeShare, decodeShare } = require('../lib.js');

test('watch URL からID抽出', () => {
  assert.strictEqual(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s'), 'dQw4w9WgXcQ');
});
test('youtu.be 短縮URL', () => {
  assert.strictEqual(extractVideoId('https://youtu.be/dQw4w9WgXcQ?si=xxx'), 'dQw4w9WgXcQ');
});
test('shorts URL', () => {
  assert.strictEqual(extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});
test('music.youtube.com', () => {
  assert.strictEqual(extractVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});
test('embed URL', () => {
  assert.strictEqual(extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});
test('生の11文字IDも受ける', () => {
  assert.strictEqual(extractVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});
test('無関係なURLは null', () => {
  assert.strictEqual(extractVideoId('https://example.com/watch?v=dQw4w9WgXcQ'), null);
});
test('IDの長さ不正は null', () => {
  assert.strictEqual(extractVideoId('https://www.youtube.com/watch?v=short'), null);
});
test('URLでない文字列は null', () => {
  assert.strictEqual(extractVideoId('こんにちは'), null);
});
test('共有URL round-trip（日本語タイトル）', () => {
  const pl = { name: '作業用', tracks: [
    { videoId: 'dQw4w9WgXcQ', title: 'テスト曲①', broken: false },
    { videoId: 'abcABC123-_', title: '(タイトル未取得)', broken: true },
  ]};
  const enc = encodeShare(pl);
  assert.match(enc, /^[A-Za-z0-9_-]+$/, 'base64urlはURL安全文字のみ');
  const dec = decodeShare(enc);
  assert.deepStrictEqual(dec, { name: '作業用', tracks: [
    { videoId: 'dQw4w9WgXcQ', title: 'テスト曲①', broken: false },
    { videoId: 'abcABC123-_', title: '(タイトル未取得)', broken: false },
  ]});  // broken は共有に載せない（受け側で false 初期化）
});
test('decodeShare: 壊れた入力は null', () => {
  assert.strictEqual(decodeShare('%%%'), null);
  assert.strictEqual(decodeShare(''), null);
});
test('decodeShare: 不正な動画IDを含むJSONは null', () => {
  const bad = Buffer.from(JSON.stringify({ n: 'x', t: [['<script>', 'x']] }), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.strictEqual(decodeShare(bad), null);
});
