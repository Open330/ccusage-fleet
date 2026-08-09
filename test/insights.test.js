import assert from 'node:assert/strict';
import test from 'node:test';

import { fleetNotes, reasoningDrift, unpricedModels } from '../src/insights.js';

function fleetWith(totals) {
  return { command: 'daily', daily: [], totals };
}

const totals = {
  cacheCreationTokens: 1_000,
  cacheReadTokens: 960_000,
  inputTokens: 20_000,
  modelBreakdowns: [
    { cacheCreationTokens: 500, cacheReadTokens: 460_000, cost: 12.5, inputTokens: 10_000, modelName: 'priced-model', outputTokens: 9_000 },
    { cacheCreationTokens: 500, cacheReadTokens: 500_000, cost: 0, inputTokens: 10_000, modelName: 'new-model', outputTokens: 10_000 },
  ],
  outputTokens: 19_000,
  totalCost: 12.5,
  totalTokens: 1_000_000,
};

test('flags models that moved tokens but carry no price', () => {
  const unpriced = unpricedModels(totals);
  assert.equal(unpriced.length, 1);
  assert.equal(unpriced[0].modelName, 'new-model');
  assert.equal(unpriced[0].tokens, 520_500);
});

test('reports the gap between total tokens and the visible columns', () => {
  assert.equal(reasoningDrift(totals), 0);
  assert.equal(reasoningDrift({ ...totals, totalTokens: 1_002_500 }), 2_500);
});

test('explains cache-read share, unpriced models, and reasoning tokens', () => {
  const notes = fleetNotes(fleetWith({ ...totals, totalTokens: 1_002_500 }), { offline: true });
  assert.equal(notes.length, 3);
  assert.match(notes[0], /Cache reads are 95\.8% of Total Tokens/);
  assert.match(notes[1], /1 model\(s\) have no pricing data and count as \$0 \(51\.9% of tokens\): new-model 520\.5K/);
  assert.match(notes[1], /Re-run with --online/);
  assert.match(notes[2], /2\.5K tokens .* are reasoning tokens/);
});

test('omits the --online hint when pricing is already fetched online', () => {
  const notes = fleetNotes(fleetWith(totals), { offline: false });
  assert.ok(notes.some((note) => note.includes('no pricing data')));
  assert.ok(notes.every((note) => !note.includes('--online')));
});

test('suppresses pricing notes when costs are hidden', () => {
  const notes = fleetNotes(fleetWith(totals), { noCost: true });
  assert.ok(notes.every((note) => !note.includes('no pricing data')));
});

test('returns no notes for an empty fleet', () => {
  assert.deepEqual(fleetNotes(fleetWith({ totalTokens: 0 }), {}), []);
});
