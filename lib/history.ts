import { compareSurvey, type Answers } from './scoring.ts';
import { surveyById, type SurveyId } from './surveys.ts';

export const STORAGE_KEY = 'mirror-match-surveys-v2';
export const LEGACY_STORAGE_KEY = 'mirror-match-surveys-v1';
export const INVALID_STORAGE_BACKUP_KEY =
  'mirror-match-surveys-v2-invalid-backup';

export interface StoredRun {
  answers: Answers;
  completedAt?: string;
}

export interface HumanBenchmark extends StoredRun {
  id: string;
  startedAt: string;
}

export interface AgentRun extends StoredRun {
  id: string;
  sequence: number;
  dimensionCount: number | null;
  startedAt: string;
  freshSessionAttestedAt: string | null;
  benchmarkId: string | null;
  migrated?: boolean;
}

export interface AgentRunDeletion {
  id: string;
  deletedAt: string;
}

export interface SurveyHistory {
  human?: HumanBenchmark;
  agentRuns: AgentRun[];
  recoveredLegacyDraft?: StoredRun;
  generation?: number;
  deletedAgentRuns?: AgentRunDeletion[];
}

export type SurveyStore = Partial<Record<SurveyId, SurveyHistory>>;

export interface PersistedSurveyStore {
  version: 2;
  surveys: SurveyStore;
  updatedAt: string;
}

interface LegacySurveyHistory {
  human?: StoredRun;
  persona?: StoredRun;
}

type LegacyStore = Partial<Record<SurveyId, LegacySurveyHistory>>;

export interface StoredSurveyLoadResult {
  store: SurveyStore;
  source: 'v2' | 'legacy' | 'empty';
  warning?: string;
  invalidV2Text?: string;
}

export interface ConvergencePoint {
  runId: string;
  sequence: number;
  dimensionCount: number;
  similarity: number;
  exactMatches: number;
  completedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validTimestamp(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? value
    : undefined;
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function sanitizeAnswers(surveyId: SurveyId, value: unknown): Answers {
  if (!isRecord(value)) return {};
  const survey = surveyById[surveyId];
  return Object.fromEntries(
    survey.questions.flatMap((question) => {
      const answer = value[question.id];
      return typeof answer === 'string' &&
        question.options.some((option) => option.id === answer)
        ? [[question.id, answer]]
        : [];
    }),
  );
}

function answersAreComplete(surveyId: SurveyId, answers: Answers) {
  return surveyById[surveyId].questions.every((question) =>
    question.options.some((option) => option.id === answers[question.id]),
  );
}

function normalizeRun(
  value: unknown,
  surveyId: SurveyId,
): StoredRun | undefined {
  if (!isRecord(value) || !isRecord(value.answers)) return undefined;
  const answers = sanitizeAnswers(surveyId, value.answers);
  const completedAt = validTimestamp(value.completedAt);
  return {
    answers,
    completedAt:
      completedAt && answersAreComplete(surveyId, answers)
        ? completedAt
        : undefined,
  };
}

function normalizeHuman(
  value: unknown,
  surveyId: SurveyId,
): HumanBenchmark | undefined {
  const base = normalizeRun(value, surveyId);
  if (!base || !isRecord(value)) return undefined;
  return {
    ...base,
    id: nonEmptyString(value.id) ?? `recovered-human-${surveyId}`,
    startedAt:
      validTimestamp(value.startedAt) ??
      base.completedAt ??
      new Date(0).toISOString(),
  };
}

function normalizeAgentRun(
  value: unknown,
  surveyId: SurveyId,
  fallbackSequence: number,
): AgentRun | undefined {
  const base = normalizeRun(value, surveyId);
  if (!base || !isRecord(value)) return undefined;
  const dimensionCount =
    typeof value.dimensionCount === 'number' &&
    Number.isInteger(value.dimensionCount) &&
    value.dimensionCount >= 0 &&
    value.dimensionCount <= 9999
      ? value.dimensionCount
      : null;
  return {
    ...base,
    id: nonEmptyString(value.id) ?? `recovered-agent-${fallbackSequence}`,
    sequence:
      typeof value.sequence === 'number' &&
      Number.isInteger(value.sequence) &&
      value.sequence > 0
        ? value.sequence
        : fallbackSequence,
    dimensionCount,
    startedAt:
      validTimestamp(value.startedAt) ??
      base.completedAt ??
      new Date(0).toISOString(),
    freshSessionAttestedAt:
      validTimestamp(value.freshSessionAttestedAt) ??
      validTimestamp(value.isolationConfirmedAt) ??
      null,
    benchmarkId: nonEmptyString(value.benchmarkId) ?? null,
    migrated: value.migrated === true,
  };
}

function normalizeAgentCollection(
  values: unknown[],
  surveyId: SurveyId,
): { runs: AgentRun[]; recoveredDraft?: StoredRun } {
  const usedIds = new Set<string>();
  const usedSequences = new Set<number>();
  const normalized = values
    .map((value, index) => normalizeAgentRun(value, surveyId, index + 1))
    .filter((run): run is AgentRun => Boolean(run))
    .map((run, index) => {
      let id = run.id;
      while (usedIds.has(id)) id = `${run.id}-${index + 1}`;
      usedIds.add(id);
      let sequence = run.sequence;
      while (usedSequences.has(sequence)) sequence += 1;
      usedSequences.add(sequence);
      return { ...run, id, sequence };
    });

  const eligibleDrafts = normalized.filter(
    (run) =>
      !run.completedAt &&
      run.dimensionCount !== null &&
      Boolean(run.freshSessionAttestedAt && run.benchmarkId),
  );
  const activeDraft = eligibleDrafts.at(-1);
  const invalidDraft = [...normalized]
    .reverse()
    .find((run) => !run.completedAt && run.id !== activeDraft?.id);

  return {
    runs: normalized.filter(
      (run) => Boolean(run.completedAt) || run.id === activeDraft?.id,
    ),
    recoveredDraft: invalidDraft
      ? { answers: invalidDraft.answers }
      : undefined,
  };
}

function normalizeAgentRunDeletions(value: unknown, legacyValue: unknown) {
  const deletions = new Map<string, AgentRunDeletion>();
  if (Array.isArray(value)) {
    value.forEach((candidate) => {
      if (!isRecord(candidate)) return;
      const id = nonEmptyString(candidate.id);
      const deletedAt = validTimestamp(candidate.deletedAt);
      if (!id || !deletedAt) return;
      const existing = deletions.get(id);
      if (!existing || deletedAt < existing.deletedAt)
        deletions.set(id, { id, deletedAt });
    });
  }
  if (Array.isArray(legacyValue)) {
    legacyValue.forEach((candidate) => {
      const id = nonEmptyString(candidate);
      if (id && !deletions.has(id))
        deletions.set(id, { id, deletedAt: new Date(0).toISOString() });
    });
  }
  return [...deletions.values()];
}

function deletionWins(run: AgentRun, deletion?: AgentRunDeletion) {
  if (!deletion) return false;
  return !run.completedAt || deletion.deletedAt < run.completedAt;
}

function normalizeV2(value: unknown): SurveyStore | null {
  if (!isRecord(value) || value.version !== 2 || !isRecord(value.surveys))
    return null;
  const rawSurveys = value.surveys;
  const result: SurveyStore = {};
  (Object.keys(surveyById) as SurveyId[]).forEach((surveyId) => {
    const rawHistory = rawSurveys[surveyId];
    if (!isRecord(rawHistory)) return;
    const collection = normalizeAgentCollection(
      Array.isArray(rawHistory.agentRuns) ? rawHistory.agentRuns : [],
      surveyId,
    );
    const deletedAgentRuns = normalizeAgentRunDeletions(
      rawHistory.deletedAgentRuns,
      rawHistory.deletedAgentRunIds,
    );
    const deletionById = new Map(
      deletedAgentRuns.map((deletion) => [deletion.id, deletion]),
    );
    result[surveyId] = {
      human: normalizeHuman(rawHistory.human, surveyId),
      agentRuns: collection.runs.filter(
        (run) => !deletionWins(run, deletionById.get(run.id)),
      ),
      recoveredLegacyDraft:
        normalizeRun(rawHistory.recoveredLegacyDraft, surveyId) ??
        collection.recoveredDraft,
      generation:
        typeof rawHistory.generation === 'number' &&
        Number.isInteger(rawHistory.generation) &&
        rawHistory.generation >= 0
          ? rawHistory.generation
          : 0,
      deletedAgentRuns,
    };
  });
  return result;
}

function migrateLegacy(value: unknown): SurveyStore | null {
  if (!isRecord(value)) return null;
  const legacy = value as LegacyStore;
  const result: SurveyStore = {};
  (Object.keys(surveyById) as SurveyId[]).forEach((surveyId) => {
    const candidate = legacy[surveyId];
    if (!isRecord(candidate)) return;
    const oldHuman = normalizeRun(candidate.human, surveyId);
    const oldAgent = normalizeRun(candidate.persona, surveyId);
    const human: HumanBenchmark | undefined = oldHuman
      ? {
          ...oldHuman,
          id: `migrated-human-${surveyId}`,
          startedAt: oldHuman.completedAt ?? new Date(0).toISOString(),
        }
      : undefined;
    const completedOldAgent = oldAgent?.completedAt ? oldAgent : undefined;
    result[surveyId] = {
      human,
      agentRuns: completedOldAgent
        ? [
            {
              ...completedOldAgent,
              id: `migrated-agent-${surveyId}-1`,
              sequence: 1,
              dimensionCount: null,
              startedAt: completedOldAgent.completedAt!,
              freshSessionAttestedAt: null,
              benchmarkId: human?.completedAt ? human.id : null,
              migrated: true,
            },
          ]
        : [],
      recoveredLegacyDraft:
        oldAgent && !oldAgent.completedAt ? oldAgent : undefined,
      generation: 0,
      deletedAgentRuns: [],
    };
  });
  return result;
}

export function loadStoredSurveyData(
  v2Text: string | null,
  legacyText: string | null,
): StoredSurveyLoadResult {
  let invalidV2Text: string | undefined;
  if (v2Text) {
    try {
      const normalized = normalizeV2(JSON.parse(v2Text));
      if (normalized) return { store: normalized, source: 'v2' };
      invalidV2Text = v2Text;
    } catch {
      invalidV2Text = v2Text;
    }
  }

  if (legacyText) {
    try {
      const migrated = migrateLegacy(JSON.parse(legacyText));
      if (migrated) {
        return {
          store: migrated,
          source: 'legacy',
          warning: invalidV2Text
            ? 'The newer local record was invalid. A backup was kept and the earlier record was recovered.'
            : undefined,
          invalidV2Text,
        };
      }
    } catch {
      // The warning below keeps the invalid legacy text untouched for recovery.
    }
  }

  const warning = invalidV2Text
    ? 'The local results record was invalid. It was backed up and left untouched until you save new answers.'
    : legacyText
      ? 'The earlier local results record could not be read. It was left untouched.'
      : undefined;
  return { store: {}, source: 'empty', warning, invalidV2Text };
}

export function parseStoredSurveyData(
  v2Text: string | null,
  legacyText: string | null,
): SurveyStore {
  return loadStoredSurveyData(v2Text, legacyText).store;
}

export function serializeSurveyData(surveys: SurveyStore) {
  return JSON.stringify({
    version: 2,
    surveys,
    updatedAt: new Date().toISOString(),
  } satisfies PersistedSurveyStore);
}

function mergeHumanBenchmarks(
  saved?: HumanBenchmark,
  incoming?: HumanBenchmark,
) {
  if (!saved) return incoming;
  if (!incoming) return saved;
  if (saved.id !== incoming.id) return incoming;
  if (saved.completedAt) return saved;
  if (incoming.completedAt) return incoming;
  return {
    ...saved,
    ...incoming,
    id: saved.id,
    answers: { ...saved.answers, ...incoming.answers },
    startedAt: saved.startedAt,
  };
}

function mergeAgentCollections(saved: AgentRun[], incoming: AgentRun[]) {
  const merged = saved.map((run) => ({ ...run, answers: { ...run.answers } }));
  const usedSequences = new Set(merged.map((run) => run.sequence));
  incoming.forEach((candidate) => {
    const existingIndex = merged.findIndex((run) => run.id === candidate.id);
    if (existingIndex >= 0) {
      const existing = merged[existingIndex];
      if (existing.completedAt) return;
      if (candidate.completedAt) {
        merged[existingIndex] = {
          ...candidate,
          id: existing.id,
          sequence: existing.sequence,
          dimensionCount: existing.dimensionCount,
          startedAt: existing.startedAt,
          freshSessionAttestedAt:
            existing.freshSessionAttestedAt ?? candidate.freshSessionAttestedAt,
          benchmarkId: existing.benchmarkId,
          answers: { ...candidate.answers },
        };
        return;
      }
      merged[existingIndex] = {
        ...existing,
        ...candidate,
        id: existing.id,
        sequence: existing.sequence,
        dimensionCount: existing.dimensionCount,
        startedAt: existing.startedAt,
        freshSessionAttestedAt:
          existing.freshSessionAttestedAt ?? candidate.freshSessionAttestedAt,
        benchmarkId: existing.benchmarkId,
        answers: { ...existing.answers, ...candidate.answers },
      };
      return;
    }

    let sequence = candidate.sequence;
    while (usedSequences.has(sequence)) sequence += 1;
    usedSequences.add(sequence);
    merged.push({ ...candidate, sequence, answers: { ...candidate.answers } });
  });
  return merged;
}

export function mergeSurveyStores(
  saved: SurveyStore,
  incoming: SurveyStore,
): SurveyStore {
  const merged: SurveyStore = {};
  (Object.keys(surveyById) as SurveyId[]).forEach((surveyId) => {
    const savedHistory = saved[surveyId];
    const incomingHistory = incoming[surveyId];
    if (!savedHistory && !incomingHistory) return;
    if (!savedHistory) {
      merged[surveyId] = incomingHistory;
      return;
    }
    if (!incomingHistory) {
      merged[surveyId] = savedHistory;
      return;
    }
    const savedGeneration = savedHistory.generation ?? 0;
    const incomingGeneration = incomingHistory.generation ?? 0;
    if (savedGeneration !== incomingGeneration) {
      merged[surveyId] =
        savedGeneration > incomingGeneration ? savedHistory : incomingHistory;
      return;
    }
    const savedDraft = savedHistory?.recoveredLegacyDraft;
    const incomingDraft = incomingHistory?.recoveredLegacyDraft;
    const deletedAgentRunMap = new Map<string, AgentRunDeletion>();
    [
      ...(savedHistory.deletedAgentRuns ?? []),
      ...(incomingHistory.deletedAgentRuns ?? []),
    ].forEach((deletion) => {
      const existing = deletedAgentRunMap.get(deletion.id);
      if (!existing || deletion.deletedAt < existing.deletedAt)
        deletedAgentRunMap.set(deletion.id, deletion);
    });
    const deletedAgentRuns = [...deletedAgentRunMap.values()];
    merged[surveyId] = {
      human: mergeHumanBenchmarks(savedHistory?.human, incomingHistory?.human),
      agentRuns: mergeAgentCollections(
        savedHistory?.agentRuns ?? [],
        incomingHistory?.agentRuns ?? [],
      ).filter((run) => !deletionWins(run, deletedAgentRunMap.get(run.id))),
      recoveredLegacyDraft:
        savedDraft || incomingDraft
          ? {
              answers: {
                ...savedDraft?.answers,
                ...incomingDraft?.answers,
              },
              completedAt:
                savedDraft?.completedAt ?? incomingDraft?.completedAt,
            }
          : undefined,
      generation: savedGeneration,
      deletedAgentRuns,
    };
  });
  return merged;
}

export function surveyHistory(
  store: SurveyStore,
  surveyId: SurveyId,
): SurveyHistory {
  return (
    store[surveyId] ?? {
      agentRuns: [],
      generation: 0,
      deletedAgentRuns: [],
    }
  );
}

export function completedAgentRuns(
  history: SurveyHistory,
  benchmarkId?: string,
) {
  return history.agentRuns.filter(
    (run) =>
      Boolean(run.completedAt) &&
      (benchmarkId === undefined || run.benchmarkId === benchmarkId),
  );
}

export function activeAgentDraft(history: SurveyHistory, benchmarkId?: string) {
  return [...history.agentRuns]
    .reverse()
    .find(
      (run) =>
        !run.completedAt &&
        run.dimensionCount !== null &&
        Boolean(run.freshSessionAttestedAt) &&
        (benchmarkId === undefined || run.benchmarkId === benchmarkId),
    );
}

export function findAgentRun(history: SurveyHistory, runId: string) {
  return history.agentRuns.find((run) => run.id === runId);
}

export function convergencePoints(
  surveyId: SurveyId,
  history: SurveyHistory,
): ConvergencePoint[] {
  if (!history.human?.completedAt) return [];
  const survey = surveyById[surveyId];
  return completedAgentRuns(history, history.human.id)
    .filter(
      (
        run,
      ): run is AgentRun & { completedAt: string; dimensionCount: number } =>
        Boolean(run.completedAt && run.dimensionCount !== null),
    )
    .map((run) => {
      const comparison = compareSurvey(
        survey,
        history.human!.answers,
        run.answers,
      );
      return {
        runId: run.id,
        sequence: run.sequence,
        dimensionCount: run.dimensionCount,
        similarity: comparison.similarity,
        exactMatches: comparison.exactMatches,
        completedAt: run.completedAt,
      };
    })
    .sort(
      (a, b) =>
        Date.parse(a.completedAt) - Date.parse(b.completedAt) ||
        a.sequence - b.sequence,
    );
}

function groupedAverages(points: ConvergencePoint[]) {
  const dimensions = [
    ...new Set(points.map((point) => point.dimensionCount)),
  ].sort((a, b) => a - b);
  return dimensions.map((dimensionCount) => {
    const matching = points.filter(
      (point) => point.dimensionCount === dimensionCount,
    );
    return {
      dimensionCount,
      similarity:
        matching.reduce((sum, point) => sum + point.similarity, 0) /
        matching.length,
    };
  });
}

export function convergenceNarrative(points: ConvergencePoint[]) {
  if (points.length === 0) {
    return {
      title: 'No measured Agent runs yet',
      detail:
        'Complete a fresh Agent run with a recorded dimension count to start the convergence view.',
    };
  }
  if (points.length === 1) {
    return {
      title: 'One measured run',
      detail:
        'Complete another run at a different persona-detail level to see whether similarity changes.',
    };
  }

  const groups = groupedAverages(points);
  if (groups.length === 1) {
    return {
      title: 'Same detail level so far',
      detail: `All measured runs used ${groups[0].dimensionCount} reported persona dimensions. Try another dimension count to test convergence.`,
    };
  }

  const first = groups[0];
  const last = groups.at(-1)!;
  const delta = Math.round((last.similarity - first.similarity) * 100);
  const changes = groups
    .slice(1)
    .map((group, index) => group.similarity - groups[index].similarity);
  const uneven =
    changes.some((change) => change > 0.005) &&
    changes.some((change) => change < -0.005);
  const direction =
    Math.abs(delta) <= 1
      ? 'held steady'
      : delta > 0
        ? `rose by ${delta} points`
        : `fell by ${Math.abs(delta)} points`;
  return {
    title: `Similarity ${direction}`,
    detail: `Average similarity at ${first.dimensionCount} reported dimensions is ${Math.round(first.similarity * 100)}%, compared with ${Math.round(last.similarity * 100)}% at ${last.dimensionCount}.${uneven ? ' The path across recorded depths was uneven.' : ''} This is descriptive, not proof that added dimensions caused the change.`,
  };
}
