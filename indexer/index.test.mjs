import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateConfig } from './index.mjs';
import { loadCursor, saveCursor } from './index.mjs';

// ---------------------------------------------------------------------------
// validateConfig
// ---------------------------------------------------------------------------

test('validateConfig rejects missing required env values', () => {
  const result = validateConfig({
    CONTRACT_ID: '',
    RPC_URL: '',
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /CONTRACT_ID/);
  assert.match(result.error, /RPC_URL/);
});

test('validateConfig accepts populated env values', () => {
  const result = validateConfig({
    CONTRACT_ID: 'CC123',
    RPC_URL: 'https://example.com',
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.CONTRACT_ID, 'CC123');
  assert.equal(result.value.RPC_URL, 'https://example.com');
});

// ---------------------------------------------------------------------------
// loadCursor / saveCursor
// ---------------------------------------------------------------------------

/**
 * Create a fresh temporary directory for each test and override the STATE
 * environment variable so the functions use our isolated file.
 */
function withTempState(fn) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tributary-test-'));
    const stateFile = join(dir, 'state.json');
    const original = process.env.STATE;
    process.env.STATE = stateFile;
    try {
      await fn({ dir, stateFile });
    } finally {
      process.env.STATE = original ?? undefined;
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

test('loadCursor returns null when state file does not exist', withTempState(async ({ stateFile }) => {
  assert.equal(existsSync(stateFile), false, 'precondition: file must not exist');
  // loadCursor/saveCursor read STATE from process.env at call time via the
  // module-level binding, so we call them after setting the env var.
  const cursor = loadCursor();
  assert.equal(cursor, null);
}));

test('loadCursor returns null and warns on empty state file', withTempState(async ({ stateFile }) => {
  writeFileSync(stateFile, '');

  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));

  const cursor = loadCursor();

  console.warn = origWarn;

  assert.equal(cursor, null);
  assert.ok(warnings.length > 0, 'should have logged a warning');
  assert.ok(warnings[0].includes('corrupt or empty'), `unexpected warning: ${warnings[0]}`);
}));

test('loadCursor returns null and warns on corrupt state file', withTempState(async ({ stateFile }) => {
  writeFileSync(stateFile, '{bad json{{');

  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));

  const cursor = loadCursor();

  console.warn = origWarn;

  assert.equal(cursor, null);
  assert.ok(warnings.length > 0, 'should have logged a warning');
}));

test('saveCursor writes atomically and loadCursor reads back the cursor', withTempState(async ({ dir, stateFile }) => {
  const testCursor = '1234567890-1';

  saveCursor(testCursor);

  // The .tmp file must not be left behind after a successful save.
  assert.equal(existsSync(`${stateFile}.tmp`), false, '.tmp file should be cleaned up');

  // The state file must exist and contain the correct cursor.
  assert.ok(existsSync(stateFile), 'state.json must exist after saveCursor');

  const raw = JSON.parse(readFileSync(stateFile, 'utf8'));
  assert.equal(raw.cursor, testCursor);

  const loaded = loadCursor();
  assert.equal(loaded, testCursor);
}));

test('saveCursor overwrites previous cursor atomically', withTempState(async ({ stateFile }) => {
  saveCursor('cursor-v1');
  saveCursor('cursor-v2');

  const loaded = loadCursor();
  assert.equal(loaded, 'cursor-v2');
  assert.equal(existsSync(`${stateFile}.tmp`), false);
}));
