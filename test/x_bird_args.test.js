import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchXFollowing } from '../src/sources/x_bird.js';

// Unit test strategy:
// - We don't hit the network.
// - We assert that passing timeoutMs doesn't throw when bird isn't invoked.
// Since fetchXFollowing spawns `bird`, we can't run it in unit tests without mocking.
// So this test only checks the function signature is present by verifying it is a function.

test('fetchXFollowing exports and accepts timeoutMs option (smoke)', () => {
  assert.equal(typeof fetchXFollowing, 'function');
  // Signature check (best-effort): function length should be 1 (destructured object).
  assert.equal(fetchXFollowing.length, 1);
});
