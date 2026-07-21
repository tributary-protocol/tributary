import test from 'node:test';
import assert from 'node:assert/strict';
import { initialScanPosition, parseArgs } from './cli.mjs';
import {
  validateConfig,
  shouldLog,
  formatLogEntry,
  cursorLedger,
  calculateScanLag,
  createMetricsTracker,
} from './index.mjs';

test('validateConfig rejects missing required env values', () => {
  const result = validateConfig({
    CONTRACT_ID: '',
    RPC_URL: '',
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /CONTRACT_ID/);
  assert.match(result.error, /RPC_URL/);
});

test('validateConfig accepts populated env values and defaults LOG_LEVEL to info', () => {
  const result = validateConfig({
    CONTRACT_ID: 'CC123',
    RPC_URL: 'https://example.com',
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.CONTRACT_ID, 'CC123');
  assert.equal(result.value.RPC_URL, 'https://example.com');
  assert.equal(result.value.LOG_LEVEL, 'info');
});

test('validateConfig accepts custom valid LOG_LEVEL and rejects invalid LOG_LEVEL', () => {
  const validResult = validateConfig({
    CONTRACT_ID: 'CC123',
    RPC_URL: 'https://example.com',
    LOG_LEVEL: 'DEBUG',
  });
  assert.equal(validResult.ok, true);
  assert.equal(validResult.value.LOG_LEVEL, 'debug');

  const invalidResult = validateConfig({
    CONTRACT_ID: 'CC123',
    RPC_URL: 'https://example.com',
    LOG_LEVEL: 'verbose',
  });
  assert.equal(invalidResult.ok, false);
  assert.match(invalidResult.error, /LOG_LEVEL must be one of/);
});

test('shouldLog respects log level severity threshold', () => {
  assert.equal(shouldLog('info', 'debug'), false);
  assert.equal(shouldLog('info', 'info'), true);
  assert.equal(shouldLog('info', 'warn'), true);
  assert.equal(shouldLog('info', 'error'), true);

  assert.equal(shouldLog('warn', 'info'), false);
  assert.equal(shouldLog('warn', 'warn'), true);

  assert.equal(shouldLog('debug', 'debug'), true);
});

test('formatLogEntry formats structured JSON log entry', () => {
  const raw = formatLogEntry('info', 'Poll completed', {
    eventsIndexedTotal: 42,
    scanLagLedgers: 5,
  });
  const parsed = JSON.parse(raw);

  assert.equal(parsed.level, 'info');
  assert.equal(parsed.message, 'Poll completed');
  assert.equal(parsed.eventsIndexedTotal, 42);
  assert.equal(parsed.scanLagLedgers, 5);
  assert.ok(typeof parsed.timestamp === 'string');
  assert.ok(!Number.isNaN(Date.parse(parsed.timestamp)));
});

test('cursorLedger extracts ledger sequence from cursor', () => {
  // 100 << 32 = 429496729600. Cursor format: "<packed_ledger_seq>-<entry_id>"
  const packedLedger = (BigInt(100) << 32n).toString();
  const cursor = `${packedLedger}-0000000001`;

  assert.equal(cursorLedger(cursor), 100);
  assert.equal(cursorLedger('invalid'), null);
  assert.equal(cursorLedger(null), null);
});

test('calculateScanLag calculates ledger difference accurately', () => {
  const packedLedger = (BigInt(500) << 32n).toString();
  const cursor = `${packedLedger}-0000000001`;

  assert.equal(calculateScanLag(510, cursor), 10);
  assert.equal(calculateScanLag(500, cursor), 0);
  assert.equal(calculateScanLag(490, cursor), 0); // clamp to 0 if cursor ahead
  assert.equal(calculateScanLag(510, 500), 10); // supports numeric cursor ledger
  assert.equal(calculateScanLag(510, null), null);
  assert.equal(calculateScanLag(null, cursor), null);
});

test('createMetricsTracker updates and retrieves metrics state', () => {
  const tracker = createMetricsTracker();
  assert.deepEqual(tracker.getMetrics(), {
    eventsIndexedTotal: 0,
    eventsIndexedLastPoll: 0,
    scanLagLedgers: null,
    errorsTotal: 0,
  });

  tracker.recordPollSuccess({ eventsIndexed: 15, scanLagLedgers: 3 });
  assert.equal(tracker.getMetrics().eventsIndexedLastPoll, 15);
  assert.equal(tracker.getMetrics().eventsIndexedTotal, 15);
  assert.equal(tracker.getMetrics().scanLagLedgers, 3);
  assert.equal(tracker.getMetrics().errorsTotal, 0);

  tracker.recordPollSuccess({ eventsIndexed: 10, scanLagLedgers: 1 });
  assert.equal(tracker.getMetrics().eventsIndexedLastPoll, 10);
  assert.equal(tracker.getMetrics().eventsIndexedTotal, 25);
  assert.equal(tracker.getMetrics().scanLagLedgers, 1);

  tracker.recordError();
  assert.equal(tracker.getMetrics().errorsTotal, 1);
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
