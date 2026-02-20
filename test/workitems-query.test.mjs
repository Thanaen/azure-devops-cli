import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecentWorkItemsWiql, parseWorkItemsRecentArgs } from '../src/workitems-query.mjs';

test('parseWorkItemsRecentArgs keeps backward-compatible positional top', () => {
  const parsed = parseWorkItemsRecentArgs(['25']);

  assert.equal(parsed.top, 25);
  assert.deepEqual(parsed.filters, {
    tag: undefined,
    type: undefined,
    state: undefined,
  });
});

test('parseWorkItemsRecentArgs supports tag/type/state filters', () => {
  const parsed = parseWorkItemsRecentArgs(['--top=12', '--tag=bot', '--type=Bug', '--state=New']);

  assert.equal(parsed.top, 12);
  assert.deepEqual(parsed.filters, {
    tag: 'bot',
    type: 'Bug',
    state: 'New',
  });
});

test('parseWorkItemsRecentArgs rejects unknown options', () => {
  assert.throws(() => parseWorkItemsRecentArgs(['--foo=bar']), /Unknown option/);
});

test('buildRecentWorkItemsWiql builds combined WHERE clause', () => {
  const wiql = buildRecentWorkItemsWiql({ tag: 'bot', type: 'Bug', state: 'Active' });

  assert.equal(
    wiql,
    "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Bug' AND [System.State] = 'Active' AND [System.Tags] CONTAINS 'bot' ORDER BY [System.ChangedDate] DESC",
  );
});

test('buildRecentWorkItemsWiql escapes single quotes in filters', () => {
  const wiql = buildRecentWorkItemsWiql({ tag: "bot's", type: "Bug's" });

  assert.equal(
    wiql,
    "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Bug''s' AND [System.Tags] CONTAINS 'bot''s' ORDER BY [System.ChangedDate] DESC",
  );
});
