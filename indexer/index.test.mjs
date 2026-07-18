import test from 'node:test';
import assert from 'node:assert/strict';
import { initialScanPosition, parseArgs } from './cli.mjs';
import { validateConfig } from './config.mjs';

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

test('parseArgs reads a starting ledger', () => {
  assert.deepEqual(parseArgs(['--from-ledger', '12345']), {
    ok: true,
    value: { fromLedger: 12345 },
  });
  assert.deepEqual(parseArgs(['--from-ledger=67890']), {
    ok: true,
    value: { fromLedger: 67890 },
  });
});

test('parseArgs rejects invalid starting ledgers', () => {
  for (const value of ['0', '-1', '1.5', 'ledger']) {
    const result = parseArgs(['--from-ledger', value]);
    assert.equal(result.ok, false);
    assert.match(result.error, /positive integer/);
  }
});

test('from-ledger overrides a saved cursor for the initial scan', () => {
  assert.deepEqual(initialScanPosition(12345, '999-1'), {
    startLedger: 12345,
  });
  assert.deepEqual(initialScanPosition(undefined, '999-1'), {
    cursor: '999-1',
  });
});
