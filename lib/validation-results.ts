import {
  type AgentRun,
  type HumanBenchmark,
  type SurveyStore,
} from './history.ts';
import { answerLabel } from './scoring.ts';
import {
  surveys,
  type SurveyDefinition,
  type SurveyId,
  type SurveyQuestion,
} from './surveys.ts';

export type ValidationExperimentStatus = 'complete' | 'partial';

export interface ValidationExperimentOption {
  id: string;
  label: string;
  dimensionCount: number | null;
  startedAt: string;
  completedRuns: number;
  expectedRuns: number;
  status: ValidationExperimentStatus;
  runsBySurvey: Partial<Record<SurveyId, AgentRun[]>>;
}

export interface ValidationAnswerDistribution {
  answerId: string;
  label: string;
  count: number;
  share: number;
}

export interface ValidationQuestionAggregate {
  surveyId: SurveyId;
  questionId: string;
  prompt: string;
  answerCount: number;
  consensusAnswerId: string | null;
  consensusAnswerLabel: string | null;
  consensusCount: number;
  consistency: number | null;
  distribution: ValidationAnswerDistribution[];
  hasHumanBenchmark: boolean;
  humanAnswerId: string | null;
  humanAnswerLabel: string | null;
  benchmarkSimilarity: number | null;
  exactBenchmarkMatchRate: number | null;
}

export interface ValidationSurveyAggregate {
  surveyId: SurveyId;
  title: string;
  completedRuns: number;
  expectedRuns: number;
  questionCount: number;
  answerCount: number;
  consistency: number | null;
  hasHumanBenchmark: boolean;
  benchmarkSimilarity: number | null;
  exactBenchmarkMatchRate: number | null;
  benchmarkComparisons: number;
  questions: ValidationQuestionAggregate[];
}

export interface ValidationOverallAggregate {
  completedRuns: number;
  expectedRuns: number;
  surveysWithResults: number;
  surveyCount: number;
  questionCount: number;
  answerCount: number;
  consistency: number | null;
  humanBenchmarkCount: number;
  benchmarkedSurveyCount: number;
  benchmarkSimilarity: number | null;
  exactBenchmarkMatchRate: number | null;
  benchmarkComparisons: number;
}

export interface ValidationExperimentAggregate {
  experiment: ValidationExperimentOption;
  overall: ValidationOverallAggregate;
  surveys: ValidationSurveyAggregate[];
}

export interface ValidationTrendMetricPoint {
  dimensionCount: number;
  value: number;
  experimentCount: number;
  completeExperimentCount: number;
  partialExperimentCount: number;
}

export interface ValidationTrendData {
  overallBenchmarkMatch: ValidationTrendMetricPoint[];
  agentConsistency: ValidationTrendMetricPoint[];
  surveyBenchmarkMatches: Record<SurveyId, ValidationTrendMetricPoint[]>;
}

export function validationExperimentWarning(
  experiment: Pick<
    ValidationExperimentOption,
    'completedRuns' | 'expectedRuns'
  > | null,
) {
  if (!experiment || experiment.completedRuns >= experiment.expectedRuns) {
    return null;
  }
  return `Only ${experiment.completedRuns} of ${experiment.expectedRuns} Agent responses finished successfully.`;
}

interface MutableExperiment {
  id: string;
  dimensionCount: number | null;
  personaContextId: string;
  startedAt: string;
  expectedRuns: number;
  runsBySurvey: Partial<Record<SurveyId, AgentRun[]>>;
  responsesPerSurvey: number;
  surveyIds: SurveyId[];
}

function completedRun(run: AgentRun) {
  return Boolean(run.completedAt);
}

function personaContextId(run: AgentRun) {
  return run.personaAgent?.contextId ?? 'unknown-persona';
}

function orderedRuns(runs: AgentRun[]) {
  return [...runs].sort(
    (left, right) =>
      (left.experiment?.responseIndex ?? left.sequence) -
        (right.experiment?.responseIndex ?? right.sequence) ||
      Date.parse(left.completedAt ?? left.startedAt) -
        Date.parse(right.completedAt ?? right.startedAt) ||
      left.id.localeCompare(right.id),
  );
}

function explicitExperimentKey(run: AgentRun) {
  return `${personaContextId(run)}\u0000${run.dimensionCount ?? 'unknown'}\u0000${run.experiment!.id}`;
}

function addRun(
  runsBySurvey: Partial<Record<SurveyId, AgentRun[]>>,
  surveyId: SurveyId,
  run: AgentRun,
) {
  runsBySurvey[surveyId] = [...(runsBySurvey[surveyId] ?? []), run];
}

function explicitExperiments(store: SurveyStore) {
  const groups = new Map<string, MutableExperiment>();

  surveys.forEach((survey) => {
    (store[survey.id]?.agentRuns ?? [])
      .filter((run) => completedRun(run) && Boolean(run.experiment))
      .forEach((run) => {
        const metadata = run.experiment!;
        const key = explicitExperimentKey(run);
        let group = groups.get(key);
        if (!group) {
          group = {
            id: metadata.id,
            dimensionCount: run.dimensionCount,
            personaContextId: personaContextId(run),
            startedAt: metadata.startedAt,
            expectedRuns:
              metadata.responsesPerSurvey * metadata.surveyIds.length,
            runsBySurvey: {},
            responsesPerSurvey: metadata.responsesPerSurvey,
            surveyIds: metadata.surveyIds,
          };
          groups.set(key, group);
        }
        if (
          metadata.startedAt !== group.startedAt ||
          metadata.responsesPerSurvey !== group.responsesPerSurvey ||
          metadata.surveyIds.length !== group.surveyIds.length ||
          metadata.surveyIds.some(
            (surveyId, index) => surveyId !== group.surveyIds[index],
          )
        ) {
          return;
        }
        const existingSlot = (group.runsBySurvey[survey.id] ?? []).some(
          (candidate) =>
            candidate.experiment?.responseIndex === metadata.responseIndex,
        );
        if (!existingSlot) addRun(group.runsBySurvey, survey.id, run);
      });
  });

  return [...groups.values()];
}

function legacyExperiments(store: SurveyStore) {
  const groups: MutableExperiment[] = [];
  surveys.forEach((survey) => {
    (store[survey.id]?.agentRuns ?? [])
      .filter((run) => completedRun(run) && !run.experiment)
      .forEach((run) => {
        groups.push({
          id: `legacy:${survey.id}:${run.id}`,
          dimensionCount: run.dimensionCount,
          personaContextId: personaContextId(run),
          startedAt: run.completedAt ?? run.startedAt,
          expectedRuns: 1,
          runsBySurvey: { [survey.id]: [run] },
          responsesPerSurvey: 1,
          surveyIds: [survey.id],
        });
      });
  });
  return groups;
}

function completedRunCount(group: MutableExperiment) {
  return Object.values(group.runsBySurvey).reduce(
    (total, runs) => total + (runs?.length ?? 0),
    0,
  );
}

function experimentLabel(dimensionCount: number | null, occurrence: number) {
  const base =
    dimensionCount === null ? 'Unknown dimensions' : `${dimensionCount} dim`;
  return occurrence === 1 ? base : `${base}, #${occurrence}`;
}

export function validationExperimentOptions(
  store: SurveyStore,
): ValidationExperimentOption[] {
  const groups = [
    ...explicitExperiments(store),
    ...legacyExperiments(store),
  ].sort(
    (left, right) =>
      Date.parse(left.startedAt) - Date.parse(right.startedAt) ||
      left.id.localeCompare(right.id),
  );
  const occurrences = new Map<string, number>();
  const options = groups.map((group) => {
    const occurrenceKey = `${group.personaContextId}\u0000${group.dimensionCount ?? 'unknown'}`;
    const occurrence = (occurrences.get(occurrenceKey) ?? 0) + 1;
    occurrences.set(occurrenceKey, occurrence);
    const completedRuns = completedRunCount(group);
    return {
      id: group.id,
      label: experimentLabel(group.dimensionCount, occurrence),
      dimensionCount: group.dimensionCount,
      startedAt: group.startedAt,
      completedRuns,
      expectedRuns: group.expectedRuns,
      status:
        completedRuns >= group.expectedRuns
          ? ('complete' as const)
          : ('partial' as const),
      runsBySurvey: Object.fromEntries(
        Object.entries(group.runsBySurvey).map(([surveyId, runs]) => [
          surveyId,
          orderedRuns(runs ?? []),
        ]),
      ) as Partial<Record<SurveyId, AgentRun[]>>,
    };
  });
  return options.reverse();
}

function optionValue(question: SurveyQuestion, answerId: string) {
  return question.options.find((option) => option.id === answerId)?.value;
}

function answerSimilarity(
  survey: SurveyDefinition,
  question: SurveyQuestion,
  humanAnswerId: string,
  agentAnswerId: string,
) {
  if (survey.kind !== 'scale') return humanAnswerId === agentAnswerId ? 1 : 0;
  const humanValue = optionValue(question, humanAnswerId);
  const agentValue = optionValue(question, agentAnswerId);
  if (humanValue === undefined || agentValue === undefined) return null;
  return Math.max(0, 1 - Math.abs(humanValue - agentValue) / 4);
}

function aggregateQuestion(
  survey: SurveyDefinition,
  question: SurveyQuestion,
  runs: AgentRun[],
  human?: HumanBenchmark,
): ValidationQuestionAggregate {
  const optionIndex = new Map(
    question.options.map((option, index) => [option.id, index]),
  );
  const counts = new Map<string, number>();
  runs.forEach((run) => {
    const answerId = run.answers[question.id];
    if (optionIndex.has(answerId)) {
      counts.set(answerId, (counts.get(answerId) ?? 0) + 1);
    }
  });
  const answerCount = [...counts.values()].reduce(
    (total, count) => total + count,
    0,
  );
  const distribution = [...counts.entries()]
    .map(([answerId, count]) => ({
      answerId,
      label: answerLabel(question, answerId),
      count,
      share: count / answerCount,
    }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        (optionIndex.get(left.answerId) ?? 0) -
          (optionIndex.get(right.answerId) ?? 0),
    );
  const consensus = distribution[0];
  const hasHumanBenchmark = Boolean(human?.completedAt);
  const humanAnswerId = hasHumanBenchmark
    ? (human?.answers[question.id] ?? null)
    : null;
  const benchmarkAnswers =
    humanAnswerId === null
      ? []
      : runs
          .map((run) => run.answers[question.id])
          .filter((answerId) => optionIndex.has(answerId));
  const similarities = benchmarkAnswers.flatMap((answerId) => {
    const similarity = answerSimilarity(
      survey,
      question,
      humanAnswerId!,
      answerId,
    );
    return similarity === null ? [] : [similarity];
  });
  const exactMatches = benchmarkAnswers.filter(
    (answerId) => answerId === humanAnswerId,
  ).length;

  return {
    surveyId: survey.id,
    questionId: question.id,
    prompt: question.prompt,
    answerCount,
    consensusAnswerId: consensus?.answerId ?? null,
    consensusAnswerLabel: consensus?.label ?? null,
    consensusCount: consensus?.count ?? 0,
    consistency: answerCount ? (consensus?.count ?? 0) / answerCount : null,
    distribution,
    hasHumanBenchmark,
    humanAnswerId,
    humanAnswerLabel:
      humanAnswerId === null ? null : answerLabel(question, humanAnswerId),
    benchmarkSimilarity: similarities.length
      ? similarities.reduce((sum, value) => sum + value, 0) /
        similarities.length
      : null,
    exactBenchmarkMatchRate: benchmarkAnswers.length
      ? exactMatches / benchmarkAnswers.length
      : null,
  };
}

function weightedAverage(
  rows: Array<{ value: number | null; weight: number }>,
) {
  const included = rows.filter(
    (row): row is { value: number; weight: number } =>
      row.value !== null && row.weight > 0,
  );
  const weight = included.reduce((total, row) => total + row.weight, 0);
  return weight
    ? included.reduce((total, row) => total + row.value * row.weight, 0) /
        weight
    : null;
}

function experimentPersonaContext(
  runsBySurvey: ValidationExperimentOption['runsBySurvey'],
) {
  const contexts = new Set(
    Object.values(runsBySurvey)
      .flatMap((runs) => runs ?? [])
      .flatMap((run) =>
        run.personaAgent?.contextId ? [run.personaAgent.contextId] : [],
      ),
  );
  return contexts.size === 1 ? [...contexts][0] : null;
}

function matchingHumanBenchmark(
  human: HumanBenchmark | undefined,
  personaContext: string | null,
) {
  return human?.completedAt &&
    personaContext !== null &&
    human.personaAgent?.contextId === personaContext
    ? human
    : undefined;
}

function aggregateSurvey(
  survey: SurveyDefinition,
  runs: AgentRun[],
  human: HumanBenchmark | undefined,
  expectedRuns: number,
): ValidationSurveyAggregate {
  const questions = survey.questions.map((question) =>
    aggregateQuestion(survey, question, runs, human),
  );
  const answerCount = questions.reduce(
    (total, question) => total + question.answerCount,
    0,
  );
  const benchmarkComparisons = questions.reduce(
    (total, question) =>
      total +
      (question.benchmarkSimilarity === null ? 0 : question.answerCount),
    0,
  );
  return {
    surveyId: survey.id,
    title: survey.title,
    completedRuns: runs.length,
    expectedRuns,
    questionCount: survey.questions.length,
    answerCount,
    consistency: weightedAverage(
      questions.map((question) => ({
        value: question.consistency,
        weight: question.answerCount,
      })),
    ),
    hasHumanBenchmark: Boolean(human?.completedAt),
    benchmarkSimilarity: weightedAverage(
      questions.map((question) => ({
        value: question.benchmarkSimilarity,
        weight: question.answerCount,
      })),
    ),
    exactBenchmarkMatchRate: weightedAverage(
      questions.map((question) => ({
        value: question.exactBenchmarkMatchRate,
        weight: question.answerCount,
      })),
    ),
    benchmarkComparisons,
    questions,
  };
}

function aggregateValidationExperimentOption(
  store: SurveyStore,
  experiment: ValidationExperimentOption,
): ValidationExperimentAggregate {
  const explicitRun = Object.values(experiment.runsBySurvey)
    .flatMap((runs) => runs ?? [])
    .find((run) => Boolean(run.experiment));
  const expectedSurveyIds = new Set<SurveyId>(
    explicitRun?.experiment?.surveyIds ??
      (Object.keys(experiment.runsBySurvey) as SurveyId[]),
  );
  const responsesPerSurvey = explicitRun?.experiment?.responsesPerSurvey ?? 1;
  const personaContext = experimentPersonaContext(experiment.runsBySurvey);
  const surveyResults = surveys.map((survey) =>
    aggregateSurvey(
      survey,
      experiment.runsBySurvey[survey.id] ?? [],
      matchingHumanBenchmark(store[survey.id]?.human, personaContext),
      expectedSurveyIds.has(survey.id) ? responsesPerSurvey : 0,
    ),
  );
  const answerCount = surveyResults.reduce(
    (total, survey) => total + survey.answerCount,
    0,
  );
  const benchmarkComparisons = surveyResults.reduce(
    (total, survey) => total + survey.benchmarkComparisons,
    0,
  );
  return {
    experiment,
    overall: {
      completedRuns: experiment.completedRuns,
      expectedRuns: experiment.expectedRuns,
      surveysWithResults: surveyResults.filter(
        (survey) => survey.completedRuns > 0,
      ).length,
      surveyCount: surveys.length,
      questionCount: surveyResults.reduce(
        (total, survey) => total + survey.questionCount,
        0,
      ),
      answerCount,
      consistency: weightedAverage(
        surveyResults.map((survey) => ({
          value: survey.consistency,
          weight: survey.answerCount,
        })),
      ),
      humanBenchmarkCount: surveyResults.filter(
        (survey) => survey.hasHumanBenchmark,
      ).length,
      benchmarkedSurveyCount: surveyResults.filter(
        (survey) => survey.benchmarkComparisons > 0,
      ).length,
      benchmarkSimilarity: weightedAverage(
        surveyResults.map((survey) => ({
          value: survey.benchmarkSimilarity,
          weight: survey.benchmarkComparisons,
        })),
      ),
      exactBenchmarkMatchRate: weightedAverage(
        surveyResults.map((survey) => ({
          value: survey.exactBenchmarkMatchRate,
          weight: survey.benchmarkComparisons,
        })),
      ),
      benchmarkComparisons,
    },
    surveys: surveyResults,
  };
}

export function aggregateValidationExperiment(
  store: SurveyStore,
  experimentId: string,
): ValidationExperimentAggregate | null {
  const experiment = validationExperimentOptions(store).find(
    (option) => option.id === experimentId,
  );
  return experiment
    ? aggregateValidationExperimentOption(store, experiment)
    : null;
}

interface ValidationTrendObservation {
  dimensionCount: number;
  status: ValidationExperimentStatus;
  explicit: boolean;
  aggregate: ValidationExperimentAggregate;
}

function isExplicitExperiment(experiment: ValidationExperimentOption) {
  return Object.values(experiment.runsBySurvey)
    .flatMap((runs) => runs ?? [])
    .some((run) => run.experiment?.id === experiment.id);
}

function aggregateTrendMetric(
  observations: ValidationTrendObservation[],
  valueFor: (aggregate: ValidationExperimentAggregate) => number | null,
) {
  const byDimension = new Map<
    number,
    Array<{ value: number; status: ValidationExperimentStatus }>
  >();

  observations.forEach((observation) => {
    const value = valueFor(observation.aggregate);
    if (value === null) return;
    const matching = byDimension.get(observation.dimensionCount) ?? [];
    matching.push({ value, status: observation.status });
    byDimension.set(observation.dimensionCount, matching);
  });

  return [...byDimension.entries()]
    .sort(([left], [right]) => left - right)
    .map(([dimensionCount, matching]) => ({
      dimensionCount,
      value:
        matching.reduce((total, observation) => total + observation.value, 0) /
        matching.length,
      experimentCount: matching.length,
      completeExperimentCount: matching.filter(
        (observation) => observation.status === 'complete',
      ).length,
      partialExperimentCount: matching.filter(
        (observation) => observation.status === 'partial',
      ).length,
    }));
}

export function aggregateValidationTrends(
  store: SurveyStore,
): ValidationTrendData {
  const observations = validationExperimentOptions(store).flatMap(
    (experiment): ValidationTrendObservation[] => {
      if (experiment.dimensionCount === null) return [];
      return [
        {
          dimensionCount: experiment.dimensionCount,
          status: experiment.status,
          explicit: isExplicitExperiment(experiment),
          aggregate: aggregateValidationExperimentOption(store, experiment),
        },
      ];
    },
  );

  return {
    overallBenchmarkMatch: aggregateTrendMetric(
      observations,
      (aggregate) => aggregate.overall.benchmarkSimilarity,
    ),
    agentConsistency: aggregateTrendMetric(
      observations.filter(
        (observation) =>
          observation.explicit ||
          observation.aggregate.overall.completedRuns > 1,
      ),
      (aggregate) => aggregate.overall.consistency,
    ),
    surveyBenchmarkMatches: Object.fromEntries(
      surveys.map((survey) => [
        survey.id,
        aggregateTrendMetric(
          observations,
          (aggregate) =>
            aggregate.surveys.find((result) => result.surveyId === survey.id)
              ?.benchmarkSimilarity ?? null,
        ),
      ]),
    ) as Record<SurveyId, ValidationTrendMetricPoint[]>,
  };
}
