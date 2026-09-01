import assert from 'node:assert/strict';
import { appendValidationAgentBatch } from '../lib/validation-batch-store.ts';
import { surveys } from '../lib/surveys.ts';

const startedAt = '2026-09-01T09:00:00.000Z';
const completedAt = '2026-09-01T09:01:00.000Z';
const personaAgent = {
  contextId: 'persona-context-1',
  personaId: 'alfred',
  displayName: 'Alfred',
  baselineSha256: 'a'.repeat(64),
  revisionSha256: 'b'.repeat(64),
};

function answersFor(survey) {
  return Object.fromEntries(
    survey.questions.map((question) => [question.id, question.options[0].id]),
  );
}

function success(survey, responseIndex) {
  return {
    ok: true,
    surveyId: survey.id,
    responseIndex,
    answers: answersFor(survey),
    personaAgent,
    dimensionCount: 190,
    model: 'gpt-5.6-luna',
    reasoningEffort: 'low',
    startedAt,
    completedAt,
    executionMode: 'codex-ephemeral',
  };
}

const everyday = surveys[0];
const dials = surveys[1];
const successes = [
  success(everyday, 1),
  success(everyday, 3),
  success(dials, 2),
];
const batch = {
  batchId: 'batch-190-a',
  contextId: personaAgent.contextId,
  personaRevision: personaAgent.revisionSha256,
  dimensionCount: 190,
  runsPerSurvey: 10,
  startedAt,
  completedAt,
  results: successes,
  successes,
  failures: [],
};
const originalStore = {
  everyday: {
    human: {
      id: 'human-everyday',
      answers: answersFor(everyday),
      startedAt,
      completedAt,
      personaAgent,
    },
    agentRuns: [
      {
        id: 'older-run',
        sequence: 3,
        dimensionCount: 120,
        answers: answersFor(everyday),
        startedAt,
        completedAt,
        freshSessionAttestedAt: startedAt,
        benchmarkId: 'human-everyday',
        personaAgent,
      },
    ],
    generation: 4,
    deletedAgentRuns: [],
  },
  dials: {
    human: {
      id: 'human-dials-draft',
      answers: {},
      startedAt,
      personaAgent,
    },
    agentRuns: [],
    generation: 2,
    deletedAgentRuns: [],
  },
};
const originalSnapshot = structuredClone(originalStore);

const appended = appendValidationAgentBatch(originalStore, batch, surveys);
assert.deepEqual(
  originalStore,
  originalSnapshot,
  'the input store stays unchanged',
);
assert.equal(appended.everyday.agentRuns.length, 3);
assert.equal(appended.dials.agentRuns.length, 1);
assert.equal(appended['plot-twists'], undefined);
assert.equal(appended['internet-creature'], undefined);

const everydayBatchRuns = appended.everyday.agentRuns.slice(1);
assert.deepEqual(
  everydayBatchRuns.map((run) => ({
    id: run.id,
    sequence: run.sequence,
    benchmarkId: run.benchmarkId,
    responseIndex: run.experiment.responseIndex,
  })),
  [
    {
      id: 'agent-batch-190-a-everyday-1',
      sequence: 4,
      benchmarkId: 'human-everyday',
      responseIndex: 1,
    },
    {
      id: 'agent-batch-190-a-everyday-3',
      sequence: 6,
      benchmarkId: 'human-everyday',
      responseIndex: 3,
    },
  ],
);
assert.equal(appended.dials.agentRuns[0].sequence, 2);
assert.equal(appended.dials.agentRuns[0].benchmarkId, null);
assert.deepEqual(appended.dials.agentRuns[0].experiment, {
  id: batch.batchId,
  startedAt: batch.startedAt,
  responseIndex: 2,
  responsesPerSurvey: 10,
  surveyIds: surveys.map((survey) => survey.id),
});

const repeated = appendValidationAgentBatch(appended, batch, surveys);
assert.equal(repeated, appended, 'reapplying the same batch is a no-op');
assert.deepEqual(repeated, appended);

const collisionStore = structuredClone(originalStore);
collisionStore.everyday.agentRuns.push({
  ...collisionStore.everyday.agentRuns[0],
  id: 'agent-batch-190-a-everyday-1',
  sequence: 7,
});
const withCollision = appendValidationAgentBatch(
  collisionStore,
  batch,
  surveys,
);
const collisionRun = withCollision.everyday.agentRuns.find(
  (run) =>
    run.experiment?.id === batch.batchId && run.experiment.responseIndex === 1,
);
assert.equal(collisionRun.id, 'agent-batch-190-a-everyday-1-2');
assert.equal(
  new Set(withCollision.everyday.agentRuns.map((run) => run.sequence)).size,
  4,
);

const deletedStore = structuredClone(originalStore);
deletedStore.everyday.deletedAgentRuns = [
  { id: 'agent-batch-190-a-everyday-1', deletedAt: completedAt },
];
const respectsDeletion = appendValidationAgentBatch(
  deletedStore,
  batch,
  surveys,
);
assert.equal(
  respectsDeletion.everyday.agentRuns.some(
    (run) => run.experiment?.responseIndex === 1,
  ),
  false,
);
assert.equal(
  respectsDeletion.everyday.agentRuns.some(
    (run) => run.experiment?.responseIndex === 3,
  ),
  true,
);

console.log('Validation batch store tests passed.');
