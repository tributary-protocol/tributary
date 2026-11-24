import test from 'node:test';
import assert from 'node:assert/strict';
import { decode } from './dist/index.js';

test('decode function', () => {
  // Test existing codes
  assert.equal(decode(1), 'NoRecipients');
  assert.equal(decode(2), 'LengthMismatch');
  assert.equal(decode(3), 'ZeroShare');
  assert.equal(decode(4), 'BadShareTotal');
  assert.equal(decode(5), 'SplitNotFound');
  assert.equal(decode(6), 'SplitImmutable');
  assert.equal(decode(7), 'InvalidAmount');
  assert.equal(decode(8), 'NothingToDistribute');
  assert.equal(decode(9), 'TooManyRecipients');
  assert.equal(decode(10), 'BadChildSplit');
  assert.equal(decode(11), 'ArithmeticOverflow');

  // Test unknown code
  assert.equal(decode(99), undefined);
  assert.equal(decode(0), undefined);
});
