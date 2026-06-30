import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDevMode } from '../src/util/devMode.js';

test('?dev query param enables dev mode (any value)', () => {
  assert.equal(isDevMode('?dev'), true);
  assert.equal(isDevMode('?dev=1'), true);
  assert.equal(isDevMode('?foo=1&dev'), true);
});

test('absent dev param → not dev (unless storage opts in)', () => {
  assert.equal(isDevMode('?foo=1'), false);
  assert.equal(isDevMode(''), false);
});

test('localStorage dev=1 enables dev mode', () => {
  assert.equal(isDevMode('', '1'), true);
  assert.equal(isDevMode('', '0'), false);
  assert.equal(isDevMode('', null), false);
});

test('malformed search string does not throw', () => {
  assert.equal(isDevMode('%'), false);
  assert.equal(isDevMode('%', '1'), true);
});
