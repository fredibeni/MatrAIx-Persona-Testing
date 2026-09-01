import type { PersonaAgentRef } from './history.ts';
import type { Answers } from './scoring.ts';
import type { SurveyDefinition } from './surveys.ts';
import { VALIDATION_HOST_ORIGIN } from './validation-bridge.ts';

export const VALIDATION_AGENT_ENDPOINT = `${VALIDATION_HOST_ORIGIN}/api/validation/agent-run`;

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
