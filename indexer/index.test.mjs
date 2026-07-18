import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from './index.mjs';

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
