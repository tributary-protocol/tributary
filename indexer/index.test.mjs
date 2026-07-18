import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig, runPollingLoop } from './index.mjs';

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

test('runPollingLoop serializes polls and reschedules after failure', async () => {
  let releaseFirstPoll;
  let activePolls = 0;
  let maxActivePolls = 0;
  let pollCount = 0;
  const scheduled = [];
  const loggerMessages = [];

  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  const pollFn = async () => {
    pollCount += 1;
    activePolls += 1;
    maxActivePolls = Math.max(maxActivePolls, activePolls);

    try {
      if (pollCount === 1) {
        await new Promise((resolve) => {
          releaseFirstPoll = resolve;
        });
      } else if (pollCount === 2) {
        throw new Error('boom');
      }
    } finally {
      activePolls -= 1;
    }
  };

  const schedule = (callback, delay) => {
    const entry = { callback, delay };
    scheduled.push(entry);
    return entry;
  };

  const logger = (message) => loggerMessages.push(message);

  runPollingLoop({ pollFn, pollMs: 50, schedule, logger });

  assert.equal(activePolls, 1);
  assert.equal(maxActivePolls, 1);
  assert.equal(scheduled.length, 0);

  releaseFirstPoll();
  await flush();

  assert.equal(activePolls, 0);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 50);

  scheduled[0].callback();
  await flush();

  assert.equal(pollCount, 2);
  assert.equal(activePolls, 0);
  assert.deepEqual(loggerMessages, ['boom']);
  assert.equal(maxActivePolls, 1);
  assert.equal(scheduled.length, 2);

  assert.equal(pollCount, 2);
  scheduled[1].callback();
  await flush();

  assert.equal(pollCount, 3);
  assert.equal(activePolls, 0);
  assert.equal(maxActivePolls, 1);
  assert.equal(scheduled.length, 3);
  assert.equal(scheduled[2].delay, 50);
});
