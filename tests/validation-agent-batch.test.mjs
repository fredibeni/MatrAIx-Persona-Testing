import assert from 'node:assert/strict';
import {
  listPendingValidationAgentBatches,
  parseValidationAgentBatchStatus,
  parseValidationAgentBatchResult,
  runValidationAgentBatch,
  VALIDATION_AGENT_BATCH_ENDPOINT,
  VALIDATION_AGENT_BATCH_RUNS_PER_SURVEY,
} from '../lib/validation-agent.ts';
import { surveys } from '../lib/surveys.ts';

const contextId = 'persona-context-1';
const personaRevision = 'a'.repeat(64);
const dimensionCount = 190;
const batchId = `validation-batch-${'c'.repeat(24)}`;

function answersFor(survey) {
  return Object.fromEntries(
    survey.questions.map((question) => [question.id, question.options[0].id]),
  );
}

function successEntry(survey, responseIndex) {
  return {
    ok: true,
    survey_id: survey.id,
    response_index: responseIndex,
    answers: answersFor(survey),
    context_id: contextId,
    persona_id: 'alfred',
    persona_display_name: 'Alfred',
    baseline_sha256: 'b'.repeat(64),
    persona_revision: personaRevision,
    persona_dimension_count: dimensionCount,
    model: 'gpt-5.6-luna',
    reasoning_effort: 'low',
    started_at: '2026-09-01T09:00:00.000Z',
    completed_at: '2026-09-01T09:00:05.000Z',
    execution: {
      mode: 'codex-ephemeral',
      prior_conversation_messages: 0,
      memory: 'disabled',
      tools: 'disabled',
    },
  };
}

const orderedResults = surveys.flatMap((survey) =>
  Array.from({ length: VALIDATION_AGENT_BATCH_RUNS_PER_SURVEY }, (_, index) =>
    successEntry(survey, index + 1),
  ),
);

function batchBody(results = orderedResults) {
  const succeededRuns = results.filter((result) => result.ok).length;
  return {
    ok: true,
    batch_id: batchId,
    context_id: contextId,
    persona_id: 'alfred',
    persona_display_name: 'Alfred',
    baseline_sha256: 'b'.repeat(64),
    persona_revision: personaRevision,
    persona_dimension_count: dimensionCount,
    model: 'gpt-5.6-luna',
    reasoning_effort: 'low',
    runs_per_survey: VALIDATION_AGENT_BATCH_RUNS_PER_SURVEY,
    survey_count: surveys.length,
    requested_runs: orderedResults.length,
    succeeded_runs: succeededRuns,
    failed_runs: results.length - succeededRuns,
    started_at: '2026-09-01T09:00:00.000Z',
    completed_at: '2026-09-01T09:01:00.000Z',
    results,
  };
}

const parsed = parseValidationAgentBatchResult(
  batchBody(),
  surveys,
  contextId,
  personaRevision,
);
assert.equal(parsed.batchId, batchId);
assert.equal(parsed.dimensionCount, dimensionCount);
assert.equal(parsed.results.length, 40);
assert.equal(parsed.successes.length, 40);
assert.equal(parsed.failures.length, 0);
assert.deepEqual(
  parsed.successes.map((result) => [result.surveyId, result.responseIndex]),
  surveys.flatMap((survey) =>
    Array.from({ length: 10 }, (_, index) => [survey.id, index + 1]),
  ),
);

const partialResults = structuredClone(orderedResults);
partialResults[7] = {
  ok: false,
  survey_id: surveys[0].id,
  response_index: 8,
  code: 'agent_timeout',
  error: 'The Agent run did not finish in time.',
  started_at: '2026-09-01T09:00:00.000Z',
  completed_at: '2026-09-01T09:00:30.000Z',
};
const partial = parseValidationAgentBatchResult(
  batchBody(partialResults),
  surveys,
  contextId,
  personaRevision,
);
assert.equal(partial.successes.length, 39);
assert.equal(partial.failures.length, 1);
assert.deepEqual(partial.failures[0], {
  ok: false,
  surveyId: 'everyday',
  responseIndex: 8,
  code: 'agent_timeout',
  message: 'The Agent run did not finish in time.',
  startedAt: '2026-09-01T09:00:00.000Z',
  completedAt: '2026-09-01T09:00:30.000Z',
});

const wrongOrder = structuredClone(orderedResults);
wrongOrder[0].response_index = 2;
assert.throws(
  () =>
    parseValidationAgentBatchResult(
      batchBody(wrongOrder),
      surveys,
      contextId,
      personaRevision,
    ),
  /stable order/,
);

const mixedDimensions = structuredClone(orderedResults);
mixedDimensions[0].persona_dimension_count = 191;
assert.throws(
  () =>
    parseValidationAgentBatchResult(
      batchBody(mixedDimensions),
      surveys,
      contextId,
      personaRevision,
    ),
  /mixed persona dimension counts/,
);

function runningStatus(completedRuns = 0) {
  return {
    ok: true,
    status: 'running',
    batch_id: batchId,
    context_id: contextId,
    persona_revision: personaRevision,
    persona_dimension_count: dimensionCount,
    runs_per_survey: 10,
    survey_count: surveys.length,
    requested_runs: 40,
    completed_runs: completedRuns,
    succeeded_runs: completedRuns,
    failed_runs: 0,
    started_at: '2026-09-01T09:00:00.000Z',
    completed_at: null,
  };
}

const parsedRunning = parseValidationAgentBatchStatus(
  runningStatus(7),
  surveys,
  contextId,
  personaRevision,
);
assert.equal(parsedRunning.status, 'running');
assert.equal(parsedRunning.completedRuns, 7);
assert.equal(parsedRunning.result, undefined);

const completedStatusBody = {
  ...batchBody(),
  status: 'complete',
  completed_runs: 40,
};
const parsedComplete = parseValidationAgentBatchStatus(
  completedStatusBody,
  surveys,
  contextId,
  personaRevision,
);
assert.equal(parsedComplete.status, 'complete');
assert.equal(parsedComplete.result.successes.length, 40);

const pending = await listPendingValidationAgentBatches(
  surveys,
  contextId,
  async (url, init) => {
    assert.equal(String(url), VALIDATION_AGENT_BATCH_ENDPOINT);
    assert.equal(init.method, 'GET');
    return new Response(
      JSON.stringify({
        ok: true,
        context_id: contextId,
        persona_revision: personaRevision,
        batches: [runningStatus(3)],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  },
);
assert.equal(pending.length, 1);
assert.equal(pending[0].completedRuns, 3);

let requestedUrl;
let requestedInit;
const fetched = await runValidationAgentBatch(
  surveys,
  contextId,
  personaRevision,
  async (url, init) => {
    requestedUrl = String(url);
    requestedInit = init;
    return new Response(JSON.stringify(batchBody()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
);
assert.equal(requestedUrl, VALIDATION_AGENT_BATCH_ENDPOINT);
assert.deepEqual(JSON.parse(requestedInit.body), {
  context_id: contextId,
  persona_revision: personaRevision,
  runs_per_survey: 10,
});
assert.equal(fetched.successes.length, 40);

const progressUpdates = [];
let asyncRequestCount = 0;
const asyncFetched = await runValidationAgentBatch(
  surveys,
  contextId,
  personaRevision,
  async (url, init) => {
    asyncRequestCount += 1;
    if (init.method === 'POST') {
      assert.equal(String(url), VALIDATION_AGENT_BATCH_ENDPOINT);
      return new Response(JSON.stringify(runningStatus()), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    assert.match(String(url), /batch_id=validation-batch-/);
    return new Response(JSON.stringify(completedStatusBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
  async () => {},
  (status) => progressUpdates.push(status.completedRuns),
);
assert.equal(asyncRequestCount, 2);
assert.equal(asyncFetched.successes.length, 40);
assert.deepEqual(progressUpdates, [0, 40]);

console.log('Validation Agent batch client tests passed.');
