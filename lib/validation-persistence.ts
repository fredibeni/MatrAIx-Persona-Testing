import {
  backfillSurveyStorePersonaAgent,
  loadStoredSurveyData,
  serializeSurveyData,
  type PersonaAgentRef,
  type PersistedSurveyStore,
  type StoredSurveyLoadResult,
  type SurveyStore,
} from './history.ts';
import { VALIDATION_HOST_ORIGIN } from './validation-bridge.ts';

export const VALIDATION_STATE_ENDPOINT = `${VALIDATION_HOST_ORIGIN}/api/validation/state`;
export const VALIDATION_STATE_SCHEMA_VERSION = 1;

export interface ValidationDiskState {
  schemaVersion: 1;
  contextId: string;
  personaId: string;
  personaDisplayName: string;
  baselineSha256: string;
  personaRevision: string;
  personaDimensionCount: number;
  personaAgent: PersonaAgentRef;
  saveRevision: number;
  savedAt: string | null;
  store: SurveyStore;
}

export interface BrowserMigrationCandidate extends StoredSurveyLoadResult {
  hasData: boolean;
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function responseStateCandidate(value: unknown) {
  if (!isRecord(value)) return value;
  if (isRecord(value.state)) return value.state;
  if (isRecord(value.current)) return value.current;
  if (isRecord(value.validation_state)) return value.validation_state;
  return value;
}

export function parseValidationDiskState(value: unknown): ValidationDiskState {
  const candidate = responseStateCandidate(value);
  if (!isRecord(candidate)) {
    throw new Error('The Validation state response was not an object.');
  }

  const schemaVersion = candidate.schema_version;
  const contextId = candidate.context_id;
  const personaId = candidate.persona_id;
  const personaDisplayName = candidate.persona_display_name;
  const baselineSha256 = candidate.baseline_sha256;
  const personaRevision = candidate.persona_revision;
  const personaDimensionCount = candidate.persona_dimension_count;
  const saveRevision = candidate.save_revision;
  const savedAt = candidate.saved_at;
  const loaded = loadStoredSurveyData(
    isRecord(candidate.store) ? JSON.stringify(candidate.store) : null,
    null,
  );

  if (
    schemaVersion !== VALIDATION_STATE_SCHEMA_VERSION ||
    typeof contextId !== 'string' ||
    !contextId.trim() ||
    typeof personaId !== 'string' ||
    !personaId.trim() ||
    typeof personaDisplayName !== 'string' ||
    !personaDisplayName.trim() ||
    typeof baselineSha256 !== 'string' ||
    !baselineSha256.trim() ||
    typeof personaRevision !== 'string' ||
    !personaRevision.trim() ||
    typeof personaDimensionCount !== 'number' ||
    !Number.isInteger(personaDimensionCount) ||
    personaDimensionCount < 0 ||
    personaDimensionCount > 9999 ||
    typeof saveRevision !== 'number' ||
    !Number.isInteger(saveRevision) ||
    saveRevision < 0 ||
    !(savedAt === null || typeof savedAt === 'string') ||
    (savedAt !== null && !Number.isFinite(Date.parse(savedAt))) ||
    loaded.source !== 'v2'
  ) {
    throw new Error('The Validation state response had an invalid shape.');
  }

  const personaAgent: PersonaAgentRef = {
    contextId,
    personaId,
    displayName: personaDisplayName,
    baselineSha256,
    revisionSha256: personaRevision,
  };
  const store = backfillSurveyStorePersonaAgent(loaded.store, {
    ...personaAgent,
    revisionSha256: null,
  });

  return {
    schemaVersion: 1,
    contextId,
    personaId,
    personaDisplayName,
    baselineSha256,
    personaRevision,
    personaDimensionCount,
    personaAgent,
    saveRevision,
    savedAt,
    store,
  };
}

function errorCode(value: unknown) {
  if (!isRecord(value)) return undefined;
  if (typeof value.code === 'string') return value.code;
  if (isRecord(value.error) && typeof value.error.code === 'string') {
    return value.error.code;
  }
  if (typeof value.error === 'string') return value.error;
  return undefined;
}

function errorMessage(value: unknown, fallback: string) {
  if (!isRecord(value)) return fallback;
  if (typeof value.message === 'string' && value.message.trim()) {
    return value.message;
  }
  if (typeof value.error === 'string' && value.error.trim()) {
    return value.error;
  }
  if (isRecord(value.error) && typeof value.error.message === 'string') {
    return value.error.message;
  }
  return fallback;
}

export class ValidationPersistenceError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly currentState?: ValidationDiskState;

  constructor(
    message: string,
    status: number,
    code?: string,
    currentState?: ValidationDiskState,
  ) {
    super(message);
    this.name = 'ValidationPersistenceError';
    this.status = status;
    this.code = code;
    this.currentState = currentState;
  }
}

async function responseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ValidationPersistenceError(
      'The Validation persistence service returned invalid JSON.',
      response.status,
    );
  }
}

function persistedStore(store: SurveyStore): PersistedSurveyStore {
  return JSON.parse(serializeSurveyData(store)) as PersistedSurveyStore;
}

export async function loadValidationDiskState(
  fetchImpl: FetchLike = fetch,
): Promise<ValidationDiskState> {
  const response = await fetchImpl(VALIDATION_STATE_ENDPOINT, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    credentials: 'omit',
  });
  const body = await responseBody(response);
  if (!response.ok) {
    throw new ValidationPersistenceError(
      errorMessage(body, 'Validation results could not be loaded from disk.'),
      response.status,
      errorCode(body),
    );
  }
  return parseValidationDiskState(body);
}

export async function saveValidationDiskState(
  contextId: string,
  expectedSaveRevision: number,
  store: SurveyStore,
  fetchImpl: FetchLike = fetch,
): Promise<ValidationDiskState> {
  const response = await fetchImpl(VALIDATION_STATE_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    credentials: 'omit',
    body: JSON.stringify({
      context_id: contextId,
      expected_save_revision: expectedSaveRevision,
      store: persistedStore(store),
    }),
  });
  const body = await responseBody(response);
  if (!response.ok) {
    let currentState: ValidationDiskState | undefined;
    if (response.status === 409) {
      try {
        currentState = parseValidationDiskState(body);
      } catch {
        // A conflict without a current state is still reported to the caller.
      }
    }
    throw new ValidationPersistenceError(
      errorMessage(body, 'Validation results could not be saved to disk.'),
      response.status,
      errorCode(body),
      currentState,
    );
  }
  return parseValidationDiskState(body);
}

export function isTransientValidationSaveError(error: unknown) {
  return (
    !(error instanceof ValidationPersistenceError) ||
    error.status === 408 ||
    error.status === 429 ||
    error.status >= 500
  );
}

export async function saveValidationDiskStateWithRetry(
  contextId: string,
  expectedSaveRevision: number,
  store: SurveyStore,
  fetchImpl: FetchLike = fetch,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<ValidationDiskState> {
  try {
    return await saveValidationDiskState(
      contextId,
      expectedSaveRevision,
      store,
      fetchImpl,
    );
  } catch (error) {
    if (!isTransientValidationSaveError(error)) throw error;
    await wait(650);
    return saveValidationDiskState(
      contextId,
      expectedSaveRevision,
      store,
      fetchImpl,
    );
  }
}

export function browserMigrationCandidate(
  v2Text: string | null,
  legacyText: string | null,
): BrowserMigrationCandidate {
  const loaded = loadStoredSurveyData(v2Text, legacyText);
  return {
    ...loaded,
    hasData: Object.keys(loaded.store).length > 0,
  };
}

export function diskStateAcceptsBrowserMigration(state: ValidationDiskState) {
  return state.saveRevision === 0 && Object.keys(state.store).length === 0;
}

export function surveyStoreFingerprint(store: SurveyStore) {
  return JSON.stringify(store);
}
