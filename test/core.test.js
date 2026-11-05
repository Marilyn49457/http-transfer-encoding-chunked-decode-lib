import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeChunked, ChunkedDecodeError } from '../src/index.js';

/**
 * Encode a JS string as UTF-8 bytes for use as test input.
 * @param {string} s
 * @returns {Uint8Array}
 */
function bytes(s) {
  return new TextEncoder().encode(s);
}

/**
 * Decode a Uint8Array as UTF-8 for comparison.
 * @param {Uint8Array} b
 * @returns {string}
 */
function text(b) {
  return new TextDecoder().decode(b);
}

test('decodes a single chunk', () => {
  const got = decodeChunked(bytes('5\r\nhello\r\n0\r\n\r\n'));
  assert.equal(text(got), 'hello');
});

test('decodes multiple chunks in order', () => {
  const got = decodeChunked(bytes('5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n'));
  assert.equal(text(got), 'hello world');
});

test('decodes an empty body', () => {
  const got = decodeChunked(bytes('0\r\n\r\n'));
  assert.equal(got.length, 0);
});

test('accepts uppercase and lowercase hex sizes', () => {
  const upper = decodeChunked(bytes('A\r\n0123456789\r\n0\r\n\r\n'));
  const lower = decodeChunked(bytes('a\r\n0123456789\r\n0\r\n\r\n'));
  assert.equal(text(upper), '0123456789');
  assert.equal(text(lower), '0123456789');
});

test('ignores chunk extensions', () => {
  const got = decodeChunked(bytes('5;foo=bar\r\nhello\r\n0\r\n\r\n'));
  assert.equal(text(got), 'hello');
});

test('skips trailer fields after the last chunk', () => {
  const got = decodeChunked(bytes('5\r\nhello\r\n0\r\nX-Trailer: value\r\n\r\n'));
  assert.equal(text(got), 'hello');
});

test('returns a Uint8Array', () => {
  const got = decodeChunked(bytes('5\r\nhello\r\n0\r\n\r\n'));
  assert.ok(got instanceof Uint8Array);
});

test('rejects a non-Uint8Array input', () => {
  assert.throws(() => decodeChunked('5\r\nhello\r\n0\r\n\r\n'), TypeError);
});

test('rejects a missing chunk-size CRLF', () => {
  assert.throws(() => decodeChunked(bytes('5hello\r\n0\r\n\r\n')), ChunkedDecodeError);
});

test('rejects an invalid chunk size', () => {
  assert.throws(() => decodeChunked(bytes('xyz\r\nhello\r\n0\r\n\r\n')), ChunkedDecodeError);
});

test('rejects truncated chunk data', () => {
  assert.throws(() => decodeChunked(bytes('5\r\nhel')), ChunkedDecodeError);
});

test('rejects a missing CRLF after chunk data', () => {
  assert.throws(() => decodeChunked(bytes('5\r\nhelloXX0\r\n\r\n')), ChunkedDecodeError);
});

test('rejects a missing terminating empty line', () => {
  assert.throws(() => decodeChunked(bytes('5\r\nhello\r\n0\r\n')), ChunkedDecodeError);
});
