import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from './index.mjs';

test('validateConfig rejects empty CONTRACT_IDS and RPC_URL', () => {
  const result = validateConfig({
    CONTRACT_IDS: '',
    CONTRACT_ID: '',
    RPC_URL: '',
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /CONTRACT_IDS/);
  assert.match(result.error, /RPC_URL/);
});

test('validateConfig accepts a single contract id', () => {
  const result = validateConfig({
    CONTRACT_IDS: 'CC123',
    RPC_URL: 'https://example.com',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.contractIds, ['CC123']);
  assert.equal(result.value.RPC_URL, 'https://example.com');
});

test('validateConfig parses comma-separated CONTRACT_IDS', () => {
  const result = validateConfig({
    CONTRACT_IDS: 'CC_AAA,CC_BBB,CC_CCC',
    RPC_URL: 'https://example.com',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.contractIds, ['CC_AAA', 'CC_BBB', 'CC_CCC']);
});

test('validateConfig trims whitespace around contract ids', () => {
  const result = validateConfig({
    CONTRACT_IDS: '  CC_AAA , CC_BBB , CC_CCC  ',
    RPC_URL: 'https://example.com',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.contractIds, ['CC_AAA', 'CC_BBB', 'CC_CCC']);
});

test('validateConfig ignores trailing commas and empty segments', () => {
  const result = validateConfig({
    CONTRACT_IDS: 'CC_AAA,,CC_BBB,',
    RPC_URL: 'https://example.com',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.contractIds, ['CC_AAA', 'CC_BBB']);
});

test('validateConfig falls back from CONTRACT_IDS to CONTRACT_ID', () => {
  const result = validateConfig({
    CONTRACT_ID: 'CC_LEGACY',
    RPC_URL: 'https://example.com',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.contractIds, ['CC_LEGACY']);
});

test('validateConfig prefers CONTRACT_IDS over CONTRACT_ID', () => {
  const result = validateConfig({
    CONTRACT_IDS: 'CC_NEW',
    CONTRACT_ID: 'CC_OLD',
    RPC_URL: 'https://example.com',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.contractIds, ['CC_NEW']);
});

test('validateConfig uses default when neither CONTRACT_IDS nor CONTRACT_ID set', () => {
  const result = validateConfig({
    RPC_URL: 'https://example.com',
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.contractIds.length, 1);
  assert.match(result.value.contractIds[0], /^C[A-Z0-9]+$/);
});

test('validateConfig rejects when all ids are whitespace-only', () => {
  const result = validateConfig({
    CONTRACT_IDS: ' , , ',
    RPC_URL: 'https://example.com',
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /CONTRACT_IDS/);
});
