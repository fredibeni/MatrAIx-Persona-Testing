import type { PersonaAgentRef } from './history.ts';
import type { Answers } from './scoring.ts';
import type { SurveyDefinition } from './surveys.ts';
import { VALIDATION_HOST_ORIGIN } from './validation-bridge.ts';

export const VALIDATION_AGENT_ENDPOINT = `${VALIDATION_HOST_ORIGIN}/api/validation/agent-run`;
export const VALIDATION_AGENT_BATCH_ENDPOINT = `${VALIDATION_HOST_ORIGIN}/api/validation/agent-batch`;
export const VALIDATION_AGENT_BATCH_RUNS_PER_SURVEY = 10 as const;

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ValidationAgentResult {
  surveyId: SurveyDefinition['id'];
  answers: Answers;
  personaAgent: PersonaAgentRef;
  dimensionCount: number;
  model: string;
  reasoningEffort: string;
  startedAt: string;
  completedAt: string;
  executionMode: 'codex-ephemeral';
}

export interface ValidationAgentBatchSuccess extends ValidationAgentResult {
  ok: true;
  responseIndex: number;
}

export interface ValidationAgentBatchFailure {
  ok: false;
  surveyId: SurveyDefinition['id'];
  responseIndex: number;
  code:
    | 'agent_timeout'
    | 'invalid_agent_output'
    | 'agent_unavailable'
    | 'agent_failed'
    | 'agent_interrupted';
  message: string;
  startedAt: string;
  completedAt: string;
}

export type ValidationAgentBatchEntry =
  | ValidationAgentBatchSuccess
  | ValidationAgentBatchFailure;

export interface ValidationAgentBatchResult {
  batchId: string;
  contextId: string;
  personaRevision: string;
  dimensionCount: number;
  runsPerSurvey: typeof VALIDATION_AGENT_BATCH_RUNS_PER_SURVEY;
  startedAt: string;
  completedAt: string;
  results: ValidationAgentBatchEntry[];
  successes: ValidationAgentBatchSuccess[];
  failures: ValidationAgentBatchFailure[];
}

export type ValidationAgentBatchStatusName = 'running' | 'complete' | 'failed';

export interface ValidationAgentBatchStatus {
  batchId: string;
  status: ValidationAgentBatchStatusName;
  contextId: string;
  personaRevision: string;
  dimensionCount: number;
  runsPerSurvey: typeof VALIDATION_AGENT_BATCH_RUNS_PER_SURVEY;
  requestedRuns: number;
  completedRuns: number;
  succeededRuns: number;
  failedRuns: number;
  startedAt: string;
  completedAt: string | null;
  code?: string;
  message?: string;
  result?: ValidationAgentBatchResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function validTimestamp(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? value
    : undefined;
}

function errorCode(value: unknown) {
  return isRecord(value) && typeof value.code === 'string'
    ? value.code
    : undefined;
}

function errorMessage(value: unknown, fallback: string) {
  if (!isRecord(value)) return fallback;
  if (typeof value.error === 'string' && value.error.trim()) return value.error;
  if (typeof value.message === 'string' && value.message.trim()) {
    return value.message;
  }
  return fallback;
}

export class ValidationAgentError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ValidationAgentError';
    this.status = status;
    this.code = code;
  }
}

async function responseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ValidationAgentError(
      'The Agent service returned invalid JSON.',
      response.status,
    );
  }
}

export function parseValidationAgentResult(
  value: unknown,
  survey: SurveyDefinition,
  expectedContextId: string,
  expectedPersonaRevision: string,
): ValidationAgentResult {
  if (!isRecord(value) || value.ok !== true || value.survey_id !== survey.id) {
    throw new Error('The Agent result had an invalid response shape.');
  }
  const contextId = nonEmptyString(value.context_id);
  const personaId = nonEmptyString(value.persona_id);
  const displayName = nonEmptyString(value.persona_display_name);
  const baselineSha256 = nonEmptyString(value.baseline_sha256);
  const personaRevision = nonEmptyString(value.persona_revision);
  const dimensionCount = value.persona_dimension_count;
  const model = nonEmptyString(value.model);
  const reasoningEffort = nonEmptyString(value.reasoning_effort);
  const startedAt = validTimestamp(value.started_at);
  const completedAt = validTimestamp(value.completed_at);
  const execution = isRecord(value.execution) ? value.execution : null;
  const rawAnswers = isRecord(value.answers) ? value.answers : null;

  if (
    contextId !== expectedContextId ||
    personaRevision !== expectedPersonaRevision ||
    !personaId ||
    !displayName ||
    !baselineSha256 ||
    typeof dimensionCount !== 'number' ||
    !Number.isInteger(dimensionCount) ||
    dimensionCount < 0 ||
    dimensionCount > 9999 ||
    !model ||
    !reasoningEffort ||
    !startedAt ||
    !completedAt ||
    !execution ||
    execution.mode !== 'codex-ephemeral' ||
    execution.prior_conversation_messages !== 0 ||
    execution.memory !== 'disabled' ||
    execution.tools !== 'disabled' ||
    !rawAnswers
  ) {
    throw new Error('The Agent result did not prove a clean persona run.');
  }

  const expectedQuestionIds = new Set(
    survey.questions.map((question) => question.id),
  );
  if (
    Object.keys(rawAnswers).length !== expectedQuestionIds.size ||
    Object.keys(rawAnswers).some(
      (questionId) => !expectedQuestionIds.has(questionId),
    )
  ) {
    throw new Error('The Agent result did not answer every survey question.');
  }

  const answers: Answers = {};
  survey.questions.forEach((question) => {
    const answer = rawAnswers[question.id];
    if (
      typeof answer !== 'string' ||
      !question.options.some((option) => option.id === answer)
    ) {
      throw new Error('The Agent result selected an unknown survey option.');
    }
    answers[question.id] = answer;
  });

  return {
    surveyId: survey.id,
    answers,
    personaAgent: {
      contextId,
      personaId,
      displayName,
      baselineSha256,
      revisionSha256: personaRevision,
    },
    dimensionCount,
    model,
    reasoningEffort,
    startedAt,
    completedAt,
    executionMode: 'codex-ephemeral',
  };
}

const validationAgentBatchFailureCodes = new Set<
  ValidationAgentBatchFailure['code']
>([
  'agent_timeout',
  'invalid_agent_output',
  'agent_unavailable',
  'agent_failed',
  'agent_interrupted',
]);

export function parseValidationAgentBatchResult(
  value: unknown,
  surveyDefinitions: readonly SurveyDefinition[],
  expectedContextId: string,
  expectedPersonaRevision: string,
): ValidationAgentBatchResult {
  if (!isRecord(value) || value.ok !== true) {
    throw new Error('The Agent batch had an invalid response shape.');
  }
  const batchId = nonEmptyString(value.batch_id);
  const contextId = nonEmptyString(value.context_id);
  const personaRevision = nonEmptyString(value.persona_revision);
  const dimensionCount = value.persona_dimension_count;
  const runsPerSurvey = value.runs_per_survey;
  const surveyCount = value.survey_count;
  const requestedRuns = value.requested_runs;
  const reportedSucceededRuns = value.succeeded_runs;
  const reportedFailedRuns = value.failed_runs;
  const startedAt = validTimestamp(value.started_at);
  const completedAt = validTimestamp(value.completed_at);
  const rawResults = Array.isArray(value.results) ? value.results : null;
  const expectedResultCount =
    surveyDefinitions.length * VALIDATION_AGENT_BATCH_RUNS_PER_SURVEY;

  if (
    !batchId ||
    contextId !== expectedContextId ||
    personaRevision !== expectedPersonaRevision ||
    typeof dimensionCount !== 'number' ||
    !Number.isInteger(dimensionCount) ||
    dimensionCount < 0 ||
    dimensionCount > 9999 ||
    runsPerSurvey !== VALIDATION_AGENT_BATCH_RUNS_PER_SURVEY ||
    surveyCount !== surveyDefinitions.length ||
    requestedRuns !== expectedResultCount ||
    !startedAt ||
    !completedAt ||
    !rawResults ||
    rawResults.length !== expectedResultCount
  ) {
    throw new Error('The Agent batch did not match the requested experiment.');
  }

  const results: ValidationAgentBatchEntry[] = rawResults.map(
    (rawEntry, resultIndex) => {
      if (!isRecord(rawEntry)) {
        throw new Error('The Agent batch contained an invalid result entry.');
      }
      const survey =
        surveyDefinitions[
          Math.floor(resultIndex / VALIDATION_AGENT_BATCH_RUNS_PER_SURVEY)
        ];
      const expectedResponseIndex =
        (resultIndex % VALIDATION_AGENT_BATCH_RUNS_PER_SURVEY) + 1;
      if (
        !survey ||
        rawEntry.survey_id !== survey.id ||
        rawEntry.response_index !== expectedResponseIndex
      ) {
        throw new Error('The Agent batch results were not in stable order.');
      }

      if (rawEntry.ok === true) {
        const parsed = parseValidationAgentResult(
          rawEntry,
          survey,
          expectedContextId,
          expectedPersonaRevision,
        );
        if (parsed.dimensionCount !== dimensionCount) {
          throw new Error('The Agent batch mixed persona dimension counts.');
        }
        return {
          ...parsed,
          ok: true,
          responseIndex: expectedResponseIndex,
        };
      }

      const code = nonEmptyString(rawEntry.code);
      const message = nonEmptyString(rawEntry.error);
      const entryStartedAt = validTimestamp(rawEntry.started_at);
      const entryCompletedAt = validTimestamp(rawEntry.completed_at);
      if (
        rawEntry.ok !== false ||
        !code ||
        !validationAgentBatchFailureCodes.has(
          code as ValidationAgentBatchFailure['code'],
        ) ||
        !message ||
        !entryStartedAt ||
        !entryCompletedAt
      ) {
        throw new Error('The Agent batch contained an invalid failure entry.');
      }
      return {
        ok: false,
        surveyId: survey.id,
        responseIndex: expectedResponseIndex,
        code: code as ValidationAgentBatchFailure['code'],
        message,
        startedAt: entryStartedAt,
        completedAt: entryCompletedAt,
      };
    },
  );

  const successes = results.filter(
    (result): result is ValidationAgentBatchSuccess => result.ok,
  );
  const failures = results.filter(
    (result): result is ValidationAgentBatchFailure => !result.ok,
  );
  if (
    reportedSucceededRuns !== successes.length ||
    reportedFailedRuns !== failures.length
  ) {
    throw new Error('The Agent batch result counts were inconsistent.');
  }

  return {
    batchId,
    contextId,
    personaRevision,
    dimensionCount,
    runsPerSurvey: VALIDATION_AGENT_BATCH_RUNS_PER_SURVEY,
    startedAt,
    completedAt,
    results,
    successes,
    failures,
  };
}

export function parseValidationAgentBatchStatus(
  value: unknown,
  surveyDefinitions: readonly SurveyDefinition[],
  expectedContextId: string,
  expectedPersonaRevision?: string,
): ValidationAgentBatchStatus {
  if (!isRecord(value)) {
    throw new Error('The Agent batch status was not an object.');
  }
  const batchId = nonEmptyString(value.batch_id);
  const status = value.status;
  const contextId = nonEmptyString(value.context_id);
  const personaRevision = nonEmptyString(value.persona_revision);
  const dimensionCount = value.persona_dimension_count;
  const runsPerSurvey = value.runs_per_survey;
  const requestedRuns = value.requested_runs;
  const completedRuns = value.completed_runs;
  const succeededRuns = value.succeeded_runs;
  const failedRuns = value.failed_runs;
  const startedAt = validTimestamp(value.started_at);
  const completedAt =
    value.completed_at === null ? null : validTimestamp(value.completed_at);
  const expectedRuns =
    surveyDefinitions.length * VALIDATION_AGENT_BATCH_RUNS_PER_SURVEY;
  if (
    !batchId ||
    !/^validation-batch-[0-9a-f]{24}$/.test(batchId) ||
    !['running', 'complete', 'failed'].includes(String(status)) ||
    contextId !== expectedContextId ||
    !personaRevision ||
    (expectedPersonaRevision !== undefined &&
      personaRevision !== expectedPersonaRevision) ||
    typeof dimensionCount !== 'number' ||
    !Number.isInteger(dimensionCount) ||
    dimensionCount < 0 ||
    dimensionCount > 9999 ||
    runsPerSurvey !== VALIDATION_AGENT_BATCH_RUNS_PER_SURVEY ||
    requestedRuns !== expectedRuns ||
    typeof completedRuns !== 'number' ||
    !Number.isInteger(completedRuns) ||
    completedRuns < 0 ||
    completedRuns > expectedRuns ||
    typeof succeededRuns !== 'number' ||
    !Number.isInteger(succeededRuns) ||
    succeededRuns < 0 ||
    typeof failedRuns !== 'number' ||
    !Number.isInteger(failedRuns) ||
    failedRuns < 0 ||
    succeededRuns + failedRuns !== completedRuns ||
    !startedAt ||
    (status === 'running' && completedAt !== null) ||
    (status !== 'running' && !completedAt)
  ) {
    throw new Error('The Agent batch status had an invalid shape.');
  }

  let result: ValidationAgentBatchResult | undefined;
  if (status === 'complete' && Array.isArray(value.results)) {
    result = parseValidationAgentBatchResult(
      value,
      surveyDefinitions,
      expectedContextId,
      personaRevision,
    );
  }
  const code = nonEmptyString(value.code);
  const message = nonEmptyString(value.error);
  if (status === 'failed' && (!code || !message)) {
    throw new Error('The failed Agent batch did not include a safe error.');
  }
  return {
    batchId,
    status: status as ValidationAgentBatchStatusName,
    contextId,
    personaRevision,
    dimensionCount,
    runsPerSurvey: VALIDATION_AGENT_BATCH_RUNS_PER_SURVEY,
    requestedRuns,
    completedRuns,
    succeededRuns,
    failedRuns,
    startedAt,
    completedAt: completedAt ?? null,
    code,
    message,
    result,
  };
}

function validationAgentBatchStatusUrl(batchId: string) {
  const url = new URL(VALIDATION_AGENT_BATCH_ENDPOINT);
  url.searchParams.set('batch_id', batchId);
  return url;
}

export async function loadValidationAgentBatchStatus(
  batchId: string,
  surveyDefinitions: readonly SurveyDefinition[],
  contextId: string,
  personaRevision: string,
  fetchImpl: FetchLike = fetch,
): Promise<ValidationAgentBatchStatus> {
  const response = await fetchImpl(validationAgentBatchStatusUrl(batchId), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    credentials: 'omit',
  });
  const body = await responseBody(response);
  if (!response.ok) {
    throw new ValidationAgentError(
      errorMessage(body, 'The Agent batch status could not be loaded.'),
      response.status,
      errorCode(body),
    );
  }
  try {
    return parseValidationAgentBatchStatus(
      body,
      surveyDefinitions,
      contextId,
      personaRevision,
    );
  } catch (error) {
    throw new ValidationAgentError(
      error instanceof Error
        ? error.message
        : 'The Agent batch status could not be validated.',
      response.status,
      'invalid_agent_batch_status',
    );
  }
}

export async function listPendingValidationAgentBatches(
  surveyDefinitions: readonly SurveyDefinition[],
  contextId: string,
  fetchImpl: FetchLike = fetch,
): Promise<ValidationAgentBatchStatus[]> {
  const response = await fetchImpl(VALIDATION_AGENT_BATCH_ENDPOINT, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    credentials: 'omit',
  });
  const body = await responseBody(response);
  if (!response.ok) {
    throw new ValidationAgentError(
      errorMessage(body, 'Pending Agent batches could not be loaded.'),
      response.status,
      errorCode(body),
    );
  }
  if (
    !isRecord(body) ||
    body.ok !== true ||
    body.context_id !== contextId ||
    !Array.isArray(body.batches)
  ) {
    throw new ValidationAgentError(
      'The pending Agent batch list had an invalid shape.',
      response.status,
      'invalid_agent_batch_list',
    );
  }
  try {
    return body.batches.map((batch) =>
      parseValidationAgentBatchStatus(batch, surveyDefinitions, contextId),
    );
  } catch (error) {
    throw new ValidationAgentError(
      error instanceof Error
        ? error.message
        : 'The pending Agent batches could not be validated.',
      response.status,
      'invalid_agent_batch_list',
    );
  }
}

export async function waitForValidationAgentBatch(
  initialStatus: ValidationAgentBatchStatus,
  surveyDefinitions: readonly SurveyDefinition[],
  fetchImpl: FetchLike = fetch,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  onProgress?: (status: ValidationAgentBatchStatus) => void,
): Promise<ValidationAgentBatchResult> {
  let status = initialStatus;
  while (status.status === 'running' || !status.result) {
    if (status.status === 'failed') {
      throw new ValidationAgentError(
        status.message ?? 'The Agent batch failed.',
        409,
        status.code,
      );
    }
    onProgress?.(status);
    if (status.status === 'complete' && !status.result) {
      status = await loadValidationAgentBatchStatus(
        status.batchId,
        surveyDefinitions,
        status.contextId,
        status.personaRevision,
        fetchImpl,
      );
      continue;
    }
    await wait(1_000);
    status = await loadValidationAgentBatchStatus(
      status.batchId,
      surveyDefinitions,
      status.contextId,
      status.personaRevision,
      fetchImpl,
    );
  }
  onProgress?.(status);
  return status.result;
}

export async function runValidationAgentSurvey(
  survey: SurveyDefinition,
  contextId: string,
  personaRevision: string,
  fetchImpl: FetchLike = fetch,
): Promise<ValidationAgentResult> {
  const response = await fetchImpl(VALIDATION_AGENT_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    credentials: 'omit',
    body: JSON.stringify({
      survey_id: survey.id,
      context_id: contextId,
      persona_revision: personaRevision,
    }),
  });
  const body = await responseBody(response);
  if (!response.ok) {
    throw new ValidationAgentError(
      errorMessage(body, 'The Agent could not complete this survey.'),
      response.status,
      errorCode(body),
    );
  }
  try {
    return parseValidationAgentResult(body, survey, contextId, personaRevision);
  } catch (error) {
    throw new ValidationAgentError(
      error instanceof Error
        ? error.message
        : 'The Agent result could not be validated.',
      response.status,
      'invalid_agent_result',
    );
  }
}

export async function runValidationAgentBatch(
  surveyDefinitions: readonly SurveyDefinition[],
  contextId: string,
  personaRevision: string,
  fetchImpl: FetchLike = fetch,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  onProgress?: (status: ValidationAgentBatchStatus) => void,
): Promise<ValidationAgentBatchResult> {
  const response = await fetchImpl(VALIDATION_AGENT_BATCH_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    credentials: 'omit',
    body: JSON.stringify({
      context_id: contextId,
      persona_revision: personaRevision,
      runs_per_survey: VALIDATION_AGENT_BATCH_RUNS_PER_SURVEY,
    }),
  });
  const body = await responseBody(response);
  if (!response.ok) {
    throw new ValidationAgentError(
      errorMessage(body, 'The Agent batch could not be completed.'),
      response.status,
      errorCode(body),
    );
  }
  try {
    if (isRecord(body) && body.status === undefined) {
      return parseValidationAgentBatchResult(
        body,
        surveyDefinitions,
        contextId,
        personaRevision,
      );
    }
    const status = parseValidationAgentBatchStatus(
      body,
      surveyDefinitions,
      contextId,
      personaRevision,
    );
    return waitForValidationAgentBatch(
      status,
      surveyDefinitions,
      fetchImpl,
      wait,
      onProgress,
    );
  } catch (error) {
    if (error instanceof ValidationAgentError) throw error;
    throw new ValidationAgentError(
      error instanceof Error
        ? error.message
        : 'The Agent batch could not be validated.',
      response.status,
      'invalid_agent_batch_result',
    );
  }
}
