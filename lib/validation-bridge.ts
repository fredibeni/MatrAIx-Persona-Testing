import {
  activeAgentDraft,
  completedAgentRuns,
  findAgentRun,
  surveyHistory,
  type SurveyStore,
} from './history.ts';
import { surveyById, surveys, type SurveyId } from './surveys.ts';

export const VALIDATION_CHANNEL = 'matraix-validation';
export const VALIDATION_MESSAGE_VERSION = 1;
export const VALIDATION_HOST_ORIGIN =
  typeof window === 'undefined'
    ? 'http://127.0.0.1:8766'
    : window.location.origin;
export const VALIDATION_COMMAND_EVENT = 'matraix-validation-command';
export const VALIDATION_STATE_EVENT = 'matraix-validation-state';

export type ValidationViewName =
  | 'home'
  | 'quiz'
  | 'result'
  | 'comparison'
  | 'history'
  | 'license';

export type ValidationNavigationName = 'home' | 'human' | 'agent' | 'history';
export type ValidationHostViewport = 'wide' | 'medium' | 'compact';

export interface ValidationViewDescriptor {
  name: ValidationViewName;
  surveyId?: SurveyId;
  actor?: 'human' | 'agent';
  runId?: string;
}

export interface ValidationSidebarSurvey {
  id: SurveyId;
  title: string;
  humanStatus: 'not-started' | 'in-progress' | 'complete';
  humanAnswered: number;
  questionCount: number;
  agentDraftAnswered: number | null;
  completedAgentRuns: number;
}

export interface ValidationSidebarState {
  view: ValidationViewName;
  activeSurveyId?: SurveyId;
  activeActor?: 'human' | 'agent';
  activeProgress?: { answered: number; total: number };
  totals: {
    completedBenchmarks: number;
    completedAgentRuns: number;
  };
  surveys: ValidationSidebarSurvey[];
}

export interface ValidationStateMessage {
  channel: typeof VALIDATION_CHANNEL;
  version: typeof VALIDATION_MESSAGE_VERSION;
  type: 'state';
  state: ValidationSidebarState;
}

export interface ValidationRequestStateMessage {
  channel: typeof VALIDATION_CHANNEL;
  version: typeof VALIDATION_MESSAGE_VERSION;
  type: 'request-state';
}

export interface ValidationNavigateMessage {
  channel: typeof VALIDATION_CHANNEL;
  version: typeof VALIDATION_MESSAGE_VERSION;
  type: 'navigate';
  target: {
    name: ValidationNavigationName;
    surveyId?: SurveyId;
  };
}

export interface ValidationHostLayoutMessage {
  channel: typeof VALIDATION_CHANNEL;
  version: typeof VALIDATION_MESSAGE_VERSION;
  type: 'host-layout';
  viewport: ValidationHostViewport;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function isSurveyId(value: unknown): value is SurveyId {
  return typeof value === 'string' && value in surveyById;
}

export function isValidationRequestStateMessage(
  value: unknown,
): value is ValidationRequestStateMessage {
  return (
    isRecord(value) &&
    value.channel === VALIDATION_CHANNEL &&
    value.version === VALIDATION_MESSAGE_VERSION &&
    value.type === 'request-state'
  );
}

export function isValidationHostLayoutMessage(
  value: unknown,
): value is ValidationHostLayoutMessage {
  return (
    isRecord(value) &&
    value.channel === VALIDATION_CHANNEL &&
    value.version === VALIDATION_MESSAGE_VERSION &&
    value.type === 'host-layout' &&
    ['wide', 'medium', 'compact'].includes(String(value.viewport))
  );
}

export function isValidationNavigateMessage(
  value: unknown,
): value is ValidationNavigateMessage {
  if (
    !isRecord(value) ||
    value.channel !== VALIDATION_CHANNEL ||
    value.version !== VALIDATION_MESSAGE_VERSION ||
    value.type !== 'navigate' ||
    !isRecord(value.target)
  ) {
    return false;
  }

  const name = value.target.name;
  if (!['home', 'human', 'agent', 'history'].includes(String(name))) {
    return false;
  }
  return name === 'home' || isSurveyId(value.target.surveyId);
}

export function buildValidationSidebarState(
  store: SurveyStore,
  view: ValidationViewDescriptor,
): ValidationSidebarState {
  const surveyStates = surveys.map((survey): ValidationSidebarSurvey => {
    const history = surveyHistory(store, survey.id);
    const humanAnswered = Object.keys(history.human?.answers ?? {}).length;
    const draft = activeAgentDraft(history);
    return {
      id: survey.id,
      title: survey.title,
      humanStatus: history.human?.completedAt
        ? 'complete'
        : humanAnswered > 0
          ? 'in-progress'
          : 'not-started',
      humanAnswered,
      questionCount: survey.questions.length,
      agentDraftAnswered: draft ? Object.keys(draft.answers).length : null,
      completedAgentRuns: completedAgentRuns(history).length,
    };
  });

  let activeProgress: ValidationSidebarState['activeProgress'];
  if (view.name === 'quiz' && view.surveyId && view.runId) {
    const history = surveyHistory(store, view.surveyId);
    const run =
      view.actor === 'agent'
        ? findAgentRun(history, view.runId)
        : history.human?.id === view.runId
          ? history.human
          : undefined;
    if (run) {
      activeProgress = {
        answered: Object.keys(run.answers).length,
        total: surveyById[view.surveyId].questions.length,
      };
    }
  }

  return {
    view: view.name,
    activeSurveyId: view.surveyId,
    activeActor: view.actor,
    activeProgress,
    totals: {
      completedBenchmarks: surveyStates.filter(
        (survey) => survey.humanStatus === 'complete',
      ).length,
      completedAgentRuns: surveyStates.reduce(
        (total, survey) => total + survey.completedAgentRuns,
        0,
      ),
    },
    surveys: surveyStates,
  };
}

export function validationStateMessage(
  store: SurveyStore,
  view: ValidationViewDescriptor,
): ValidationStateMessage {
  return {
    channel: VALIDATION_CHANNEL,
    version: VALIDATION_MESSAGE_VERSION,
    type: 'state',
    state: buildValidationSidebarState(store, view),
  };
}
