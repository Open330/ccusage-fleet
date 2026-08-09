import { compact, number } from './format.js';

const COMPONENT_FIELDS = ['inputTokens', 'outputTokens', 'cacheCreationTokens', 'cacheReadTokens'];
const LISTED_MODELS = 3;
const CACHE_READ_NOTE_THRESHOLD = 0.5;

function componentSum(usage) {
  return COMPONENT_FIELDS.reduce((sum, field) => sum + number(usage[field]), 0);
}

// ccusage reports one cost per model, so a model priced at exactly zero while it
// still moved tokens means the pricing table had no entry for it.
export function unpricedModels(totals) {
  return (totals?.modelBreakdowns ?? [])
    .map((item) => ({ modelName: item.modelName ?? 'unknown', tokens: componentSum(item), cost: number(item.cost) }))
    .filter((item) => item.tokens > 0 && item.cost === 0)
    .sort((a, b) => b.tokens - a.tokens);
}

// ccusage folds agent-specific reasoning tokens into totalTokens without giving
// them a column of their own, so the visible columns can add up to slightly less.
export function reasoningDrift(totals) {
  return number(totals?.totalTokens) - componentSum(totals);
}

export function fleetNotes(fleet, settings = {}) {
  const totals = fleet?.totals ?? {};
  const totalTokens = number(totals.totalTokens);
  const notes = [];
  if (totalTokens <= 0) {
    return notes;
  }

  const cacheRead = number(totals.cacheReadTokens);
  if (cacheRead / totalTokens > CACHE_READ_NOTE_THRESHOLD) {
    notes.push(
      `Cache reads are ${((cacheRead / totalTokens) * 100).toFixed(1)}% of Total Tokens `
      + `(${compact(cacheRead)} of ${compact(totalTokens)}); output is ${compact(totals.outputTokens)}. `
      + 'Total Tokens tracks context replay, not work performed.',
    );
  }

  if (!settings.noCost) {
    const unpriced = unpricedModels(totals);
    if (unpriced.length > 0) {
      const unpricedTokens = unpriced.reduce((sum, item) => sum + item.tokens, 0);
      const listed = unpriced.slice(0, LISTED_MODELS).map((item) => `${item.modelName} ${compact(item.tokens)}`);
      const remaining = unpriced.length - listed.length;
      const suffix = remaining > 0 ? `, +${remaining} more` : '';
      notes.push(
        `${unpriced.length} model(s) have no pricing data and count as $0 `
        + `(${((unpricedTokens / totalTokens) * 100).toFixed(1)}% of tokens): ${listed.join(', ')}${suffix}. `
        + 'Reported cost is a lower bound.'
        + (settings.offline ? ' Re-run with --online to fetch current pricing.' : ''),
      );
    }
  }

  const drift = reasoningDrift(totals);
  if (drift !== 0) {
    notes.push(
      `${compact(drift)} tokens (${((Math.abs(drift) / totalTokens) * 100).toFixed(4)}%) are reasoning tokens `
      + 'counted in Total Tokens but not in the Input/Output/Cache columns.',
    );
  }

  return notes;
}

export function renderNotes(notes) {
  return notes.map((note) => `Note: ${note}`).join('\n');
}
