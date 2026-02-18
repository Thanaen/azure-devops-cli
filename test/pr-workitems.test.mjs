import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPullRequestArtifactUrl, parseWorkItemIds } from '../src/pr-workitems.mjs';

test('parseWorkItemIds parses comma-separated ids, filters invalid values, and deduplicates', () => {
  const ids = parseWorkItemIds('20519, 20520,foo,0,-3,20519,  42  ');
  assert.deepEqual(ids, [20519, 20520, 42]);
});

test('parseWorkItemIds returns empty array for empty input', () => {
  assert.deepEqual(parseWorkItemIds(''), []);
  assert.deepEqual(parseWorkItemIds(undefined), []);
});

test('buildPullRequestArtifactUrl builds expected vstfs URL', () => {
  const artifactUrl = buildPullRequestArtifactUrl({
    pullRequestId: 2037,
    repository: {
      id: 'repo-id-123',
      project: { id: 'project-id-456' },
    },
  });

  assert.equal(
    artifactUrl,
    'vstfs:///Git/PullRequestId/project-id-456%2Frepo-id-123%2F2037',
  );
});

test('buildPullRequestArtifactUrl returns null when mandatory fields are missing', () => {
  assert.equal(buildPullRequestArtifactUrl({}), null);
  assert.equal(buildPullRequestArtifactUrl(null), null);
});
