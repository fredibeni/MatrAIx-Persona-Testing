import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  activeAgentDraft,
  backfillSurveyStorePersonaAgent,
  bindPendingAgentRuns,
  completedAgentRuns,
  convergenceNarrative,
  convergencePoints,
  loadStoredSurveyData,
  mergeSurveyStores,
  parseStoredSurveyData,
  serializeSurveyData,
} from '../lib/history.ts';
import { compareSurvey, scoreSurvey } from '../lib/scoring.ts';
import { surveyById, surveys } from '../lib/surveys.ts';
import {
  buildValidationSidebarState,
  isValidationHostLayoutMessage,
  isValidationNavigateMessage,
  isValidationRequestStateMessage,
} from '../lib/validation-bridge.ts';
import {
  parseValidationAgentResult,
  runValidationAgentSurvey,
  VALIDATION_AGENT_ENDPOINT,
} from '../lib/validation-agent.ts';
import {
  browserMigrationCandidate,
  diskStateAcceptsBrowserMigration,
  loadValidationDiskState,
  parseValidationDiskState,
  saveValidationDiskState,
  saveValidationDiskStateWithRetry,
  VALIDATION_STATE_ENDPOINT,
  ValidationPersistenceError,
} from '../lib/validation-persistence.ts';

function answersFor(survey, optionIndex) {
  return Object.fromEntries(
    survey.questions.map((question) => [
      question.id,
      question.options[optionIndex].id,
    ]),
  );
}

const alfredPersona = {
  contextId: 'persona-context-1',
  personaId: 'persona_alfred',
  displayName: 'Alfred',
  baselineSha256: 'abc123',
  revisionSha256: 'revision-alfred-1',
};
const secondPersona = {
  contextId: 'persona-context-2',
  personaId: 'persona_second',
  displayName: 'Second',
  baselineSha256: 'def456',
  revisionSha256: 'revision-second-1',
};

assert.deepEqual(
  surveys.map((survey) => survey.questions.length),
  [5, 5, 5, 28],
  'the four surveys must remain independent and complete',
);

const validationManifest = JSON.parse(
  readFileSync(
    new URL(
      '../matraix/personal-persona/survey/validation-surveys.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
assert.deepEqual(
  validationManifest,
  {
    version: 1,
    surveys: Object.fromEntries(
      surveys.map(({ id, title, questions }) => [
        id,
        {
          id,
          title,
          questions: questions.map(({ id: questionId, prompt, options }) => ({
            id: questionId,
            prompt,
            options: options.map(({ id: optionId, label }) => ({
              id: optionId,
              label,
            })),
          })),
        },
      ]),
    ),
  },
  'the browser and isolated Agent endpoint must use the same survey manifest',
);

const everyday = surveyById.everyday;
const everydayA = answersFor(everyday, 0);
const everydayB = answersFor(everyday, 1);

const validAgentBody = {
  ok: true,
  survey_id: everyday.id,
  answers: everydayA,
  context_id: alfredPersona.contextId,
  persona_id: alfredPersona.personaId,
  persona_display_name: alfredPersona.displayName,
  baseline_sha256: alfredPersona.baselineSha256,
  persona_revision: alfredPersona.revisionSha256,
  persona_dimension_count: 198,
  model: 'gpt-5.6-luna',
  reasoning_effort: 'low',
  started_at: '2026-09-01T09:00:00.000Z',
  completed_at: '2026-09-01T09:00:04.000Z',
  execution: {
    mode: 'codex-ephemeral',
    prior_conversation_messages: 0,
    memory: 'disabled',
    tools: 'disabled',
  },
};
const parsedAgentResult = parseValidationAgentResult(
  validAgentBody,
  everyday,
  alfredPersona.contextId,
  alfredPersona.revisionSha256,
);
assert.deepEqual(parsedAgentResult.answers, everydayA);
assert.equal(parsedAgentResult.executionMode, 'codex-ephemeral');

let requestedAgentUrl;
let requestedAgentInit;
const fetchedAgentResult = await runValidationAgentSurvey(
  everyday,
  alfredPersona.contextId,
  alfredPersona.revisionSha256,
  async (url, init) => {
    requestedAgentUrl = String(url);
    requestedAgentInit = init;
    return new Response(JSON.stringify(validAgentBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
);
assert.equal(requestedAgentUrl, VALIDATION_AGENT_ENDPOINT);
assert.deepEqual(JSON.parse(requestedAgentInit.body), {
  survey_id: everyday.id,
  context_id: alfredPersona.contextId,
  persona_revision: alfredPersona.revisionSha256,
});
assert.deepEqual(fetchedAgentResult.answers, everydayA);

assert.throws(
  () =>
    parseValidationAgentResult(
      {
        ...validAgentBody,
        answers: { ...everydayA, restaurant: 'not-an-option' },
      },
      everyday,
      alfredPersona.contextId,
      alfredPersona.revisionSha256,
    ),
  /unknown survey option/,
);
const identical = compareSurvey(everyday, everydayA, everydayA);
assert.equal(identical.similarity, 1);
assert.equal(identical.exactMatches, 5);
assert.equal(identical.differences.length, 0);

const different = compareSurvey(everyday, everydayA, everydayB);
assert.equal(different.similarity, 0);
assert.equal(different.exactMatches, 0);
assert.equal(different.differences.length, 5);

const dials = surveyById.dials;
const lowDials = answersFor(dials, 0);
const highDials = answersFor(dials, 4);
const dialComparison = compareSurvey(dials, lowDials, highDials);
assert.equal(dialComparison.similarity, 0);
assert.equal(dialComparison.exactMatches, 0);
assert.equal(dialComparison.withinOne, 0);
assert.equal(
  dialComparison.differences.every((item) => item.distance === 4),
  true,
);

const dialHuman = Object.fromEntries(
  dials.questions.map((question, index) => [question.id, String(index + 1)]),
);
const dialAgentValues = ['1', '3', '1', '5', '5'];
const dialAgent = Object.fromEntries(
  dials.questions.map((question, index) => [
    question.id,
    dialAgentValues[index],
  ]),
);
const mixedDialComparison = compareSurvey(dials, dialHuman, dialAgent);
assert.equal(mixedDialComparison.similarity, 0.8);
assert.equal(mixedDialComparison.exactMatches, 2);
assert.equal(mixedDialComparison.withinOne, 4);
assert.equal(mixedDialComparison.differences.length, 3);

const silly = surveyById['internet-creature'];
const sillyA = answersFor(silly, 0);
const sillyB = answersFor(silly, 1);
const sillyResult = scoreSurvey(silly, sillyA);
assert.equal(sillyResult.kind, 'silly');
assert.equal(sillyResult.code.length, 4);
assert.equal(sillyResult.scores.length, 4);
assert.equal(
  sillyResult.scores.every((score) => score >= 0 && score <= 100),
  true,
);

const sillyComparison = compareSurvey(silly, sillyA, sillyB);
assert.equal(sillyComparison.similarity, 0);
assert.equal(sillyComparison.differences.length, 28);
assert.equal(typeof sillyComparison.profileSimilarity, 'number');

const legacy = JSON.stringify({
  everyday: {
    human: { answers: everydayA, completedAt: '2026-01-01T10:00:00.000Z' },
    persona: { answers: everydayB, completedAt: '2026-01-01T10:05:00.000Z' },
  },
});
const migrated = parseStoredSurveyData(null, legacy);
assert.equal(migrated.everyday.human.id, 'migrated-human-everyday');
assert.equal(migrated.everyday.agentRuns.length, 1);
assert.equal(migrated.everyday.agentRuns[0].dimensionCount, null);
assert.equal(
  migrated.everyday.agentRuns[0].benchmarkId,
  migrated.everyday.human.id,
);

const recoveredFromInvalidV2 = loadStoredSurveyData(
  JSON.stringify({ version: 99, surveys: {} }),
  legacy,
);
assert.equal(recoveredFromInvalidV2.source, 'legacy');
assert.equal(recoveredFromInvalidV2.store.everyday.agentRuns.length, 1);
assert.equal(typeof recoveredFromInvalidV2.warning, 'string');

const invalidCompletedLegacy = JSON.stringify({
  everyday: {
    human: {
      answers: { ...everydayA, restaurant: 'not-a-real-option' },
      completedAt: 'not-a-date',
    },
  },
});
const sanitized = parseStoredSurveyData(null, invalidCompletedLegacy);
assert.equal(sanitized.everyday.human.answers.restaurant, undefined);
assert.equal(sanitized.everyday.human.completedAt, undefined);

const roundTripped = parseStoredSurveyData(serializeSurveyData(migrated), null);
assert.equal(roundTripped.everyday.agentRuns.length, 1);
assert.equal(roundTripped.everyday.agentRuns[0].dimensionCount, null);
assert.equal(roundTripped.everyday.human.personaAgent, null);

const identifiedStore = {
  everyday: {
    human: {
      id: 'identified-human',
      answers: everydayA,
      startedAt: '2026-01-01T09:00:00.000Z',
      completedAt: '2026-01-01T09:05:00.000Z',
      personaAgent: alfredPersona,
    },
    agentRuns: [
      {
        id: 'identified-agent',
        sequence: 1,
        dimensionCount: 8,
        answers: everydayA,
        startedAt: '2026-01-01T10:00:00.000Z',
        completedAt: '2026-01-01T10:05:00.000Z',
        freshSessionAttestedAt: '2026-01-01T10:00:00.000Z',
        benchmarkId: 'identified-human',
        personaAgent: alfredPersona,
      },
    ],
    generation: 0,
    deletedAgentRuns: [],
  },
};
const identifiedRoundTrip = parseStoredSurveyData(
  serializeSurveyData(identifiedStore),
  null,
);
assert.deepEqual(
  identifiedRoundTrip.everyday.human.personaAgent,
  alfredPersona,
);
assert.deepEqual(
  identifiedRoundTrip.everyday.agentRuns[0].personaAgent,
  alfredPersona,
);

const backfilledLegacyIdentity = backfillSurveyStorePersonaAgent(migrated, {
  ...alfredPersona,
  revisionSha256: null,
});
assert.equal(
  backfilledLegacyIdentity.everyday.human.personaAgent.displayName,
  'Alfred',
);
assert.equal(
  backfilledLegacyIdentity.everyday.agentRuns[0].personaAgent.revisionSha256,
  null,
);

const agentFirstDraft = {
  id: 'agent-first-draft',
  sequence: 1,
  dimensionCount: 7,
  answers: Object.fromEntries(
    everyday.questions
      .slice(0, 2)
      .map((question) => [question.id, question.options[0].id]),
  ),
  startedAt: '2026-01-01T08:00:00.000Z',
  freshSessionAttestedAt: '2026-01-01T08:00:00.000Z',
  benchmarkId: null,
};
const agentFirstDraftRoundTrip = parseStoredSurveyData(
  serializeSurveyData({
    everyday: {
      agentRuns: [agentFirstDraft],
      generation: 0,
      deletedAgentRuns: [],
    },
  }),
  null,
);
assert.equal(agentFirstDraftRoundTrip.everyday.agentRuns.length, 1);
assert.equal(
  activeAgentDraft(agentFirstDraftRoundTrip.everyday)?.id,
  agentFirstDraft.id,
);
assert.equal(agentFirstDraftRoundTrip.everyday.agentRuns[0].benchmarkId, null);

function mixedAnswers(matchCount) {
  return Object.fromEntries(
    everyday.questions.map((question, index) => [
      question.id,
      question.options[index < matchCount ? 0 : 1].id,
    ]),
  );
}

const convergenceHistory = {
  human: {
    id: 'human-1',
    answers: everydayA,
    startedAt: '2026-01-01T09:00:00.000Z',
    completedAt: '2026-01-01T09:05:00.000Z',
  },
  agentRuns: [
    {
      id: 'run-1',
      sequence: 1,
      dimensionCount: 0,
      answers: everydayB,
      startedAt: '2026-01-01T10:00:00.000Z',
      completedAt: '2026-01-01T10:05:00.000Z',
      freshSessionAttestedAt: '2026-01-01T10:00:00.000Z',
      benchmarkId: 'human-1',
    },
    {
      id: 'run-2',
      sequence: 2,
      dimensionCount: 4,
      answers: mixedAnswers(2),
      startedAt: '2026-01-01T11:00:00.000Z',
      completedAt: '2026-01-01T11:05:00.000Z',
      freshSessionAttestedAt: '2026-01-01T11:00:00.000Z',
      benchmarkId: 'human-1',
    },
    {
      id: 'run-3',
      sequence: 3,
      dimensionCount: 9,
      answers: everydayA,
      startedAt: '2026-01-01T12:00:00.000Z',
      completedAt: '2026-01-01T12:05:00.000Z',
      freshSessionAttestedAt: '2026-01-01T12:00:00.000Z',
      benchmarkId: 'human-1',
    },
    {
      id: 'run-4',
      sequence: 4,
      dimensionCount: 9,
      answers: mixedAnswers(4),
      startedAt: '2026-01-01T13:00:00.000Z',
      completedAt: '2026-01-01T13:05:00.000Z',
      freshSessionAttestedAt: '2026-01-01T13:00:00.000Z',
      benchmarkId: 'human-1',
    },
    {
      id: 'legacy',
      sequence: 5,
      dimensionCount: null,
      answers: everydayA,
      startedAt: '2026-01-01T14:00:00.000Z',
      completedAt: '2026-01-01T14:05:00.000Z',
      freshSessionAttestedAt: null,
      benchmarkId: 'human-1',
      migrated: true,
    },
  ],
};

const agentFirstComplete = {
  id: 'agent-first-complete',
  sequence: 1,
  dimensionCount: 7,
  answers: everydayB,
  startedAt: '2026-01-01T07:00:00.000Z',
  completedAt: '2026-01-01T07:05:00.000Z',
  freshSessionAttestedAt: '2026-01-01T07:00:00.000Z',
  benchmarkId: null,
};
const migratedUnpairedRun = {
  ...agentFirstComplete,
  id: 'migrated-unpaired',
  sequence: 3,
  benchmarkId: null,
  migrated: true,
};
const alreadyBoundRun = {
  ...agentFirstComplete,
  id: 'already-bound',
  sequence: 4,
  benchmarkId: 'human-other',
};
const pendingHistory = {
  agentRuns: [
    agentFirstComplete,
    { ...agentFirstDraft, sequence: 2 },
    migratedUnpairedRun,
    alreadyBoundRun,
  ],
  generation: 0,
  deletedAgentRuns: [],
};
const boundPendingHistory = bindPendingAgentRuns(pendingHistory, 'human-later');
assert.equal(
  boundPendingHistory.agentRuns.find((run) => run.id === agentFirstComplete.id)
    .benchmarkId,
  'human-later',
);
assert.equal(
  boundPendingHistory.agentRuns.find((run) => run.id === agentFirstDraft.id)
    .benchmarkId,
  'human-later',
);
assert.equal(
  boundPendingHistory.agentRuns.find((run) => run.id === migratedUnpairedRun.id)
    .benchmarkId,
  null,
);
assert.equal(
  boundPendingHistory.agentRuns.find((run) => run.id === alreadyBoundRun.id)
    .benchmarkId,
  'human-other',
);
assert.deepEqual(
  bindPendingAgentRuns(boundPendingHistory, 'human-later'),
  boundPendingHistory,
);

const mergedAgentFirstBinding = mergeSurveyStores(
  {
    everyday: {
      agentRuns: [agentFirstComplete],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
  {
    everyday: {
      agentRuns: [
        {
          ...agentFirstComplete,
          benchmarkId: 'human-later',
          answers: everydayA,
          completedAt: '2026-01-01T07:06:00.000Z',
        },
      ],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
);
assert.equal(
  mergedAgentFirstBinding.everyday.agentRuns[0].benchmarkId,
  'human-later',
);
assert.deepEqual(
  mergedAgentFirstBinding.everyday.agentRuns[0].answers,
  everydayB,
);
assert.equal(
  mergedAgentFirstBinding.everyday.agentRuns[0].completedAt,
  agentFirstComplete.completedAt,
);

assert.deepEqual(
  convergencePoints('everyday', {
    agentRuns: [agentFirstComplete],
    generation: 0,
    deletedAgentRuns: [],
  }),
  [],
);
const laterHuman = {
  id: 'human-later',
  answers: everydayA,
  startedAt: '2026-01-01T09:00:00.000Z',
  completedAt: '2026-01-01T09:05:00.000Z',
};
const humanWithUnboundAgent = {
  human: laterHuman,
  agentRuns: [agentFirstComplete],
  generation: 0,
  deletedAgentRuns: [],
};
assert.deepEqual(convergencePoints('everyday', humanWithUnboundAgent), []);
const humanWithBoundAgent = bindPendingAgentRuns(
  humanWithUnboundAgent,
  laterHuman.id,
);
assert.equal(convergencePoints('everyday', humanWithBoundAgent).length, 1);
assert.equal(
  convergencePoints('everyday', humanWithBoundAgent)[0].runId,
  agentFirstComplete.id,
);

const mismatchedPersonaHistory = {
  human: { ...laterHuman, personaAgent: alfredPersona },
  agentRuns: [
    {
      ...agentFirstComplete,
      benchmarkId: laterHuman.id,
      personaAgent: secondPersona,
    },
  ],
  generation: 0,
  deletedAgentRuns: [],
};
assert.equal(
  completedAgentRuns(mismatchedPersonaHistory, laterHuman.id).length,
  0,
);
assert.equal(convergencePoints('everyday', mismatchedPersonaHistory).length, 0);
assert.equal(
  bindPendingAgentRuns(
    {
      ...mismatchedPersonaHistory,
      agentRuns: [
        {
          ...mismatchedPersonaHistory.agentRuns[0],
          benchmarkId: null,
        },
      ],
    },
    laterHuman.id,
  ).agentRuns[0].benchmarkId,
  null,
);

const preHumanSidebarState = buildValidationSidebarState(
  {
    everyday: {
      agentRuns: [agentFirstComplete, agentFirstDraft],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
  {
    name: 'quiz',
    surveyId: 'everyday',
    actor: 'agent',
    runId: agentFirstDraft.id,
  },
);
assert.equal(preHumanSidebarState.totals.completedBenchmarks, 0);
assert.equal(preHumanSidebarState.totals.completedAgentRuns, 1);
assert.equal(preHumanSidebarState.surveys[0].humanStatus, 'not-started');
assert.equal(preHumanSidebarState.surveys[0].agentDraftAnswered, 2);
assert.deepEqual(preHumanSidebarState.activeProgress, {
  answered: 2,
  total: everyday.questions.length,
});

const points = convergencePoints('everyday', convergenceHistory);
assert.deepEqual(
  points.map((point) => point.dimensionCount),
  [0, 4, 9, 9],
);
assert.deepEqual(
  points.map((point) => point.similarity),
  [0, 0.4, 1, 0.8],
);
assert.equal(
  convergenceNarrative(points).title,
  'Similarity rose by 90 points',
);

const unevenNarrative = convergenceNarrative([
  { ...points[0], dimensionCount: 0, similarity: 0.7 },
  { ...points[1], dimensionCount: 4, similarity: 0.3 },
  { ...points[2], dimensionCount: 9, similarity: 0.8 },
]);
assert.match(unevenNarrative.detail, /path across recorded depths was uneven/);

const sidebarState = buildValidationSidebarState(
  { everyday: convergenceHistory },
  {
    name: 'quiz',
    surveyId: 'everyday',
    actor: 'agent',
    runId: 'run-2',
  },
);
assert.equal(sidebarState.totals.completedBenchmarks, 1);
assert.equal(sidebarState.totals.completedAgentRuns, 5);
assert.deepEqual(sidebarState.activeProgress, { answered: 5, total: 5 });
assert.equal(sidebarState.surveys[0].humanStatus, 'complete');
assert.equal(sidebarState.surveys[0].completedAgentRuns, 5);
assert.equal(
  isValidationNavigateMessage({
    channel: 'matraix-validation',
    version: 1,
    type: 'navigate',
    target: { name: 'human', surveyId: 'everyday' },
  }),
  true,
);
assert.equal(
  isValidationNavigateMessage({
    channel: 'matraix-validation',
    version: 1,
    type: 'navigate',
    target: { name: 'history', surveyId: 'unknown' },
  }),
  false,
);
assert.equal(
  isValidationRequestStateMessage({
    channel: 'matraix-validation',
    version: 1,
    type: 'request-state',
  }),
  true,
);
assert.equal(
  isValidationHostLayoutMessage({
    channel: 'matraix-validation',
    version: 1,
    type: 'host-layout',
    viewport: 'medium',
  }),
  true,
);
assert.equal(
  isValidationHostLayoutMessage({
    channel: 'matraix-validation',
    version: 1,
    type: 'host-layout',
    viewport: 'phone',
  }),
  false,
);

const mergedTabs = mergeSurveyStores(
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: [convergenceHistory.agentRuns[0]],
    },
  },
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: [
        {
          ...convergenceHistory.agentRuns[1],
          sequence: 1,
        },
      ],
    },
  },
);
assert.equal(mergedTabs.everyday.agentRuns.length, 2);
assert.deepEqual(
  mergedTabs.everyday.agentRuns.map((run) => run.sequence),
  [1, 2],
);

const firstEverydayQuestion = everyday.questions[0];
const secondEverydayQuestion = everyday.questions[1];
const draftHumanWithAnswer = {
  id: 'human-toggle-draft',
  answers: {
    [firstEverydayQuestion.id]: firstEverydayQuestion.options[0].id,
  },
  startedAt: '2026-01-03T09:00:00.000Z',
  personaAgent: alfredPersona,
};
const humanAnswerCleared = mergeSurveyStores(
  {
    everyday: {
      human: draftHumanWithAnswer,
      agentRuns: [],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
  {
    everyday: {
      human: {
        ...draftHumanWithAnswer,
        answers: {
          [secondEverydayQuestion.id]: secondEverydayQuestion.options[0].id,
        },
        clearedAnswers: [firstEverydayQuestion.id],
      },
      agentRuns: [],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
);
assert.equal(
  humanAnswerCleared.everyday.human.answers[firstEverydayQuestion.id],
  undefined,
);
assert.equal(
  humanAnswerCleared.everyday.human.answers[secondEverydayQuestion.id],
  secondEverydayQuestion.options[0].id,
);
assert.deepEqual(humanAnswerCleared.everyday.human.clearedAnswers, [
  firstEverydayQuestion.id,
]);

const clearedAnswerRoundTrip = parseStoredSurveyData(
  serializeSurveyData(humanAnswerCleared),
  null,
);
assert.equal(
  clearedAnswerRoundTrip.everyday.human.answers[firstEverydayQuestion.id],
  undefined,
);
assert.deepEqual(clearedAnswerRoundTrip.everyday.human.clearedAnswers, [
  firstEverydayQuestion.id,
]);

const humanAnswerReselected = mergeSurveyStores(humanAnswerCleared, {
  everyday: {
    human: {
      ...humanAnswerCleared.everyday.human,
      answers: {
        ...humanAnswerCleared.everyday.human.answers,
        [firstEverydayQuestion.id]: firstEverydayQuestion.options[1].id,
      },
      clearedAnswers: undefined,
    },
    agentRuns: [],
    generation: 0,
    deletedAgentRuns: [],
  },
});
assert.equal(
  humanAnswerReselected.everyday.human.answers[firstEverydayQuestion.id],
  firstEverydayQuestion.options[1].id,
);
assert.equal(humanAnswerReselected.everyday.human.clearedAnswers, undefined);

const draftAgentWithAnswer = {
  id: 'agent-toggle-draft',
  sequence: 1,
  dimensionCount: 7,
  answers: {
    [firstEverydayQuestion.id]: firstEverydayQuestion.options[0].id,
  },
  startedAt: '2026-01-03T10:00:00.000Z',
  freshSessionAttestedAt: '2026-01-03T10:00:00.000Z',
  benchmarkId: null,
  personaAgent: alfredPersona,
};
const agentAnswerCleared = mergeSurveyStores(
  {
    everyday: {
      agentRuns: [draftAgentWithAnswer],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
  {
    everyday: {
      agentRuns: [
        {
          ...draftAgentWithAnswer,
          answers: {},
          clearedAnswers: [firstEverydayQuestion.id],
        },
      ],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
);
assert.equal(
  agentAnswerCleared.everyday.agentRuns[0].answers[firstEverydayQuestion.id],
  undefined,
);
assert.deepEqual(agentAnswerCleared.everyday.agentRuns[0].clearedAnswers, [
  firstEverydayQuestion.id,
]);

const savedCompletedHuman = {
  ...convergenceHistory.human,
  answers: everydayA,
};
const savedCompletedAgent = convergenceHistory.agentRuns[0];
const completedRecordsStayImmutable = mergeSurveyStores(
  {
    everyday: {
      human: savedCompletedHuman,
      agentRuns: [savedCompletedAgent],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
  {
    everyday: {
      human: {
        ...savedCompletedHuman,
        answers: everydayB,
        completedAt: undefined,
      },
      agentRuns: [
        {
          ...savedCompletedAgent,
          answers: everydayA,
          completedAt: undefined,
        },
      ],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
);
assert.deepEqual(
  completedRecordsStayImmutable.everyday.human.answers,
  everydayA,
);
assert.deepEqual(
  completedRecordsStayImmutable.everyday.agentRuns[0].answers,
  everydayB,
);
assert.equal(
  completedRecordsStayImmutable.everyday.human.completedAt,
  savedCompletedHuman.completedAt,
);
assert.equal(
  completedRecordsStayImmutable.everyday.agentRuns[0].completedAt,
  savedCompletedAgent.completedAt,
);

const identityBackfillMerge = mergeSurveyStores(
  {
    everyday: {
      human: { ...savedCompletedHuman, personaAgent: null },
      agentRuns: [{ ...savedCompletedAgent, personaAgent: null }],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
  {
    everyday: {
      human: { ...savedCompletedHuman, personaAgent: alfredPersona },
      agentRuns: [{ ...savedCompletedAgent, personaAgent: alfredPersona }],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
);
assert.deepEqual(
  identityBackfillMerge.everyday.human.personaAgent,
  alfredPersona,
);
assert.deepEqual(
  identityBackfillMerge.everyday.agentRuns[0].personaAgent,
  alfredPersona,
);
const conflictingIdentityMerge = mergeSurveyStores(identityBackfillMerge, {
  everyday: {
    human: { ...savedCompletedHuman, personaAgent: secondPersona },
    agentRuns: [{ ...savedCompletedAgent, personaAgent: secondPersona }],
    generation: 0,
    deletedAgentRuns: [],
  },
});
assert.deepEqual(
  conflictingIdentityMerge.everyday.human.personaAgent,
  alfredPersona,
);
assert.deepEqual(
  conflictingIdentityMerge.everyday.agentRuns[0].personaAgent,
  alfredPersona,
);

const discardedDraftStaysDeleted = mergeSurveyStores(
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: [],
      generation: 0,
      deletedAgentRuns: [
        {
          id: 'discarded-run',
          deletedAt: '2026-01-01T09:30:00.000Z',
        },
      ],
    },
  },
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: [
        {
          ...convergenceHistory.agentRuns[0],
          id: 'discarded-run',
          completedAt: undefined,
        },
      ],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
);
assert.equal(discardedDraftStaysDeleted.everyday.agentRuns.length, 0);
assert.deepEqual(discardedDraftStaysDeleted.everyday.deletedAgentRuns, [
  { id: 'discarded-run', deletedAt: '2026-01-01T09:30:00.000Z' },
]);

const earlierCompletionBeatsStaleDiscard = mergeSurveyStores(
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: [savedCompletedAgent],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: [],
      generation: 0,
      deletedAgentRuns: [
        { id: savedCompletedAgent.id, deletedAt: '2026-01-01T10:06:00.000Z' },
      ],
    },
  },
);
assert.equal(earlierCompletionBeatsStaleDiscard.everyday.agentRuns.length, 1);

const earlierDiscardBeatsStaleCompletion = mergeSurveyStores(
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: [],
      generation: 0,
      deletedAgentRuns: [
        { id: savedCompletedAgent.id, deletedAt: '2026-01-01T10:04:00.000Z' },
      ],
    },
  },
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: [savedCompletedAgent],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
);
assert.equal(earlierDiscardBeatsStaleCompletion.everyday.agentRuns.length, 0);

const replacementHuman = {
  ...convergenceHistory.human,
  id: 'human-2',
  answers: everydayB,
  startedAt: '2026-01-02T09:00:00.000Z',
  completedAt: '2026-01-02T09:05:00.000Z',
};
const newerGenerationWins = mergeSurveyStores(
  {
    everyday: {
      human: replacementHuman,
      agentRuns: [],
      generation: 1,
      deletedAgentRuns: [],
    },
  },
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: convergenceHistory.agentRuns,
      generation: 0,
      deletedAgentRuns: [],
    },
  },
);
assert.equal(newerGenerationWins.everyday.generation, 1);
assert.equal(newerGenerationWins.everyday.human.id, 'human-2');
assert.deepEqual(newerGenerationWins.everyday.human.answers, everydayB);
assert.equal(newerGenerationWins.everyday.agentRuns.length, 0);

const persistedStore = JSON.parse(
  serializeSurveyData({ everyday: convergenceHistory }),
);
const diskEnvelope = {
  schema_version: 1,
  context_id: 'persona-context-1',
  persona_id: 'persona_alfred',
  persona_display_name: 'Alfred',
  baseline_sha256: 'abc123',
  persona_revision: 'revision-alfred-1',
  persona_dimension_count: 198,
  save_revision: 3,
  saved_at: '2026-08-31T17:47:00.000Z',
  store: persistedStore,
};
const parsedDiskState = parseValidationDiskState(diskEnvelope);
assert.equal(parsedDiskState.contextId, 'persona-context-1');
assert.equal(parsedDiskState.personaDisplayName, 'Alfred');
assert.equal(parsedDiskState.personaRevision, 'revision-alfred-1');
assert.equal(parsedDiskState.personaDimensionCount, 198);
assert.deepEqual(parsedDiskState.personaAgent, alfredPersona);
assert.equal(parsedDiskState.saveRevision, 3);
assert.equal(parsedDiskState.store.everyday.agentRuns.length, 5);
assert.equal(
  parsedDiskState.store.everyday.human.personaAgent.revisionSha256,
  null,
);
assert.equal(
  parseValidationDiskState({ current: diskEnvelope }).contextId,
  'persona-context-1',
);
assert.throws(
  () => parseValidationDiskState({ ...diskEnvelope, save_revision: -1 }),
  /invalid shape/,
);
for (const personaDimensionCount of [undefined, -1, 1.5, 10_000]) {
  assert.throws(
    () =>
      parseValidationDiskState({
        ...diskEnvelope,
        persona_dimension_count: personaDimensionCount,
      }),
    /invalid shape/,
  );
}

assert.equal(
  diskStateAcceptsBrowserMigration({
    ...parsedDiskState,
    saveRevision: 0,
    savedAt: null,
    store: {},
  }),
  true,
);
assert.equal(diskStateAcceptsBrowserMigration(parsedDiskState), false);
const migrationCandidate = browserMigrationCandidate(null, legacy);
assert.equal(migrationCandidate.source, 'legacy');
assert.equal(migrationCandidate.hasData, true);

let loadedRequest;
const loadedFromDisk = await loadValidationDiskState(async (input, init) => {
  loadedRequest = { input, init };
  return new Response(JSON.stringify(diskEnvelope), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
assert.equal(loadedRequest.input, VALIDATION_STATE_ENDPOINT);
assert.equal(loadedRequest.init.method, 'GET');
assert.equal(loadedFromDisk.saveRevision, 3);

let savedRequest;
const savedToDisk = await saveValidationDiskState(
  'persona-context-1',
  3,
  identifiedStore,
  async (input, init) => {
    savedRequest = { input, init };
    return new Response(
      JSON.stringify({
        ...diskEnvelope,
        save_revision: 4,
        saved_at: '2026-08-31T17:48:00.000Z',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  },
);
assert.equal(savedRequest.input, VALIDATION_STATE_ENDPOINT);
assert.equal(savedRequest.init.method, 'POST');
const savedBody = JSON.parse(savedRequest.init.body);
assert.equal(savedBody.context_id, 'persona-context-1');
assert.equal(savedBody.expected_save_revision, 3);
assert.equal(savedBody.store.version, 2);
assert.deepEqual(
  savedBody.store.surveys.everyday.human.personaAgent,
  alfredPersona,
);
assert.deepEqual(
  savedBody.store.surveys.everyday.agentRuns[0].personaAgent,
  alfredPersona,
);
assert.equal(savedToDisk.saveRevision, 4);

await assert.rejects(
  saveValidationDiskState(
    'persona-context-1',
    2,
    {},
    async () =>
      new Response(
        JSON.stringify({
          ok: false,
          code: 'validation_state_changed',
          error: 'The current results changed on disk.',
          state: diskEnvelope,
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
  ),
  (error) => {
    assert.equal(error instanceof ValidationPersistenceError, true);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'validation_state_changed');
    assert.match(error.message, /current results changed/i);
    assert.equal(error.currentState.saveRevision, 3);
    return true;
  },
);

let transientAttempts = 0;
let retryWaits = 0;
const savedAfterRetry = await saveValidationDiskStateWithRetry(
  'persona-context-1',
  3,
  { everyday: convergenceHistory },
  async () => {
    transientAttempts += 1;
    if (transientAttempts === 1) {
      return new Response(
        JSON.stringify({ code: 'disk_busy', error: 'disk is busy' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ ...diskEnvelope, save_revision: 4 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
  async () => {
    retryWaits += 1;
  },
);
assert.equal(transientAttempts, 2);
assert.equal(retryWaits, 1);
assert.equal(savedAfterRetry.saveRevision, 4);

console.log(
  'Survey scoring, migration, convergence, and disk persistence fixtures passed.',
);
