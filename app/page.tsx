'use client';

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  History,
  Home,
  Info,
  LoaderCircle,
  RotateCcw,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  bindPendingAgentRuns,
  completedAgentRuns,
  convergenceNarrative,
  convergencePoints,
  findAgentRun,
  mergeSurveyStores,
  surveyHistory,
  type AgentRun,
  type ConvergencePoint,
  type HumanBenchmark,
  type PersonaAgentRef,
  type StoredRun,
  type SurveyHistory,
  type SurveyStore,
} from '@/lib/history';
import {
  compareSurvey,
  percent,
  scoreSurvey,
  type CategoryResult,
  type DialResult,
  type SillyResult,
  type SurveyResult,
} from '@/lib/scoring';
import {
  axisMeta,
  categoryMeta,
  surveyById,
  surveys,
  type SurveyDefinition,
  type SurveyId,
} from '@/lib/surveys';
import {
  isValidationHostLayoutMessage,
  isValidationNavigateMessage,
  isValidationRequestStateMessage,
  isValidationRunAgentBatchMessage,
  VALIDATION_COMMAND_EVENT,
  VALIDATION_HOST_ORIGIN,
  VALIDATION_STATE_EVENT,
  validationStateMessage,
} from '@/lib/validation-bridge';
import {
  loadValidationDiskState,
  saveValidationDiskStateWithRetry,
  surveyStoreFingerprint,
  ValidationPersistenceError,
  type ValidationDiskState,
} from '@/lib/validation-persistence';
import {
  listPendingValidationAgentBatches,
  runValidationAgentBatch,
  ValidationAgentError,
  waitForValidationAgentBatch,
} from '@/lib/validation-agent';
import { appendValidationAgentBatch } from '@/lib/validation-batch-store';
import {
  aggregateValidationExperiment,
  validationExperimentWarning,
  validationExperimentOptions,
  type ValidationQuestionAggregate,
  type ValidationSurveyAggregate,
} from '@/lib/validation-results';

type Actor = 'human' | 'agent';

type SaveNotice = {
  kind: 'saving' | 'saved' | 'error';
  message: string;
};

type View =
  | { name: 'home' }
  | { name: 'quiz'; surveyId: SurveyId; actor: Actor; runId: string }
  | { name: 'result'; surveyId: SurveyId; actor: Actor; runId: string }
  | { name: 'comparison'; surveyId: SurveyId; runId: string }
  | { name: 'history'; surveyId: SurveyId }
  | { name: 'license' };

const actorMeta = {
  human: { label: 'Human benchmark', shortLabel: 'Human', Icon: UserRound },
  agent: { label: 'Agent run', shortLabel: 'Agent', Icon: Bot },
};

const HOME_VIEW: View = { name: 'home' };
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

function makeId(prefix: string) {
  const unique =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${unique}`;
}

function formatDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return dateFormatter.format(date);
}

function formatSavedTime(value: string | null) {
  return value ? timeFormatter.format(new Date(value)) : null;
}

function surveyThemeStyle(survey: SurveyDefinition) {
  return {
    '--survey': survey.color,
    '--pale': survey.pale,
    '--ink': survey.ink,
  } as CSSProperties;
}

function personaAgentLabel(personaAgent: PersonaAgentRef | null) {
  return personaAgent
    ? `Digital ${personaAgent.displayName}`
    : 'Persona not recorded';
}

function samePersonaContext(
  first: PersonaAgentRef | null,
  second: PersonaAgentRef | null,
) {
  return !first || !second || first.contextId === second.contextId;
}

function runCompletionOrder(a: AgentRun, b: AgentRun) {
  return (
    Date.parse(a.completedAt ?? a.startedAt) -
      Date.parse(b.completedAt ?? b.startedAt) || a.sequence - b.sequence
  );
}

function runStatus(run?: StoredRun) {
  if (run?.completedAt) return 'complete';
  if (run && Object.keys(run.answers).length > 0) return 'in-progress';
  return 'not-started';
}

function resolveView(store: SurveyStore, view: View): View {
  if (!('surveyId' in view)) return view;

  const history = surveyHistory(store, view.surveyId);
  if (view.name === 'quiz') {
    const run =
      view.actor === 'human'
        ? history.human
        : findAgentRun(history, view.runId);
    return run ? view : HOME_VIEW;
  }
  if (view.name === 'result') {
    const run =
      view.actor === 'human'
        ? history.human
        : findAgentRun(history, view.runId);
    return run?.completedAt ? view : HOME_VIEW;
  }
  if (view.name === 'comparison') {
    const agentRun = findAgentRun(history, view.runId);
    return history.human?.completedAt &&
      agentRun?.completedAt &&
      agentRun.benchmarkId === history.human.id &&
      samePersonaContext(history.human.personaAgent, agentRun.personaAgent)
      ? view
      : HOME_VIEW;
  }

  return history.human?.completedAt &&
    completedAgentRuns(history, history.human.id).length > 0
    ? view
    : HOME_VIEW;
}

function StatusPill({
  status,
  label,
}: {
  status: 'complete' | 'in-progress' | 'not-started';
  label?: string;
}) {
  if (status === 'complete') {
    return (
      <span className="status-pill status-complete">
        <Check size={12} strokeWidth={3} /> {label ?? 'Complete'}
      </span>
    );
  }
  if (status === 'in-progress')
    return (
      <span className="status-pill status-progress">
        {label ?? 'In progress'}
      </span>
    );
  return (
    <span className="status-pill status-empty">{label ?? 'Not started'}</span>
  );
}

function Logo() {
  return (
    <span className="flex items-center gap-3">
      <span className="logo-mark" aria-hidden="true">
        <span />
        <span />
      </span>
      <span>
        <span className="font-display block text-[18px] font-black leading-none tracking-[-0.03em]">
          Mirror Match
        </span>
        <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          Persona check
        </span>
      </span>
    </span>
  );
}

function Shell({
  children,
  onHome,
  simple = false,
}: {
  children: ReactNode;
  onHome?: () => void;
  simple?: boolean;
}) {
  return (
    <main className="min-h-screen">
      <header className="site-header">
        {simple ? (
          <div className="brand-button rounded-xl">
            <Logo />
          </div>
        ) : (
          <button
            type="button"
            onClick={onHome}
            aria-label="Go to Results"
            className="brand-button rounded-xl focus-ring"
          >
            <Logo />
          </button>
        )}
        {!simple && (
          <button
            type="button"
            onClick={onHome}
            className="header-home focus-ring"
          >
            <Home size={15} /> Results
          </button>
        )}
      </header>
      {children}
    </main>
  );
}

function SurveyCard({
  survey,
  history,
  onHuman,
  aggregate,
  interactionDisabled,
}: {
  survey: SurveyDefinition;
  history: SurveyHistory;
  onHuman: () => void;
  aggregate?: ValidationSurveyAggregate;
  interactionDisabled: boolean;
}) {
  const human = history.human;
  const humanStatus = runStatus(human);
  const hasResults = Boolean(aggregate?.completedRuns);

  return (
    <article className="survey-card" style={surveyThemeStyle(survey)}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="survey-title font-display min-w-0 text-[clamp(1.55rem,3vw,2.15rem)] font-black leading-[0.98] tracking-[-0.045em] text-slate-950">
            {surveys.indexOf(survey) + 1}. {survey.title}
          </h2>
        </div>
      </div>
      <p className="survey-description mt-4 min-h-[3.1rem] text-sm leading-6 text-slate-600">
        {survey.description}
      </p>

      <div className="mt-6">
        <button
          type="button"
          onClick={onHuman}
          disabled={interactionDisabled}
          className="run-row focus-ring"
        >
          <span className="run-icon">
            <UserRound size={18} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-sm font-bold text-slate-900">
              Human benchmark
            </span>
          </span>
          <StatusPill status={humanStatus} />
          <ChevronRight size={17} className="text-slate-400" />
        </button>
      </div>

      {hasResults && (
        <details className="validation-question-details">
          <summary>
            <span className="validation-question-summary-label">
              <ChevronDown
                size={15}
                className="validation-question-chevron"
                aria-hidden="true"
              />
              Question results
            </span>
            <span className="validation-question-count">
              {aggregate?.questions.length}
            </span>
          </summary>
          <div className="validation-question-list">
            {aggregate?.questions.map((question) => (
              <QuestionAggregateRow key={question.questionId} row={question} />
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

function QuestionAggregateRow({ row }: { row: ValidationQuestionAggregate }) {
  return (
    <article className="validation-question-result">
      <h3>{row.prompt}</h3>
      <dl>
        <div>
          <dt>Agent consensus</dt>
          <dd>{row.consensusAnswerLabel ?? 'No response'}</dd>
        </div>
        <div>
          <dt>Consistency</dt>
          <dd>
            {row.answerCount < 2 || row.consistency === null
              ? 'Needs 2 responses'
              : percent(row.consistency)}
          </dd>
        </div>
        <div>
          <dt>Human benchmark</dt>
          <dd>{row.humanAnswerLabel ?? 'Not completed'}</dd>
        </div>
        <div>
          <dt>Exact benchmark match</dt>
          <dd>
            {row.exactBenchmarkMatchRate === null
              ? '-'
              : percent(row.exactBenchmarkMatchRate)}
          </dd>
        </div>
      </dl>
      <div className="validation-answer-distribution">
        {row.distribution.map((answer) => (
          <span key={answer.answerId}>
            {answer.label}: {answer.count}/{row.answerCount}
          </span>
        ))}
      </div>
    </article>
  );
}

function ResultsView({
  store,
  onHuman,
  onRunAll,
  onLicense,
  runningExperiment,
  runDisabled,
  selectedExperimentId,
  onSelectExperiment,
}: {
  store: SurveyStore;
  onHuman: (surveyId: SurveyId) => void;
  onRunAll: () => void;
  onLicense: () => void;
  runningExperiment: boolean;
  runDisabled: boolean;
  selectedExperimentId: string | null;
  onSelectExperiment: (experimentId: string) => void;
}) {
  const experimentOptions = validationExperimentOptions(store);
  const resolvedExperimentId = experimentOptions.some(
    (option) => option.id === selectedExperimentId,
  )
    ? selectedExperimentId
    : (experimentOptions[0]?.id ?? null);
  const aggregate = resolvedExperimentId
    ? aggregateValidationExperiment(store, resolvedExperimentId)
    : null;
  const experimentWarning = validationExperimentWarning(
    aggregate?.experiment ?? null,
  );

  return (
    <Shell simple>
      <section className="hero-wrap">
        <div className="hero-orbit orbit-one" aria-hidden="true" />
        <div className="hero-orbit orbit-two" aria-hidden="true" />
        <div className="hero-grid">
          <div className="relative z-10 max-w-[790px]">
            <h1 className="font-display text-[clamp(3.25rem,8vw,7.1rem)] font-black leading-[0.84] tracking-[-0.07em] text-slate-950">
              Validation <span className="ink-swipe">results</span>
            </h1>
            <p className="mt-7 max-w-[650px] text-[clamp(1rem,2vw,1.25rem)] leading-8 text-slate-600">
              Fill in the 4 surveys, then compare your results with your digital
              twin&apos;s
            </p>
          </div>
          <div className="validation-batch-action">
            <button
              type="button"
              onClick={onRunAll}
              disabled={runDisabled}
              aria-busy={runningExperiment}
              className="primary-button focus-ring"
            >
              {runningExperiment ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <Bot size={18} />
              )}
              {runningExperiment
                ? 'Running 40 Agent responses...'
                : 'Run Agent validation'}
            </button>
            <p>Starts 10 fresh, concurrent runs for each of 4 surveys.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 pb-20 pt-16 sm:px-8 lg:px-10">
        <div className="validation-results-toolbar">
          <label htmlFor="validation-experiment-selector">Experiment</label>
          {experimentOptions.length ? (
            <select
              id="validation-experiment-selector"
              value={resolvedExperimentId ?? ''}
              onChange={(event) => onSelectExperiment(event.target.value)}
            >
              {experimentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <span>No Agent experiments yet</span>
          )}
          {experimentWarning ? (
            <output className="validation-experiment-warning">
              {experimentWarning}
            </output>
          ) : null}
        </div>

        <section className="validation-overall-results" aria-live="polite">
          <div>
            <span>Overall benchmark match</span>
            <strong>
              {aggregate?.overall.benchmarkSimilarity === null || !aggregate
                ? 'No benchmarks'
                : percent(aggregate.overall.benchmarkSimilarity)}
            </strong>
            <small>
              {aggregate
                ? `${aggregate.overall.benchmarkedSurveyCount} of 4 surveys compared`
                : 'Complete Human benchmarks to compare'}
            </small>
          </div>
          <div>
            <span>Overall Agent consistency</span>
            <strong>
              {!aggregate
                ? '-'
                : aggregate.experiment.expectedRuns === 1
                  ? '1 response'
                  : aggregate.overall.consistency === null
                    ? '-'
                    : percent(aggregate.overall.consistency)}
            </strong>
            <small>Agreement with the most common answer per question</small>
          </div>
        </section>

        <p className="validation-results-method">
          Overall match pools every Agent answer against the available Human
          answer for the same question. Consistency measures how often Agents
          selected that question&apos;s most common answer. These are separate
          signals.
        </p>

        <div className="validation-survey-list flex flex-col gap-6">
          {surveys.map((survey) => (
            <SurveyCard
              key={survey.id}
              survey={survey}
              history={surveyHistory(store, survey.id)}
              onHuman={() => onHuman(survey.id)}
              aggregate={aggregate?.surveys.find(
                (result) => result.surveyId === survey.id,
              )}
              interactionDisabled={runningExperiment}
            />
          ))}
        </div>

        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={onLicense}
            className="quiet-button text-sm font-bold text-slate-600 hover:text-slate-950 focus-ring"
          >
            Sources and license
          </button>
        </div>
      </section>
    </Shell>
  );
}

function QuizView({
  survey,
  actor,
  run,
  agentRun,
  onSaveAnswer,
  onComplete,
  onHome,
}: {
  survey: SurveyDefinition;
  actor: Actor;
  run: StoredRun;
  agentRun?: AgentRun;
  onSaveAnswer: (questionId: string, optionId: string | null) => void;
  onComplete: () => void;
  onHome: () => void;
}) {
  const firstMissing = survey.questions.findIndex(
    (question) => !run.answers[question.id],
  );
  const [index, setIndex] = useState(
    firstMissing === -1 ? survey.questions.length - 1 : firstMissing,
  );
  const question = survey.questions[index];
  const selected = run.answers[question.id];
  const progress = ((index + 1) / survey.questions.length) * 100;
  const meta = actorMeta[actor];
  const isLast = index === survey.questions.length - 1;
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);
  const advancingRef = useRef(false);

  useEffect(() => {
    advancingRef.current = false;
    questionHeadingRef.current?.focus({ preventScroll: true });
  }, [index]);

  function selectOption(optionId: string) {
    if (selected === optionId) {
      advancingRef.current = false;
      onSaveAnswer(question.id, null);
      return;
    }
    onSaveAnswer(question.id, optionId);
    if (isLast || advancingRef.current) return;
    advancingRef.current = true;
    setIndex((value) => Math.min(value + 1, survey.questions.length - 1));
  }

  function next() {
    if (!selected) return;
    if (isLast) onComplete();
    else setIndex((value) => value + 1);
  }

  return (
    <Shell onHome={onHome}>
      <div className="quiz-stage" style={surveyThemeStyle(survey)}>
        <div className="quiz-topline">
          <div>
            <p className="section-kicker" style={{ color: survey.ink }}>
              {survey.shortTitle}
            </p>
            <div className="validation-quiz-context">
              <meta.Icon size={17} />
              {actor === 'agent' && agentRun
                ? `Agent run ${agentRun.sequence}`
                : 'Human benchmark'}
              {actor === 'agent' && agentRun && (
                <span className="run-metadata-chip">
                  {agentRun.dimensionCount} persona dimensions
                </span>
              )}
              <span className="run-metadata-chip">
                Persona agent: {personaAgentLabel(run.personaAgent)}
              </span>
            </div>
          </div>
          <p className="validation-question-count">
            Question {index + 1} of {survey.questions.length}
          </p>
        </div>
        <div
          className="progress-track"
          aria-label={`${Math.round(progress)} percent complete`}
        >
          <div
            style={{ width: `${progress}%`, backgroundColor: survey.color }}
          />
        </div>

        <section className="question-card" data-question-id={question.id}>
          {question.dimension && (
            <p
              className="validation-question-dimension"
              style={{ color: survey.ink }}
            >
              {question.dimension}
            </p>
          )}
          <h1
            ref={questionHeadingRef}
            tabIndex={-1}
            className="validation-question-title outline-none"
          >
            {question.prompt}
          </h1>

          <fieldset
            className={`mt-8 ${survey.kind === 'scale' ? 'scale-options' : 'space-y-3'}`}
          >
            <legend className="sr-only">{question.prompt}</legend>
            {question.options.map((option) => {
              const active = selected === option.id;
              return (
                <button
                  type="button"
                  aria-pressed={active}
                  key={option.id}
                  onClick={() => selectOption(option.id)}
                  className={`answer-option focus-ring ${active ? 'answer-selected' : ''} ${survey.kind === 'scale' ? 'scale-option' : ''}`}
                  style={active ? surveyThemeStyle(survey) : undefined}
                >
                  {survey.kind === 'scale' ? (
                    <span className="option-key">{option.id}</span>
                  ) : (
                    <span className="option-radio" aria-hidden="true" />
                  )}
                  <span className="flex-1 text-left">{option.label}</span>
                </button>
              );
            })}
          </fieldset>
        </section>

        <div className="quiz-footer-actions">
          <div className="quiz-footer-secondary-actions">
            <button
              type="button"
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              disabled={index === 0}
              className="secondary-button focus-ring"
            >
              <ArrowLeft size={17} /> Previous
            </button>
            <button
              type="button"
              onClick={onHome}
              className="quiet-button focus-ring"
            >
              Results
            </button>
          </div>
          <button
            type="button"
            onClick={next}
            disabled={!selected}
            className="primary-button focus-ring"
            style={{ backgroundColor: survey.color }}
          >
            {isLast ? 'Finish this run' : 'Next'} <ArrowRight size={17} />
          </button>
        </div>
        <p className="mx-auto mt-5 max-w-[720px] text-center text-xs leading-5 text-slate-500">
          These answers become the fixed benchmark for every Agent run in this
          survey.
        </p>
      </div>
    </Shell>
  );
}

function CategoryProfile({
  result,
  survey,
}: {
  result: CategoryResult;
  survey: SurveyDefinition;
}) {
  const entries = Object.entries(result.scores) as Array<
    [keyof typeof categoryMeta, number]
  >;
  return (
    <div className="mt-8 space-y-4">
      {entries.map(([key, value]) => (
        <div key={key}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-bold text-slate-600">
            <span>{categoryMeta[key].name.replace('The ', '')}</span>
            <span>{value} / 5</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(value / 5) * 100}%`,
                backgroundColor: survey.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DialProfile({
  result,
  survey,
  compact = false,
}: {
  result: DialResult;
  survey: SurveyDefinition;
  compact?: boolean;
}) {
  return (
    <div
      className={`mt-7 ${compact ? 'space-y-4' : 'grid gap-4 sm:grid-cols-2'}`}
    >
      {result.values.map((item) => (
        <div key={item.id} className="dial-card">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.11em] text-slate-500">
              {item.dimension}
            </p>
            <span
              className="rounded-full px-2.5 py-1 text-xs font-black"
              style={{ backgroundColor: survey.pale, color: survey.ink }}
            >
              {item.value} / 5
            </span>
          </div>
          <div
            className="mt-4 flex gap-1.5"
            aria-label={`${item.value} out of 5`}
          >
            {[1, 2, 3, 4, 5].map((number) => (
              <span
                key={number}
                className="h-2 flex-1 rounded-full"
                style={{
                  backgroundColor:
                    number <= item.value ? survey.color : '#e8eaf0',
                }}
              />
            ))}
          </div>
          <p className="mt-3 text-sm font-bold text-slate-800">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function SillyProfile({
  result,
  survey,
  compact = false,
}: {
  result: SillyResult;
  survey: SurveyDefinition;
  compact?: boolean;
}) {
  return (
    <div className="mt-7 space-y-5">
      {axisMeta.map((axis, index) => (
        <div key={axis.key}>
          <div className="mb-2 flex items-center justify-between gap-4 text-xs font-bold text-slate-600">
            <span>{axis.low}</span>
            <span>{axis.high}</span>
          </div>
          <div className="relative h-3 rounded-full bg-slate-100">
            <span className="absolute left-1/2 top-[-3px] h-[18px] w-px bg-slate-300" />
            <span
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full shadow"
              style={{
                left: `${result.scores[index]}%`,
                backgroundColor: survey.color,
              }}
            />
          </div>
          {!compact && (
            <p
              className="mt-2 text-center text-xs font-bold"
              style={{ color: survey.ink }}
            >
              {result.scores[index]}% toward {axis.high}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function ResultVisual({
  result,
  survey,
  compact = false,
}: {
  result: SurveyResult;
  survey: SurveyDefinition;
  compact?: boolean;
}) {
  if (result.kind === 'categorical')
    return <CategoryProfile result={result} survey={survey} />;
  if (result.kind === 'scale')
    return <DialProfile result={result} survey={survey} compact={compact} />;
  return <SillyProfile result={result} survey={survey} compact={compact} />;
}

function ResultView({
  survey,
  actor,
  run,
  agentRun,
  hasCompletedHuman,
  completedAgentCount,
  onPrimary,
  onHistory,
  onHumanChange,
  onHome,
}: {
  survey: SurveyDefinition;
  actor: Actor;
  run: StoredRun;
  agentRun?: AgentRun;
  hasCompletedHuman: boolean;
  completedAgentCount: number;
  onPrimary: () => void;
  onHistory: () => void;
  onHumanChange: () => void;
  onHome: () => void;
}) {
  const result = scoreSurvey(survey, run.answers);
  const isAgent = actor === 'agent' && agentRun;
  const meta = actorMeta[actor];
  const primaryTitle = isAgent
    ? hasCompletedHuman
      ? `Compare Agent run ${agentRun.sequence}`
      : 'Complete the Human benchmark'
    : completedAgentCount
      ? 'View the aggregated validation Results'
      : 'Go to validation Results';
  const primaryCopy = isAgent
    ? hasCompletedHuman
      ? 'The Human benchmark and this run are now ready for their own question-level comparison.'
      : 'This Agent run is saved. Complete the Human benchmark to unlock its question-level comparison.'
    : completedAgentCount
      ? `There ${completedAgentCount === 1 ? 'is' : 'are'} ${completedAgentCount} saved Agent ${completedAgentCount === 1 ? 'response' : 'responses'} for this benchmark. Results keeps the aggregate comparison together.`
      : 'The Human answers are saved locally. Start the next full Agent experiment from Results.';

  return (
    <Shell onHome={onHome}>
      <div className="result-stage" style={surveyThemeStyle(survey)}>
        <section className="result-hero">
          <div className="result-spark spark-a" aria-hidden="true">
            ✦
          </div>
          <div className="result-spark spark-b" aria-hidden="true">
            ●
          </div>
          <div className="relative z-10">
            <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.13em] text-slate-600 shadow-sm">
              <meta.Icon size={15} />{' '}
              {isAgent ? `Agent run ${agentRun.sequence}` : 'Human benchmark'} -{' '}
              {survey.shortTitle}
            </div>
            <div className="mx-auto mt-4 w-fit rounded-full bg-white/70 px-3 py-1.5 text-xs font-black text-slate-600 shadow-sm">
              Persona agent: {personaAgentLabel(run.personaAgent)}
            </div>
            {isAgent && (
              <div
                className="mx-auto mt-2 w-fit rounded-full px-3 py-1.5 text-xs font-black"
                style={{ backgroundColor: survey.color, color: 'white' }}
              >
                {agentRun.dimensionCount ?? 'Not recorded'} persona dimensions
              </div>
            )}
            <p
              className="mt-8 text-center text-xs font-black uppercase tracking-[0.16em]"
              style={{ color: survey.ink }}
            >
              {result.kind === 'silly' ? result.code : 'Strongest signal'}
            </p>
            <h1 className="font-display mx-auto mt-3 max-w-[850px] text-center text-[clamp(2.7rem,7vw,6.3rem)] font-black leading-[0.9] tracking-[-0.065em] text-slate-950">
              {result.title}
            </h1>
            {'description' in result && (
              <p className="mx-auto mt-6 max-w-[620px] text-center text-base leading-7 text-slate-600 sm:text-lg">
                {result.description}
              </p>
            )}
          </div>
        </section>

        <section className="mx-auto mt-7 max-w-[900px] rounded-[30px] bg-white p-6 shadow-sm sm:p-9">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="section-kicker">Result detail</p>
              <h2 className="font-display mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950">
                {result.kind === 'silly'
                  ? 'Four silly axes'
                  : result.kind === 'scale'
                    ? 'Five personal dials'
                    : 'How the choices stacked up'}
              </h2>
            </div>
            <span
              className="hidden rounded-xl px-3 py-2 text-xs font-bold sm:block"
              style={{ backgroundColor: survey.pale, color: survey.ink }}
            >
              {survey.questions.length} answers
            </span>
          </div>
          <ResultVisual result={result} survey={survey} />
        </section>

        <section className="mx-auto mt-6 max-w-[900px] rounded-[28px] bg-slate-950 p-6 text-white sm:flex sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-[570px]">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-slate-400">
              Next stage
            </p>
            <h2 className="font-display mt-2 text-2xl font-black tracking-[-0.035em]">
              {primaryTitle}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {primaryCopy}
            </p>
          </div>
          <button
            type="button"
            onClick={onPrimary}
            className="result-primary-button mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 sm:ml-8 sm:mt-0 focus-ring"
          >
            {isAgent && hasCompletedHuman ? (
              <ClipboardCheck size={18} />
            ) : isAgent ? (
              <UserRound size={18} />
            ) : completedAgentCount ? (
              <TrendingUp size={18} />
            ) : (
              <Bot size={18} />
            )}
            {isAgent
              ? hasCompletedHuman
                ? 'Compare this run'
                : 'Set Human benchmark'
              : 'View Results'}
            <ArrowRight size={17} />
          </button>
        </section>

        <div className="mx-auto mt-7 flex max-w-[900px] flex-wrap items-center justify-center gap-3 pb-14">
          <button
            type="button"
            onClick={onHome}
            className="secondary-button focus-ring"
          >
            <Home size={16} /> Results
          </button>
          {isAgent ? (
            hasCompletedHuman && (
              <button
                type="button"
                onClick={onHistory}
                className="secondary-button focus-ring"
              >
                <History size={16} /> Earlier run history
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={onHumanChange}
              className="secondary-button focus-ring"
            >
              <RotateCcw size={16} /> Retake benchmark
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}

function MiniResult({
  survey,
  actor,
  result,
}: {
  survey: SurveyDefinition;
  actor: Actor;
  result: SurveyResult;
}) {
  const meta = actorMeta[actor];
  return (
    <div className="comparison-result-card">
      <div className="flex items-center gap-3">
        <span
          className="run-icon"
          style={{ backgroundColor: survey.pale, color: survey.ink }}
        >
          <meta.Icon size={18} />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">
            {meta.shortLabel}
          </p>
          <h3 className="font-display text-xl font-black tracking-[-0.03em] text-slate-950">
            {result.title}
          </h3>
        </div>
      </div>
      {'description' in result && (
        <p className="mt-4 text-sm leading-6 text-slate-600">
          {result.description}
        </p>
      )}
      <ResultVisual result={result} survey={survey} compact />
    </div>
  );
}

function ComparisonView({
  survey,
  human,
  agentRun,
  onResult,
  onHistory,
  onHome,
}: {
  survey: SurveyDefinition;
  human: HumanBenchmark;
  agentRun: AgentRun;
  onResult: (actor: Actor) => void;
  onHistory: () => void;
  onHome: () => void;
}) {
  const comparison = compareSurvey(survey, human.answers, agentRun.answers);
  const humanResult = scoreSurvey(survey, human.answers);
  const agentResult = scoreSurvey(survey, agentRun.answers);
  const exactSentence =
    comparison.exactMatches === survey.questions.length
      ? 'Every answer matched.'
      : `${comparison.exactMatches} of ${survey.questions.length} answers matched exactly.`;

  return (
    <Shell onHome={onHome}>
      <div className="comparison-stage" style={surveyThemeStyle(survey)}>
        <section className="comparison-hero">
          <div className="comparison-label">
            <ClipboardCheck size={15} /> {survey.shortTitle} - Agent run{' '}
            {agentRun.sequence}
          </div>
          <div
            className="similarity-ring"
            style={
              {
                '--score': `${Math.round(comparison.similarity * 100) * 3.6}deg`,
                '--survey': survey.color,
              } as CSSProperties
            }
          >
            <div>
              <span>{percent(comparison.similarity)}</span>
              <small>similarity</small>
            </div>
          </div>
          <h1 className="font-display mt-6 text-center text-[clamp(2.5rem,6vw,5.6rem)] font-black leading-[0.92] tracking-[-0.06em] text-slate-950">
            Human meets Agent
          </h1>
          <p className="mx-auto mt-5 max-w-[680px] text-center text-base leading-7 text-slate-600">
            {exactSentence}{' '}
            {survey.kind === 'scale'
              ? 'The headline score gives partial credit when ratings are close.'
              : 'The headline score uses exact question matches.'}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <span className="metric-chip">
              Persona agent:{' '}
              <strong>{personaAgentLabel(agentRun.personaAgent)}</strong>
            </span>
            <span className="metric-chip">
              <strong>{agentRun.dimensionCount ?? 'N/A'}</strong> persona
              dimensions
            </span>
            <span className="metric-chip">
              <strong>{comparison.exactMatches}</strong> exact matches
            </span>
            <span className="metric-chip">
              <strong>{comparison.differences.length}</strong> differences
            </span>
            {comparison.withinOne !== undefined && (
              <span className="metric-chip">
                <strong>{comparison.withinOne}</strong> within one point
              </span>
            )}
            {comparison.profileSimilarity !== undefined && (
              <span className="metric-chip">
                <strong>{percent(comparison.profileSimilarity)}</strong> profile
                similarity
              </span>
            )}
          </div>
          <p className="mt-4 text-xs font-bold text-slate-500">
            Completed {formatDate(agentRun.completedAt)}
            {agentRun.migrated
              ? ' - imported from the earlier app version'
              : ''}
          </p>
        </section>

        <section className="mx-auto mt-10 grid max-w-[1080px] gap-5 lg:grid-cols-2">
          <MiniResult survey={survey} actor="human" result={humanResult} />
          <MiniResult survey={survey} actor="agent" result={agentResult} />
        </section>

        <section className="mx-auto mt-8 max-w-[1080px] rounded-[30px] bg-white p-6 shadow-sm sm:p-9">
          <div className="flex flex-col justify-between gap-4 pb-6 sm:flex-row sm:items-end">
            <div>
              <p className="section-kicker">Question-level audit</p>
              <h2 className="font-display mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">
                Where the answers differed
              </h2>
            </div>
            <p className="text-sm text-slate-500">
              {comparison.differences.length}{' '}
              {comparison.differences.length === 1 ? 'question' : 'questions'}
            </p>
          </div>
          {comparison.differences.length === 0 ? (
            <div className="empty-match">
              <CheckCircle2 size={34} style={{ color: survey.color }} />
              <h3 className="font-display mt-4 text-2xl font-black text-slate-950">
                A perfect match
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                The Human benchmark and Agent run selected the same answer for
                every question.
              </p>
            </div>
          ) : (
            <div>
              {comparison.differences.map((difference, index) => (
                <article
                  key={difference.question.id}
                  className="difference-row"
                >
                  <div className="difference-number">{index + 1}</div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-lg font-black leading-6 text-slate-950">
                      {difference.question.prompt}
                    </h3>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="answer-quote human-quote">
                        <span>
                          <UserRound size={14} /> Human
                        </span>
                        <p>{difference.humanAnswer}</p>
                      </div>
                      <div className="answer-quote persona-quote">
                        <span>
                          <Bot size={14} /> Agent run {agentRun.sequence}
                        </span>
                        <p>{difference.personaAnswer}</p>
                      </div>
                    </div>
                    {difference.distance !== undefined && (
                      <p className="mt-3 text-xs font-bold text-slate-500">
                        Scale distance: {difference.distance}{' '}
                        {difference.distance === 1 ? 'point' : 'points'}
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mx-auto mt-6 max-w-[1080px] rounded-[24px] bg-amber-50 p-5 text-sm leading-6 text-amber-950 sm:flex sm:items-start sm:gap-4 sm:p-6">
          <Info className="mb-3 shrink-0 text-amber-700 sm:mb-0" size={20} />
          <p>
            <strong>How to read this:</strong> This comparison belongs only to
            Agent run {agentRun.sequence}. A named result can match even when
            individual answers differ, so the question list is the more useful
            diagnostic.
          </p>
        </section>

        <div className="mx-auto flex max-w-[1080px] flex-wrap justify-center gap-3 pb-16 pt-8">
          <button
            type="button"
            onClick={onHistory}
            className="primary-button bg-slate-950 focus-ring"
          >
            <TrendingUp size={17} /> Convergence history
          </button>
          <button
            type="button"
            onClick={() => onResult('human')}
            className="secondary-button focus-ring"
          >
            <UserRound size={16} /> Human result
          </button>
          <button
            type="button"
            onClick={() => onResult('agent')}
            className="secondary-button focus-ring"
          >
            <Bot size={16} /> Agent result
          </button>
          <button
            type="button"
            onClick={onHome}
            className="secondary-button focus-ring"
          >
            <Home size={16} /> Results
          </button>
        </div>
      </div>
    </Shell>
  );
}

function ConvergenceChart({
  points,
  survey,
}: {
  points: ConvergencePoint[];
  survey: SurveyDefinition;
}) {
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const width = 760;
  const height = 300;
  const left = 66;
  const right = 28;
  const top = 22;
  const bottom = 76;
  const dataLeft = left + 24;
  const dataRight = width - right - 20;
  const maxDimensions = Math.max(
    1,
    ...points.map((point) => point.dimensionCount),
  );
  const x = (value: number) =>
    dataLeft + (value / maxDimensions) * (dataRight - dataLeft);
  const y = (value: number) => top + (1 - value) * (height - top - bottom);
  const dimensionTicks = Array.from(
    new Set(
      Array.from({ length: 5 }, (_, index) =>
        Math.round((maxDimensions * index) / 4),
      ),
    ),
  );
  const clusterMap = new Map<
    string,
    { dimensionCount: number; similarity: number; runs: ConvergencePoint[] }
  >();
  points.forEach((point) => {
    const key = `${point.dimensionCount}:${point.similarity.toFixed(6)}`;
    const cluster = clusterMap.get(key);
    if (cluster) cluster.runs.push(point);
    else
      clusterMap.set(key, {
        dimensionCount: point.dimensionCount,
        similarity: point.similarity,
        runs: [point],
      });
  });
  const clusters = [...clusterMap.values()];

  return (
    <figure
      className="chart-shell"
      aria-labelledby="convergence-chart-title convergence-chart-description"
    >
      <h3 id="convergence-chart-title" className="sr-only">
        Persona dimensions and answer similarity
      </h3>
      <p id="convergence-chart-description" className="sr-only">
        A scatter plot of Agent runs. Persona dimensions are on the horizontal
        axis and answer similarity from zero to one hundred percent is on the
        vertical axis. Exact overlaps are grouped, and the table below contains
        every run.
      </p>
      <div className="chart-scroll-controls" aria-label="Chart pan controls">
        <button
          type="button"
          onClick={() =>
            chartScrollRef.current?.scrollBy({ left: -320, behavior: 'auto' })
          }
          className="chart-pan-button focus-ring"
          aria-label="Pan chart left"
        >
          <ArrowLeft size={15} /> Left
        </button>
        <button
          type="button"
          onClick={() =>
            chartScrollRef.current?.scrollBy({ left: 320, behavior: 'auto' })
          }
          className="chart-pan-button focus-ring"
          aria-label="Pan chart right"
        >
          Right <ArrowRight size={15} />
        </button>
      </div>
      <div
        ref={chartScrollRef}
        className="chart-scroll"
        aria-label="Scrollable convergence chart"
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          focusable="false"
          className="chart-svg h-auto w-full"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((value) => (
            <g key={value}>
              <line
                x1={left}
                x2={width - right}
                y1={y(value)}
                y2={y(value)}
                stroke="#dce2e9"
                strokeDasharray={value === 0 ? undefined : '4 6'}
              />
              <text
                x={left - 12}
                y={y(value) + 4}
                textAnchor="end"
                fontSize="13"
                fill="#64748b"
                fontWeight="700"
              >
                {Math.round(value * 100)}%
              </text>
            </g>
          ))}
          <line
            x1={left}
            x2={width - right}
            y1={height - bottom}
            y2={height - bottom}
            stroke="#94a3b8"
          />
          {dimensionTicks.map((value) => (
            <g key={value}>
              <line
                x1={x(value)}
                x2={x(value)}
                y1={height - bottom}
                y2={height - bottom + 6}
                stroke="#94a3b8"
              />
              <text
                x={x(value)}
                y={height - bottom + 34}
                textAnchor="middle"
                fontSize="13"
                fill="#64748b"
                fontWeight="700"
              >
                {value}
              </text>
            </g>
          ))}
          <text
            x={(left + width - right) / 2}
            y={height - 7}
            textAnchor="middle"
            fontSize="13"
            fill="#475569"
            fontWeight="800"
          >
            Persona dimensions
          </text>
          {clusters.map((cluster) => {
            const runLabel = cluster.runs
              .map((point) => `Run ${point.sequence}`)
              .join(', ');
            return (
              <g
                key={`${cluster.dimensionCount}:${cluster.similarity}`}
                transform={`translate(${x(cluster.dimensionCount)} ${y(cluster.similarity)})`}
              >
                <title>
                  {runLabel}, {cluster.dimensionCount} persona dimensions,{' '}
                  {Math.round(cluster.similarity * 100)} percent similarity
                </title>
                <circle
                  r={cluster.runs.length > 1 ? 20 : 18}
                  fill={survey.pale}
                  stroke={survey.color}
                  strokeWidth="3"
                />
                <text
                  textAnchor="middle"
                  y="4.5"
                  fontSize="12"
                  fill={survey.ink}
                  fontWeight="900"
                >
                  {cluster.runs.length > 1
                    ? `${cluster.runs.length}x`
                    : cluster.runs[0].sequence}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-2 text-center text-xs leading-5 text-slate-500">
        Each numbered marker is a completed Agent run. A marker such as 2x
        groups exact overlaps; every run remains separate in the table.
      </p>
    </figure>
  );
}

function HistoryView({
  survey,
  history,
  onComparison,
  onHumanResult,
  onHome,
}: {
  survey: SurveyDefinition;
  history: SurveyHistory;
  onComparison: (runId: string) => void;
  onHumanResult: () => void;
  onHome: () => void;
}) {
  const human = history.human!;
  const runs = completedAgentRuns(history, human.id).sort(runCompletionOrder);
  const unpairedRuns = completedAgentRuns(history)
    .filter((run) => run.benchmarkId !== human.id)
    .sort(runCompletionOrder);
  const points = convergencePoints(survey.id, history);
  const narrative = convergenceNarrative(points);
  const rows = runs.map((run) => ({
    run,
    comparison: compareSurvey(survey, human.answers, run.answers),
  }));
  const latest = rows.at(-1);
  const best = rows.length
    ? rows.reduce((winner, row) =>
        row.comparison.similarity > winner.comparison.similarity ? row : winner,
      )
    : undefined;
  const unknownDimensions = runs.filter(
    (run) => run.dimensionCount === null,
  ).length;

  return (
    <Shell onHome={onHome}>
      <div className="history-stage" style={surveyThemeStyle(survey)}>
        <section className="history-heading">
          <div className="comparison-label">
            <TrendingUp size={15} /> {survey.shortTitle} experiment
          </div>
          <h1 className="font-display mt-6 max-w-[900px] text-[clamp(2.7rem,7vw,5.8rem)] font-black leading-[0.9] tracking-[-0.06em] text-slate-950">
            Does more persona detail improve the match?
          </h1>
          <p className="mt-6 max-w-[720px] text-base leading-7 text-slate-600">
            Every marker represents one or more Agent runs against the same
            locally saved Human benchmark. The chart uses answer similarity, not
            whether the playful type name happened to match.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <span className="history-stat">
              <small>Persona agent</small>
              <strong>{personaAgentLabel(human.personaAgent)}</strong>
            </span>
            <span className="history-stat">
              <small>Agent runs</small>
              <strong>{runs.length}</strong>
            </span>
            <span className="history-stat">
              <small>Latest match</small>
              <strong>
                {latest ? percent(latest.comparison.similarity) : '-'}
              </strong>
            </span>
            <span className="history-stat">
              <small>Best match</small>
              <strong>
                {best ? percent(best.comparison.similarity) : '-'}
              </strong>
            </span>
            <span className="history-stat">
              <small>Latest persona depth</small>
              <strong>
                {!latest ? (
                  '-'
                ) : latest.run.dimensionCount === null ? (
                  'Not recorded'
                ) : (
                  <>
                    {latest.run.dimensionCount} <em>dimensions</em>
                  </>
                )}
              </strong>
            </span>
          </div>
        </section>

        <section className="mx-auto mt-8 max-w-[1120px] rounded-[30px] bg-white p-5 shadow-sm sm:p-9">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <p className="section-kicker">Convergence view</p>
              <h2 className="font-display mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950">
                {narrative.title}
              </h2>
              <p className="mt-2 max-w-[720px] text-sm leading-6 text-slate-600">
                {narrative.detail}
              </p>
            </div>
          </div>
          {points.length ? (
            <ConvergenceChart points={points} survey={survey} />
          ) : (
            <div className="empty-match">
              <TrendingUp size={34} style={{ color: survey.color }} />
              <p className="mt-4 max-w-[460px] text-center text-sm leading-6 text-slate-600">
                Start a full Agent experiment from Results to add responses.
              </p>
            </div>
          )}
          {unknownDimensions > 0 && (
            <p className="mt-5 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              {unknownDimensions} imported{' '}
              {unknownDimensions === 1 ? 'run is' : 'runs are'} kept in the
              history below but excluded from the chart because the
              persona-dimension count was not recorded.
            </p>
          )}
        </section>

        <section className="mx-auto mt-8 max-w-[1120px] rounded-[30px] bg-white p-5 shadow-sm sm:p-9">
          <div className="pb-6">
            <p className="section-kicker">Local run log</p>
            <h2 className="font-display mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">
              Every Agent comparison
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Runs are listed in completion order and never overwrite one
              another.
            </p>
          </div>
          {rows.length ? (
            <Table className="mt-4 min-w-[900px]">
              <TableCaption className="sr-only">
                Agent comparison runs in completion order
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>Persona agent</TableHead>
                  <TableHead>Persona dimensions</TableHead>
                  <TableHead>Similarity</TableHead>
                  <TableHead>Exact matches</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>
                    <span className="sr-only">Action</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ run, comparison }) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-black text-slate-950">
                      Run {run.sequence}
                    </TableCell>
                    <TableCell>{personaAgentLabel(run.personaAgent)}</TableCell>
                    <TableCell>
                      {run.dimensionCount ?? 'Not recorded'}
                    </TableCell>
                    <TableCell>
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-black"
                        style={{
                          backgroundColor: survey.pale,
                          color: survey.ink,
                        }}
                      >
                        {percent(comparison.similarity)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {comparison.exactMatches} / {survey.questions.length}
                    </TableCell>
                    <TableCell>{formatDate(run.completedAt)}</TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={() => onComparison(run.id)}
                        className="quiet-button text-sm font-black hover:text-slate-600 focus-ring"
                      >
                        View comparison
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="empty-match">
              <History size={34} style={{ color: survey.color }} />
              <h3 className="font-display mt-4 text-xl font-black text-slate-950">
                No comparable Agent runs yet
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                The Human benchmark is ready for another experiment.
              </p>
            </div>
          )}
          {unpairedRuns.length > 0 && (
            <div className="mt-6 rounded-2xl bg-amber-50 p-5">
              <h3 className="font-display text-lg font-black text-amber-950">
                Unpaired saved results
              </h3>
              <p className="mt-1 text-xs leading-5 text-amber-900">
                These imported results are still stored locally, but they have
                no matching completed Human benchmark and are excluded from
                comparisons.
              </p>
              <div className="mt-4 space-y-2">
                {unpairedRuns.map((run) => {
                  const result = scoreSurvey(survey, run.answers);
                  return (
                    <div
                      key={run.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-3 text-sm"
                    >
                      <span className="font-black text-slate-950">
                        Run {run.sequence} - {result.title}
                      </span>
                      <span className="text-xs font-bold text-slate-500">
                        {personaAgentLabel(run.personaAgent)} -{' '}
                        {formatDate(run.completedAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {history.recoveredLegacyDraft && (
            <p className="mt-5 rounded-xl bg-slate-100 p-3 text-xs leading-5 text-slate-600">
              An unfinished Persona draft from the earlier app version was
              preserved locally but is not counted as an Agent run. New tracked
              runs always begin blank.
            </p>
          )}
        </section>

        <section className="mx-auto mt-6 max-w-[1120px] rounded-[24px] bg-amber-50 p-5 text-sm leading-6 text-amber-950 sm:flex sm:items-start sm:gap-4 sm:p-6">
          <Info className="mb-3 shrink-0 text-amber-700 sm:mb-0" size={20} />
          <p>
            <strong>Interpret with care:</strong> A higher score at greater
            persona depth is a pattern consistent with convergence in this
            survey. It is not proof of causation or general behavioral fidelity.
            Repeated runs at the same depth can help reveal variability.
          </p>
        </section>

        <div className="mx-auto flex max-w-[1120px] flex-wrap justify-center gap-3 pb-16 pt-8">
          <button
            type="button"
            onClick={onHumanResult}
            className="secondary-button focus-ring"
          >
            <UserRound size={16} /> Human benchmark
          </button>
          <button
            type="button"
            onClick={onHome}
            className="secondary-button focus-ring"
          >
            <Home size={16} /> Results
          </button>
        </div>
      </div>
    </Shell>
  );
}

function LicenseView({ onHome }: { onHome: () => void }) {
  return (
    <Shell onHome={onHome}>
      <article className="prose-card">
        <button
          type="button"
          onClick={onHome}
          className="secondary-button focus-ring"
        >
          <ArrowLeft size={16} /> Results
        </button>
        <p className="section-kicker mt-10">Sources and license</p>
        <h1 className="font-display mt-2 text-4xl font-black tracking-[-0.045em] text-slate-950 sm:text-5xl">
          A playful remix, with credit
        </h1>
        <p className="mt-6 text-base leading-7 text-slate-600">
          The 28-question Internet Creature survey adapts the open-source Silly
          Big Type Indicator repository. It uses the repository&apos;s question
          bank, four-axis scoring method, and 16 type names under the MIT
          License. It is not the official sbti.ai experience.
        </p>
        <p className="mt-4 text-base leading-7 text-slate-600">
          The three five-question surveys and all comparison mechanics were
          created for Mirror Match. Every section is for entertainment and
          self-reflection only. None is a scientific diagnosis or a suitability
          assessment.
        </p>
        <a
          className="mt-6 inline-flex items-center gap-2 text-sm font-black text-pink-700 underline underline-offset-4"
          href="https://github.com/SillyBigTypeIndicator/SBTI"
          target="_blank"
          rel="noreferrer"
        >
          View the source repository <ArrowRight size={15} />
        </a>
        <div className="mt-10 rounded-2xl bg-slate-950 p-6 text-xs leading-6 text-slate-300 sm:p-8">
          <p className="text-white">MIT License</p>
          <p className="mt-4">
            Copyright (c) 2026 Silly Big Type Indicator contributors
          </p>
          <p className="mt-4">
            Permission is hereby granted, free of charge, to any person
            obtaining a copy of this software and associated documentation files
            (the &quot;Software&quot;), to deal in the Software without
            restriction, including without limitation the rights to use, copy,
            modify, merge, publish, distribute, sublicense, and/or sell copies
            of the Software, and to permit persons to whom the Software is
            furnished to do so, subject to the following conditions:
          </p>
          <p className="mt-4">
            The above copyright notice and this permission notice shall be
            included in all copies or substantial portions of the Software.
          </p>
          <p className="mt-4">
            THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY
            KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
            WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
            NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
            BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
            ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
            CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
            SOFTWARE.
          </p>
        </div>
      </article>
    </Shell>
  );
}

function ValidationSaveStatus({ notice }: { notice: SaveNotice }) {
  return (
    <output className="validation-save-status" aria-live="polite">
      <span
        className={`validation-save-dot ${notice.kind}`}
        aria-hidden="true"
      />
      <span>{notice.message}</span>
    </output>
  );
}

export function ValidationApp({ hosted = false }: { hosted?: boolean }) {
  const [store, setStore] = useState<SurveyStore>({});
  const [view, setView] = useState<View>(HOME_VIEW);
  const [hydrated, setHydrated] = useState(false);
  const [embedded, setEmbedded] = useState(hosted);
  const [saveNotice, setSaveNotice] = useState<SaveNotice | null>(null);
  const [runningExperiment, setRunningExperiment] = useState(false);
  const [batchRecoveryComplete, setBatchRecoveryComplete] = useState(false);
  const [selectedExperimentId, setSelectedExperimentId] = useState<
    string | null
  >(null);
  const [saveRequest, setSaveRequest] = useState(0);
  const storeRef = useRef<SurveyStore>({});
  const diskStateRef = useRef<ValidationDiskState | null>(null);
  const acknowledgedStoreRef = useRef<SurveyStore>({});
  const saveTimerRef = useRef<number | undefined>(undefined);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const failedFingerprintRef = useRef<string | null>(null);
  const agentRunInFlightRef = useRef(false);
  const batchRecoveryGenerationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  const flushDiskSave = useEffectEvent(async () => {
    const diskState = diskStateRef.current;
    if (!diskState) return;
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      return;
    }

    let candidate = mergeSurveyStores(
      acknowledgedStoreRef.current,
      storeRef.current,
    );
    let attemptedFingerprint = surveyStoreFingerprint(candidate);
    if (
      attemptedFingerprint ===
        surveyStoreFingerprint(acknowledgedStoreRef.current) ||
      attemptedFingerprint === failedFingerprintRef.current
    ) {
      return;
    }

    saveInFlightRef.current = true;
    setSaveNotice({ kind: 'saving', message: 'saving to disk...' });
    let savedState: ValidationDiskState | null = null;

    try {
      try {
        savedState = await saveValidationDiskStateWithRetry(
          diskState.contextId,
          diskState.saveRevision,
          candidate,
        );
      } catch (error) {
        if (
          !(error instanceof ValidationPersistenceError) ||
          error.status !== 409 ||
          !error.currentState
        ) {
          throw error;
        }

        const currentState = error.currentState;
        if (currentState.contextId !== diskState.contextId) {
          diskStateRef.current = currentState;
          acknowledgedStoreRef.current = currentState.store;
          storeRef.current = currentState.store;
          failedFingerprintRef.current = null;
          if (mountedRef.current) {
            setStore(currentState.store);
            setView(HOME_VIEW);
            setSaveNotice({
              kind: 'saved',
              message:
                'active persona changed - its results were loaded from disk.',
            });
          }
          return;
        }

        candidate = mergeSurveyStores(currentState.store, storeRef.current);
        attemptedFingerprint = surveyStoreFingerprint(candidate);
        savedState =
          attemptedFingerprint === surveyStoreFingerprint(currentState.store)
            ? currentState
            : await saveValidationDiskStateWithRetry(
                currentState.contextId,
                currentState.saveRevision,
                candidate,
              );
      }

      diskStateRef.current = savedState;
      acknowledgedStoreRef.current = savedState.store;
      failedFingerprintRef.current = null;

      const reconciled = mergeSurveyStores(savedState.store, storeRef.current);
      if (
        surveyStoreFingerprint(reconciled) !==
        surveyStoreFingerprint(storeRef.current)
      ) {
        storeRef.current = reconciled;
        if (mountedRef.current) setStore(reconciled);
      }

      if (mountedRef.current) {
        const savedTime = formatSavedTime(savedState.savedAt);
        setSaveNotice({
          kind: 'saved',
          message: savedTime
            ? `saved to disk at ${savedTime}`
            : 'saved to disk',
        });
      }
    } catch {
      failedFingerprintRef.current = attemptedFingerprint;
      if (mountedRef.current) {
        setSaveNotice({
          kind: 'error',
          message:
            'changes are not saved to disk - check that the MatrAIx app is running.',
        });
      }
    } finally {
      saveInFlightRef.current = false;
      const latestFingerprint = surveyStoreFingerprint(storeRef.current);
      const needsAnotherSave =
        latestFingerprint !==
          surveyStoreFingerprint(acknowledgedStoreRef.current) &&
        latestFingerprint !== failedFingerprintRef.current;
      if (mountedRef.current && (saveQueuedRef.current || needsAnotherSave)) {
        saveQueuedRef.current = false;
        setSaveRequest((current) => current + 1);
      }
    }
  });

  useEffect(() => {
    mountedRef.current = true;
    const embeddedFrame = window.requestAnimationFrame(() => {
      setEmbedded(
        hosted ||
          new URLSearchParams(window.location.search).get('embedded') === '1',
      );
    });
    let cancelled = false;

    async function hydrateFromDisk() {
      try {
        const diskState = await loadValidationDiskState();
        const savedTime = formatSavedTime(diskState.savedAt);
        const notice: SaveNotice = savedTime
          ? {
              kind: 'saved',
              message: `saved to disk at ${savedTime}`,
            }
          : {
              kind: 'saved',
              message: 'ready - autosave saves to disk',
            };

        if (cancelled) return;
        diskStateRef.current = diskState;
        acknowledgedStoreRef.current = diskState.store;
        storeRef.current = diskState.store;
        setStore(diskState.store);
        setSaveNotice(notice);
      } catch {
        if (cancelled) return;
        setSaveNotice({
          kind: 'error',
          message:
            'results could not be loaded from disk - new answers will not be saved.',
        });
      }
      setHydrated(true);
    }

    void hydrateFromDisk();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      window.cancelAnimationFrame(embeddedFrame);
      if (saveTimerRef.current !== undefined) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [hosted]);

  useEffect(() => {
    if (!hydrated || !diskStateRef.current) return;
    const generation = batchRecoveryGenerationRef.current + 1;
    batchRecoveryGenerationRef.current = generation;
    let cancelled = false;
    let recoverySucceeded = false;
    agentRunInFlightRef.current = true;
    setBatchRecoveryComplete(false);

    async function recoverAgentBatches() {
      const diskState = diskStateRef.current;
      if (!diskState) return;
      try {
        const pending = await listPendingValidationAgentBatches(
          surveys,
          diskState.contextId,
        );
        if (cancelled) return;
        if (!pending.length) {
          recoverySucceeded = true;
          return;
        }

        setRunningExperiment(true);
        setSaveNotice({
          kind: 'saving',
          message: 'recovering an unfinished Agent experiment...',
        });
        let nextStore = storeRef.current;
        let latestBatchId: string | null = null;
        let recoveredSuccesses = 0;
        let recoveredFailures = 0;
        for (const status of pending) {
          const result = await waitForValidationAgentBatch(
            status,
            surveys,
            undefined,
            undefined,
            (progress) => {
              if (
                !cancelled &&
                batchRecoveryGenerationRef.current === generation
              ) {
                setSaveNotice({
                  kind: 'saving',
                  message: `recovering Agent experiment - ${progress.completedRuns} of ${progress.requestedRuns} responses complete...`,
                });
              }
            },
          );
          nextStore = appendValidationAgentBatch(nextStore, result, surveys);
          latestBatchId = result.batchId;
          recoveredSuccesses += result.successes.length;
          recoveredFailures += result.failures.length;
        }
        if (cancelled) return;
        storeRef.current = nextStore;
        setStore(nextStore);
        if (latestBatchId) setSelectedExperimentId(latestBatchId);
        setView(HOME_VIEW);
        setSaveNotice({
          kind: recoveredFailures ? 'error' : 'saved',
          message: recoveredFailures
            ? `${recoveredSuccesses} recovered Agent responses will be saved. ${recoveredFailures} runs did not finish.`
            : `${recoveredSuccesses} Agent responses recovered - saving them to disk.`,
        });
        recoverySucceeded = true;
      } catch (error) {
        if (cancelled) return;
        setSaveNotice({
          kind: 'error',
          message:
            error instanceof ValidationAgentError
              ? `${error.message} Reload Validation to recover the saved experiment before starting another.`
              : 'The saved Agent experiment could not be recovered. Reload Validation before starting another.',
        });
      } finally {
        if (!cancelled && batchRecoveryGenerationRef.current === generation) {
          agentRunInFlightRef.current = false;
          setRunningExperiment(false);
          if (recoverySucceeded) setBatchRecoveryComplete(true);
        }
      }
    }

    void recoverAgentBatches();
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !diskStateRef.current) return;
    const fingerprint = surveyStoreFingerprint(store);
    if (
      fingerprint === surveyStoreFingerprint(acknowledgedStoreRef.current) ||
      fingerprint === failedFingerprintRef.current
    ) {
      return;
    }

    if (saveTimerRef.current !== undefined) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = undefined;
      void flushDiskSave();
    }, 300);

    return () => {
      if (saveTimerRef.current !== undefined) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = undefined;
      }
    };
  }, [store, hydrated, saveRequest]);

  const resolvedView = resolveView(store, view);
  const activeSurvey =
    'surveyId' in view ? surveyById[view.surveyId] : undefined;

  function updateSurvey(
    surveyId: SurveyId,
    updater: (history: SurveyHistory) => SurveyHistory,
  ) {
    setStore((current) => ({
      ...current,
      [surveyId]: updater(surveyHistory(current, surveyId)),
    }));
  }

  function goHome() {
    setView(HOME_VIEW);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function activePersonaAgent() {
    const personaAgent = diskStateRef.current?.personaAgent;
    if (!personaAgent) {
      setSaveNotice({
        kind: 'error',
        message:
          'active persona identity is unavailable - reload Validation before starting a run.',
      });
      return null;
    }
    return { ...personaAgent };
  }

  async function refreshActivePersonaForAgent() {
    try {
      const refreshed = await loadValidationDiskState();
      const previous = diskStateRef.current;

      if (previous && refreshed.contextId !== previous.contextId) {
        diskStateRef.current = refreshed;
        acknowledgedStoreRef.current = refreshed.store;
        storeRef.current = refreshed.store;
        failedFingerprintRef.current = null;
        setStore(refreshed.store);
        setView(HOME_VIEW);
        setSaveNotice({
          kind: 'saved',
          message:
            'active persona changed - its results were loaded from disk.',
        });
        return null;
      }

      const reconciled = mergeSurveyStores(refreshed.store, storeRef.current);
      diskStateRef.current = refreshed;
      acknowledgedStoreRef.current = refreshed.store;
      storeRef.current = reconciled;
      failedFingerprintRef.current = null;
      if (
        surveyStoreFingerprint(reconciled) !== surveyStoreFingerprint(store)
      ) {
        setStore(reconciled);
      }
      return refreshed;
    } catch {
      setSaveNotice({
        kind: 'error',
        message:
          'the active persona YAML could not be read - reload Validation before starting a run.',
      });
      return null;
    }
  }

  function openHuman(surveyId: SurveyId) {
    if (agentRunInFlightRef.current) {
      setSaveNotice({
        kind: 'saving',
        message:
          'finish the active Agent experiment before editing benchmarks.',
      });
      return;
    }
    const history = surveyHistory(store, surveyId);
    if (history.human?.completedAt)
      setView({
        name: 'result',
        surveyId,
        actor: 'human',
        runId: history.human.id,
      });
    else if (history.human)
      setView({
        name: 'quiz',
        surveyId,
        actor: 'human',
        runId: history.human.id,
      });
    else {
      const personaAgent = activePersonaAgent();
      if (!personaAgent) return;
      const human: HumanBenchmark = {
        id: makeId('human'),
        answers: {},
        startedAt: new Date().toISOString(),
        personaAgent,
      };
      updateSurvey(surveyId, (current) => ({ ...current, human }));
      setView({ name: 'quiz', surveyId, actor: 'human', runId: human.id });
    }
    window.scrollTo({ top: 0 });
  }

  async function runAllAgentSurveys({
    background = false,
  }: { background?: boolean } = {}) {
    if (!batchRecoveryComplete || agentRunInFlightRef.current) return;
    agentRunInFlightRef.current = true;
    setRunningExperiment(true);
    setSaveNotice({
      kind: 'saving',
      message:
        'running 40 clean Agent responses - 10 concurrent runs for each survey...',
    });

    try {
      const refreshed = await refreshActivePersonaForAgent();
      if (!refreshed) return;
      const result = await runValidationAgentBatch(
        surveys,
        refreshed.contextId,
        refreshed.personaRevision,
        undefined,
        undefined,
        (progress) => {
          if (mountedRef.current) {
            setSaveNotice({
              kind: 'saving',
              message: `running Agent experiment - ${progress.completedRuns} of ${progress.requestedRuns} responses complete...`,
            });
          }
        },
      );
      if (!mountedRef.current) return;

      const nextStore = appendValidationAgentBatch(
        storeRef.current,
        result,
        surveys,
      );
      storeRef.current = nextStore;
      setStore(nextStore);
      setSelectedExperimentId(result.batchId);
      if (!background) setView(HOME_VIEW);
      setSaveNotice({
        kind: result.failures.length ? 'error' : 'saved',
        message: result.failures.length
          ? `${result.successes.length} of 40 Agent responses completed and will be saved. ${result.failures.length} failed.`
          : '40 Agent responses complete - saving the experiment to disk.',
      });
      if (!background) window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (!mountedRef.current) return;
      setSaveNotice({
        kind: 'error',
        message:
          error instanceof ValidationAgentError
            ? `${error.message} Reload Validation to recover any responses already saved by the experiment.`
            : 'The Agent experiment could not be loaded yet. Reload Validation to recover any saved responses.',
      });
    } finally {
      agentRunInFlightRef.current = false;
      if (mountedRef.current) setRunningExperiment(false);
    }
  }

  function saveAnswer(
    surveyId: SurveyId,
    actor: Actor,
    runId: string,
    questionId: string,
    optionId: string | null,
  ) {
    const nextAnswerState = (run: StoredRun) => {
      const answers = { ...run.answers };
      const clearedAnswers = new Set(run.clearedAnswers ?? []);
      if (optionId === null) {
        delete answers[questionId];
        clearedAnswers.add(questionId);
      } else {
        answers[questionId] = optionId;
        clearedAnswers.delete(questionId);
      }
      return {
        answers,
        clearedAnswers: clearedAnswers.size ? [...clearedAnswers] : undefined,
      };
    };
    updateSurvey(surveyId, (history) => {
      if (actor === 'human') {
        if (
          !history.human ||
          history.human.id !== runId ||
          history.human.completedAt
        )
          return history;
        return {
          ...history,
          human: {
            ...history.human,
            ...nextAnswerState(history.human),
          },
        };
      }
      return {
        ...history,
        agentRuns: history.agentRuns.map((run) =>
          run.id === runId && !run.completedAt
            ? { ...run, ...nextAnswerState(run) }
            : run,
        ),
      };
    });
  }

  function completeRun(surveyId: SurveyId, actor: Actor, runId: string) {
    const survey = surveyById[surveyId];
    const history = surveyHistory(store, surveyId);
    const run =
      actor === 'human' ? history.human : findAgentRun(history, runId);
    if (!run || survey.questions.some((question) => !run.answers[question.id]))
      return;
    const completedAt = new Date().toISOString();
    updateSurvey(surveyId, (current) =>
      actor === 'human'
        ? current.human?.id === runId
          ? bindPendingAgentRuns(
              {
                ...current,
                human: {
                  ...current.human,
                  completedAt: current.human.completedAt ?? completedAt,
                },
              },
              runId,
            )
          : current
        : {
            ...current,
            agentRuns: current.agentRuns.map((agentRun) =>
              agentRun.id === runId
                ? {
                    ...agentRun,
                    completedAt: agentRun.completedAt ?? completedAt,
                  }
                : agentRun,
            ),
          },
    );
    setView({ name: 'result', surveyId, actor, runId });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function changeHumanBenchmark(surveyId: SurveyId) {
    const history = surveyHistory(store, surveyId);
    const message = history.agentRuns.length
      ? 'Retake this Human benchmark? Its current answers will be replaced. Saved Agent experiment responses will remain available in Results.'
      : 'Retake this Human benchmark? Its current answers will be replaced.';
    if (!window.confirm(message)) return;
    const personaAgent = activePersonaAgent();
    if (!personaAgent) return;
    const human: HumanBenchmark = {
      id: makeId('human'),
      answers: {},
      startedAt: new Date().toISOString(),
      personaAgent,
    };
    setStore((current) => ({
      ...current,
      [surveyId]: {
        ...surveyHistory(current, surveyId),
        human,
      },
    }));
    setView({ name: 'quiz', surveyId, actor: 'human', runId: human.id });
    window.scrollTo({ top: 0 });
  }

  const runAgentBatchFromValidationHost = useEffectEvent(() => {
    void runAllAgentSurveys({ background: true });
  });

  const navigateFromValidationHost = useEffectEvent(
    (target: {
      name: 'home' | 'human' | 'agent' | 'history';
      surveyId?: SurveyId;
    }) => {
      if (target.name === 'home') {
        goHome();
        return;
      }
      if (!target.surveyId) return;
      if (target.name === 'human') {
        openHuman(target.surveyId);
        return;
      }
      if (target.name === 'agent') {
        goHome();
        return;
      }

      const surveyId = target.surveyId;
      const history = surveyHistory(store, surveyId);
      const comparableRuns = history.human?.completedAt
        ? completedAgentRuns(history, history.human.id)
        : [];
      if (comparableRuns.length) {
        setView({ name: 'history', surveyId });
        window.scrollTo({ top: 0 });
      } else if (!history.human?.completedAt) {
        openHuman(surveyId);
      } else {
        goHome();
      }
    },
  );

  useEffect(() => {
    if (!embedded || !hydrated) return;

    function publishState() {
      const message = validationStateMessage(store, resolvedView, {
        active: runningExperiment,
        ready: batchRecoveryComplete,
      });
      if (hosted) {
        window.dispatchEvent(
          new CustomEvent(VALIDATION_STATE_EVENT, { detail: message }),
        );
        return;
      }
      window.parent.postMessage(message, VALIDATION_HOST_ORIGIN);
    }

    function receiveCommand(message: unknown) {
      if (isValidationHostLayoutMessage(message)) {
        document.documentElement.dataset.validationHostViewport =
          message.viewport;
        document
          .getElementById('validation-root')
          ?.setAttribute('data-validation-host-viewport', message.viewport);
        return;
      }
      if (isValidationRequestStateMessage(message)) {
        publishState();
        return;
      }
      if (isValidationRunAgentBatchMessage(message)) {
        runAgentBatchFromValidationHost();
        return;
      }
      if (!isValidationNavigateMessage(message)) return;

      const target = message.target;
      navigateFromValidationHost(target);
    }

    function receiveNativeCommand(event: Event) {
      if (!(event instanceof CustomEvent)) return;
      receiveCommand(event.detail);
    }

    function receiveHostMessage(event: MessageEvent) {
      if (
        event.origin !== VALIDATION_HOST_ORIGIN ||
        event.source !== window.parent
      ) {
        return;
      }
      receiveCommand(event.data);
    }

    if (hosted) {
      window.addEventListener(VALIDATION_COMMAND_EVENT, receiveNativeCommand);
    } else {
      window.addEventListener('message', receiveHostMessage);
    }
    publishState();
    return () => {
      if (hosted) {
        window.removeEventListener(
          VALIDATION_COMMAND_EVENT,
          receiveNativeCommand,
        );
      } else {
        window.removeEventListener('message', receiveHostMessage);
      }
    };
  }, [
    batchRecoveryComplete,
    embedded,
    hosted,
    hydrated,
    resolvedView,
    runningExperiment,
    store,
  ]);

  function homeScreen() {
    return (
      <ResultsView
        store={store}
        onHuman={openHuman}
        onRunAll={() => void runAllAgentSurveys()}
        onLicense={() => setView({ name: 'license' })}
        runningExperiment={runningExperiment}
        runDisabled={runningExperiment || !batchRecoveryComplete}
        selectedExperimentId={selectedExperimentId}
        onSelectExperiment={setSelectedExperimentId}
      />
    );
  }

  function screen(): ReactNode {
    if (!hydrated) return <div className="validation-loading min-h-screen" />;
    if (view.name === 'home') return homeScreen();
    if (view.name === 'license') return <LicenseView onHome={goHome} />;
    if (!activeSurvey) return null;
    const history = surveyHistory(store, activeSurvey.id);

    if (view.name === 'quiz') {
      const run =
        view.actor === 'human'
          ? history.human
          : findAgentRun(history, view.runId);
      if (!run) return homeScreen();
      return (
        <QuizView
          key={view.runId}
          survey={activeSurvey}
          actor={view.actor}
          run={run}
          agentRun={view.actor === 'agent' ? (run as AgentRun) : undefined}
          onSaveAnswer={(questionId, optionId) =>
            saveAnswer(
              view.surveyId,
              view.actor,
              view.runId,
              questionId,
              optionId,
            )
          }
          onComplete={() => completeRun(view.surveyId, view.actor, view.runId)}
          onHome={goHome}
        />
      );
    }

    if (view.name === 'result') {
      const run =
        view.actor === 'human'
          ? history.human
          : findAgentRun(history, view.runId);
      if (!run?.completedAt) return homeScreen();
      const hasCompletedHuman = Boolean(
        history.human?.completedAt &&
        (view.actor === 'human' ||
          samePersonaContext(history.human.personaAgent, run.personaAgent)),
      );
      const completedCount = hasCompletedHuman
        ? completedAgentRuns(history, history.human!.id).length
        : 0;
      return (
        <ResultView
          survey={activeSurvey}
          actor={view.actor}
          run={run}
          agentRun={view.actor === 'agent' ? (run as AgentRun) : undefined}
          hasCompletedHuman={hasCompletedHuman}
          completedAgentCount={completedCount}
          onPrimary={() =>
            view.actor === 'agent'
              ? hasCompletedHuman
                ? setView({
                    name: 'comparison',
                    surveyId: view.surveyId,
                    runId: view.runId,
                  })
                : openHuman(view.surveyId)
              : goHome()
          }
          onHistory={() =>
            setView({ name: 'history', surveyId: view.surveyId })
          }
          onHumanChange={() => changeHumanBenchmark(view.surveyId)}
          onHome={goHome}
        />
      );
    }

    if (view.name === 'comparison') {
      const agentRun = findAgentRun(history, view.runId);
      if (
        !history.human?.completedAt ||
        !agentRun?.completedAt ||
        agentRun.benchmarkId !== history.human.id ||
        !samePersonaContext(history.human.personaAgent, agentRun.personaAgent)
      )
        return homeScreen();
      return (
        <ComparisonView
          survey={activeSurvey}
          human={history.human}
          agentRun={agentRun}
          onResult={(actor) =>
            setView({
              name: 'result',
              surveyId: view.surveyId,
              actor,
              runId: actor === 'human' ? history.human!.id : agentRun.id,
            })
          }
          onHistory={() =>
            setView({ name: 'history', surveyId: view.surveyId })
          }
          onHome={goHome}
        />
      );
    }

    if (
      !history.human?.completedAt ||
      completedAgentRuns(history, history.human.id).length === 0
    )
      return homeScreen();
    return (
      <HistoryView
        survey={activeSurvey}
        history={history}
        onComparison={(runId) =>
          setView({ name: 'comparison', surveyId: view.surveyId, runId })
        }
        onHumanResult={() =>
          setView({
            name: 'result',
            surveyId: view.surveyId,
            actor: 'human',
            runId: history.human!.id,
          })
        }
        onHome={goHome}
      />
    );
  }

  const showSaveStatus =
    hydrated && resolvedView.name !== 'license' && saveNotice !== null;
  const rootClassName = [
    embedded ? 'validation-embedded' : '',
    showSaveStatus ? 'validation-save-visible' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClassName || undefined}>
      {screen()}
      {showSaveStatus && <ValidationSaveStatus notice={saveNotice} />}
    </div>
  );
}

export default function HomePage() {
  return <ValidationApp />;
}
