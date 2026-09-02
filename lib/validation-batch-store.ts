import { surveyHistory, type AgentRun, type SurveyStore } from './history.ts';
import type {
  ValidationAgentBatchResult,
  ValidationAgentBatchSuccess,
} from './validation-agent.ts';
import type { SurveyDefinition, SurveyId } from './surveys.ts';

type ValidationExperimentRuns = Partial<
  Record<SurveyId, readonly Pick<AgentRun, 'id'>[]>
>;

const permanentValidationDeletionTimestamp = new Date(0).toISOString();

function batchRunId(
  batchId: string,
  surveyId: SurveyId,
  responseIndex: number,
) {
  return `agent-${batchId}-${surveyId}-${responseIndex}`;
}

function nextAvailableId(baseId: string, usedIds: Set<string>) {
  if (!usedIds.has(baseId)) return baseId;
  let suffix = 2;
  while (usedIds.has(`${baseId}-${suffix}`)) suffix += 1;
  return `${baseId}-${suffix}`;
}

function successForSurvey(
  success: ValidationAgentBatchSuccess,
  surveyId: SurveyId,
) {
  return success.surveyId === surveyId;
}

export function appendValidationAgentBatch(
  store: SurveyStore,
  batch: ValidationAgentBatchResult,
  surveyDefinitions: readonly SurveyDefinition[],
): SurveyStore {
  const surveyIds = surveyDefinitions.map((survey) => survey.id);
  let nextStore = store;

  surveyDefinitions.forEach((survey) => {
    const history = surveyHistory(store, survey.id);
    const successes = batch.successes
      .filter((success) => successForSurvey(success, survey.id))
      .sort((left, right) => left.responseIndex - right.responseIndex);
    if (!successes.length) return;

    const agentRuns = [...history.agentRuns];
    const usedIds = new Set(agentRuns.map((run) => run.id));
    const deletedIds = new Set(
      (history.deletedAgentRuns ?? []).map((deletion) => deletion.id),
    );
    const usedSequences = new Set(agentRuns.map((run) => run.sequence));
    const sequenceBase = Math.max(0, ...usedSequences);
    const benchmarkId = history.human?.completedAt ? history.human.id : null;
    let changed = false;

    successes.forEach((success) => {
      const baseId = batchRunId(
        batch.batchId,
        survey.id,
        success.responseIndex,
      );
      const slotAlreadyStored = agentRuns.some(
        (run) =>
          run.experiment?.id === batch.batchId &&
          run.experiment.responseIndex === success.responseIndex,
      );
      if (slotAlreadyStored || deletedIds.has(baseId)) return;

      const id = nextAvailableId(baseId, usedIds);
      let sequence = sequenceBase + success.responseIndex;
      while (usedSequences.has(sequence)) sequence += 1;

      const run: AgentRun = {
        id,
        sequence,
        dimensionCount: success.dimensionCount,
        answers: { ...success.answers },
        startedAt: success.startedAt,
        completedAt: success.completedAt,
        freshSessionAttestedAt: success.startedAt,
        benchmarkId,
        personaAgent: { ...success.personaAgent },
        experiment: {
          id: batch.batchId,
          startedAt: batch.startedAt,
          responseIndex: success.responseIndex,
          responsesPerSurvey: batch.runsPerSurvey,
          surveyIds: [...surveyIds],
        },
      };
      usedIds.add(id);
      usedSequences.add(sequence);
      agentRuns.push(run);
      changed = true;
    });

    if (!changed) return;
    if (nextStore === store) nextStore = { ...store };
    nextStore[survey.id] = { ...history, agentRuns };
  });

  return nextStore;
}

export function deleteValidationExperimentRuns(
  store: SurveyStore,
  runsBySurvey: ValidationExperimentRuns,
): SurveyStore {
  let nextStore = store;

  (
    Object.entries(runsBySurvey) as Array<
      [SurveyId, readonly Pick<AgentRun, 'id'>[] | undefined]
    >
  ).forEach(([surveyId, selectedRuns]) => {
    if (!selectedRuns?.length) return;

    const history = surveyHistory(store, surveyId);
    const runIds = new Set(selectedRuns.map((run) => run.id));
    const agentRuns = history.agentRuns.filter((run) => !runIds.has(run.id));
    if (agentRuns.length === history.agentRuns.length) return;

    const deletedAgentRuns = new Map(
      (history.deletedAgentRuns ?? []).map((deletion) => [
        deletion.id,
        deletion,
      ]),
    );
    runIds.forEach((id) => {
      deletedAgentRuns.set(id, {
        id,
        deletedAt: permanentValidationDeletionTimestamp,
      });
    });

    if (nextStore === store) nextStore = { ...store };
    nextStore[surveyId] = {
      ...history,
      agentRuns,
      deletedAgentRuns: [...deletedAgentRuns.values()],
    };
  });

  return nextStore;
}
