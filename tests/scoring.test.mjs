import assert from 'node:assert/strict';
import {
  convergenceNarrative,
  convergencePoints,
  loadStoredSurveyData,
  mergeSurveyStores,
  parseStoredSurveyData,
  serializeSurveyData,
} from '../lib/history.ts';
import { compareSurvey, scoreSurvey } from '../lib/scoring.ts';
import { surveyById, surveys } from '../lib/surveys.ts';

function answersFor(survey, optionIndex) {
  return Object.fromEntries(
    survey.questions.map((question) => [
      question.id,
      question.options[optionIndex].id,
    ]),
  );
}

assert.deepEqual(
  surveys.map((survey) => survey.questions.length),
  [5, 5, 5, 28],
  'the four surveys must remain independent and complete',
);

const everyday = surveyById.everyday;
const everydayA = answersFor(everyday, 0);
const everydayB = answersFor(everyday, 1);
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

console.log('Survey scoring, migration, and convergence fixtures passed.');
