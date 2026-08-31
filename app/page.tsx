'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  Database,
  History,
  Home,
  Info,
  Layers3,
  LockKeyhole,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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
  activeAgentDraft,
  completedAgentRuns,
  convergenceNarrative,
  convergencePoints,
  findAgentRun,
  INVALID_STORAGE_BACKUP_KEY,
  LEGACY_STORAGE_KEY,
  loadStoredSurveyData,
  mergeSurveyStores,
  serializeSurveyData,
  STORAGE_KEY,
  surveyHistory,
  type AgentRun,
  type ConvergencePoint,
  type HumanBenchmark,
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

type Actor = 'human' | 'agent';

type View =
  | { name: 'home' }
  | { name: 'agent-setup'; surveyId: SurveyId }
  | { name: 'quiz'; surveyId: SurveyId; actor: Actor; runId: string }
  | { name: 'result'; surveyId: SurveyId; actor: Actor; runId: string }
  | { name: 'comparison'; surveyId: SurveyId; runId: string }
  | { name: 'history'; surveyId: SurveyId }
  | { name: 'license' };

const actorMeta = {
  human: { label: 'Human benchmark', shortLabel: 'Human', Icon: UserRound },
  agent: { label: 'Agent run', shortLabel: 'Agent', Icon: Bot },
};

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
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
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
    <div className="flex items-center gap-3">
      <div className="logo-mark" aria-hidden="true">
        <span />
        <span />
      </div>
      <div>
        <p className="font-display text-[18px] font-black leading-none tracking-[-0.03em]">
          Mirror Match
        </p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          Persona check
        </p>
      </div>
    </div>
  );
}

function Shell({
  children,
  onHome,
  simple = false,
}: {
  children: ReactNode;
  onHome: () => void;
  simple?: boolean;
}) {
  return (
    <main className="min-h-screen">
      <header className="site-header">
        <button
          type="button"
          onClick={onHome}
          aria-label="Go to all surveys"
          className="rounded-xl focus-ring"
        >
          <Logo />
        </button>
        {!simple && (
          <button
            type="button"
            onClick={onHome}
            className="header-home focus-ring"
          >
            <Home size={15} /> All surveys
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
  onAgent,
  onHistory,
}: {
  survey: SurveyDefinition;
  history: SurveyHistory;
  onHuman: () => void;
  onAgent: () => void;
  onHistory: () => void;
}) {
  const human = history.human;
  const humanStatus = runStatus(human);
  const agentDraft = activeAgentDraft(history, human?.id);
  const savedCompleted = completedAgentRuns(history).sort(runCompletionOrder);
  const completed = completedAgentRuns(history, human?.id).sort(
    runCompletionOrder,
  );
  const unpairedCount = savedCompleted.length - completed.length;
  const latest = completed.at(-1);
  const canStartAgent = Boolean(human?.completedAt);
  const latestComparison =
    human?.completedAt && latest
      ? compareSurvey(survey, human.answers, latest.answers)
      : undefined;

  return (
    <article
      className="survey-card"
      style={
        {
          '--survey': survey.color,
          '--pale': survey.pale,
          '--ink': survey.ink,
        } as CSSProperties
      }
    >
      <div className="card-stripe" aria-hidden="true" />
      <div className="flex items-start justify-between gap-4">
        <div className="survey-number" aria-hidden="true">
          {String(surveys.indexOf(survey) + 1).padStart(2, '0')}
        </div>
        <span className="time-chip">{survey.time}</span>
      </div>
      <p
        className="mt-6 text-[11px] font-black uppercase tracking-[0.17em]"
        style={{ color: survey.ink }}
      >
        {survey.eyebrow}
      </p>
      <h2 className="font-display mt-2 text-[clamp(1.55rem,3vw,2.15rem)] font-black leading-[0.98] tracking-[-0.045em] text-slate-950">
        {survey.title}
      </h2>
      <p className="mt-3 min-h-[3.1rem] text-sm leading-6 text-slate-600">
        {survey.description}
      </p>

      <div className="mt-6 space-y-3">
        <button type="button" onClick={onHuman} className="run-row focus-ring">
          <span className="run-icon">
            <UserRound size={18} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-sm font-bold text-slate-900">
              Human benchmark
            </span>
            <span className="block truncate text-xs text-slate-500">
              {humanStatus === 'complete'
                ? `Saved locally ${formatDate(human?.completedAt)}`
                : humanStatus === 'in-progress'
                  ? `${Object.keys(human?.answers ?? {}).length} of ${survey.questions.length} answered`
                  : 'Set the answers Agent runs will match'}
            </span>
          </span>
          <StatusPill status={humanStatus} />
          <ChevronRight size={17} className="text-slate-400" />
        </button>

        <button
          type="button"
          onClick={onAgent}
          disabled={!canStartAgent}
          className="run-row focus-ring"
        >
          <span className="run-icon">
            <Bot size={18} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-sm font-bold text-slate-900">
              Agent experiments
            </span>
            <span className="block truncate text-xs text-slate-500">
              {!canStartAgent
                ? 'Save the Human benchmark first'
                : agentDraft
                  ? `Resume run ${agentDraft.sequence} - ${Object.keys(agentDraft.answers).length} of ${survey.questions.length} answered`
                  : latest && latestComparison
                    ? `Latest: run ${latest.sequence}, ${latest.dimensionCount ?? 'unknown'} reported dimensions, ${percent(latestComparison.similarity)} match`
                    : unpairedCount
                      ? `${unpairedCount} imported ${unpairedCount === 1 ? 'run is' : 'runs are'} saved without a matching benchmark`
                      : 'Start a blank Agent run in a fresh session'}
            </span>
          </span>
          <StatusPill
            status={
              agentDraft
                ? 'in-progress'
                : savedCompleted.length
                  ? 'complete'
                  : 'not-started'
            }
            label={
              savedCompleted.length
                ? `${savedCompleted.length} saved`
                : undefined
            }
          />
          <ChevronRight size={17} className="text-slate-400" />
        </button>
      </div>

      <button
        type="button"
        onClick={onHistory}
        disabled={savedCompleted.length === 0}
        className="compare-button focus-ring"
      >
        <TrendingUp size={17} />
        {completed.length
          ? `View convergence - ${completed.length} ${completed.length === 1 ? 'run' : 'runs'}`
          : unpairedCount
            ? `View saved ${unpairedCount === 1 ? 'run' : 'runs'}`
            : 'Complete an Agent run to compare'}
        {savedCompleted.length > 0 && (
          <ArrowRight size={16} className="ml-auto" />
        )}
      </button>
    </article>
  );
}

function HomeView({
  store,
  onHuman,
  onAgent,
  onHistory,
  onLicense,
}: {
  store: SurveyStore;
  onHuman: (surveyId: SurveyId) => void;
  onAgent: (surveyId: SurveyId) => void;
  onHistory: (surveyId: SurveyId) => void;
  onLicense: () => void;
}) {
  const benchmarkCount = surveys.filter(
    (survey) => surveyHistory(store, survey.id).human?.completedAt,
  ).length;
  const agentRunCount = surveys.reduce((sum, survey) => {
    const history = surveyHistory(store, survey.id);
    return sum + completedAgentRuns(history).length;
  }, 0);

  return (
    <Shell onHome={() => undefined} simple>
      <section className="hero-wrap">
        <div className="hero-orbit orbit-one" aria-hidden="true" />
        <div className="hero-orbit orbit-two" aria-hidden="true" />
        <div className="hero-grid">
          <div className="relative z-10 max-w-[790px]">
            <div className="hero-kicker">
              <Sparkles size={14} /> Watch a persona learn you
            </div>
            <h1 className="font-display mt-6 text-[clamp(3.25rem,8vw,7.1rem)] font-black leading-[0.84] tracking-[-0.07em] text-slate-950">
              Does more <span className="ink-swipe">persona detail</span>{' '}
              improve the match?
            </h1>
            <p className="mt-7 max-w-[650px] text-[clamp(1rem,2vw,1.25rem)] leading-8 text-slate-600">
              Save your answers once, then let the Agent take the same survey
              repeatedly with different amounts of persona detail. Every run
              stays separate and gets its own comparison.
            </p>
          </div>
          <div className="hero-note relative z-10">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">
              Local experiment log
            </p>
            <p className="font-display mt-3 text-4xl font-black tracking-[-0.05em] text-slate-950">
              {benchmarkCount}
              <span className="text-xl text-slate-400"> / 4</span>
            </p>
            <p className="text-xs font-bold text-slate-600">
              Human benchmarks set
            </p>
            <div className="my-4 h-px bg-slate-300/70" />
            <p className="font-display text-3xl font-black tracking-[-0.05em] text-slate-950">
              {agentRunCount}
            </p>
            <p className="text-xs font-bold text-slate-600">Agent runs saved</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1240px] px-5 pb-20 pt-16 sm:px-8 lg:px-10">
        <div className="mb-9 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="section-kicker">Four independent experiments</p>
            <h2 className="font-display mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">
              Set a benchmark. Repeat the Agent.
            </h2>
          </div>
          <p className="max-w-[430px] text-sm leading-6 text-slate-600">
            Each survey has its own Human benchmark, Agent run history, and
            convergence view. Results stay on this browser.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {surveys.map((survey) => (
            <SurveyCard
              key={survey.id}
              survey={survey}
              history={surveyHistory(store, survey.id)}
              onHuman={() => onHuman(survey.id)}
              onAgent={() => onAgent(survey.id)}
              onHistory={() => onHistory(survey.id)}
            />
          ))}
        </div>

        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={onLicense}
            className="text-sm font-bold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-950"
          >
            Sources and license
          </button>
        </div>
      </section>
    </Shell>
  );
}

function AgentSetupView({
  survey,
  nextSequence,
  onStart,
  onHome,
}: {
  survey: SurveyDefinition;
  nextSequence: number;
  onStart: (dimensionCount: number) => void;
  onHome: () => void;
}) {
  const [dimensionText, setDimensionText] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const validDimensions =
    /^\d+$/.test(dimensionText) && Number(dimensionText) <= 9999;

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validDimensions || !confirmed) return;
    onStart(Number(dimensionText));
  }

  return (
    <Shell onHome={onHome}>
      <div
        className="setup-stage"
        style={
          {
            '--survey': survey.color,
            '--pale': survey.pale,
            '--ink': survey.ink,
          } as CSSProperties
        }
      >
        <div className="setup-grid">
          <section>
            <div className="hero-kicker">
              <Plus size={14} /> Agent run {nextSequence}
            </div>
            <h1 className="font-display mt-6 text-[clamp(2.8rem,7vw,5.8rem)] font-black leading-[0.9] tracking-[-0.06em] text-slate-950">
              Start with a clean slate.
            </h1>
            <p className="mt-6 max-w-[610px] text-base leading-7 text-slate-600">
              This app creates a new, empty answer record. To keep the Agent
              from carrying earlier survey context, you must also use a new
              external conversation or session.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="protocol-card">
                <Database size={19} />
                <strong>New record</strong>
                <span>No answers are copied forward</span>
              </div>
              <div className="protocol-card">
                <LockKeyhole size={19} />
                <strong>Fresh-session protocol</strong>
                <span>Earlier Agent context stays outside the run</span>
              </div>
              <div className="protocol-card">
                <Layers3 size={19} />
                <strong>Frozen depth</strong>
                <span>Your reported count cannot change later</span>
              </div>
            </div>
          </section>

          <form onSubmit={submit} className="setup-form">
            <p className="section-kicker" style={{ color: survey.ink }}>
              Run metadata
            </p>
            <label
              htmlFor="dimension-count"
              className="font-display mt-4 block text-xl font-black tracking-[-0.025em] text-slate-950"
            >
              How many persona dimensions are filled in for this run?
            </label>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Enter your count of the populated persona fields available to the
              Agent. This is self-reported metadata, and zero is allowed as a
              baseline.
            </p>
            <Input
              id="dimension-count"
              type="number"
              min="0"
              max="9999"
              step="1"
              inputMode="numeric"
              value={dimensionText}
              onChange={(event) => setDimensionText(event.target.value)}
              placeholder="For example, 12"
              className="mt-5 h-14 rounded-xl border-slate-300 bg-white px-4 text-lg font-black"
              required
            />

            <label
              htmlFor="fresh-agent-session"
              className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <Checkbox
                id="fresh-agent-session"
                checked={confirmed}
                onCheckedChange={(value) => setConfirmed(value === true)}
                className="mt-1"
              />
              <span>
                <strong className="block text-sm text-slate-900">
                  I will use a fresh Agent conversation or session
                </strong>
                <span className="mt-1 block text-xs leading-5 text-slate-600">
                  The browser can start a blank run, but it cannot erase the
                  memory of an external Agent. Do not reuse an earlier
                  conversation, response ID, or chat history.
                </span>
              </span>
            </label>

            <button
              type="submit"
              disabled={!validDimensions || !confirmed}
              className="primary-button mt-6 w-full focus-ring"
              style={{ backgroundColor: survey.color }}
            >
              Start blank Agent run <ArrowRight size={17} />
            </button>
            <button
              type="button"
              onClick={onHome}
              className="secondary-button mt-3 w-full focus-ring"
            >
              <ArrowLeft size={16} /> All surveys
            </button>
          </form>
        </div>
      </div>
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
  onDiscard,
  onHome,
}: {
  survey: SurveyDefinition;
  actor: Actor;
  run: StoredRun;
  agentRun?: AgentRun;
  onSaveAnswer: (questionId: string, optionId: string) => void;
  onComplete: () => void;
  onDiscard?: () => void;
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

  function next() {
    if (!selected) return;
    if (isLast) onComplete();
    else setIndex((value) => value + 1);
  }

  return (
    <Shell onHome={onHome}>
      <div
        className="quiz-stage"
        style={
          {
            '--survey': survey.color,
            '--pale': survey.pale,
            '--ink': survey.ink,
          } as CSSProperties
        }
      >
        <div className="quiz-topline">
          <div>
            <p className="section-kicker" style={{ color: survey.ink }}>
              {survey.shortTitle}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-700">
              <meta.Icon size={17} />
              {actor === 'agent' && agentRun
                ? `Agent run ${agentRun.sequence}`
                : 'Human benchmark'}
              {actor === 'agent' && agentRun && (
                <span className="run-metadata-chip">
                  {agentRun.dimensionCount} reported persona dimensions
                </span>
              )}
            </div>
          </div>
          <p className="text-right text-sm font-bold text-slate-500">
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

        <section className="question-card">
          <div
            className="question-bubble"
            style={{ backgroundColor: survey.pale, color: survey.ink }}
          >
            {index + 1}
          </div>
          {question.dimension && (
            <p
              className="mb-3 text-xs font-black uppercase tracking-[0.16em]"
              style={{ color: survey.ink }}
            >
              {question.dimension}
            </p>
          )}
          <h1 className="font-display max-w-[820px] text-[clamp(1.75rem,4vw,3.3rem)] font-black leading-[1.05] tracking-[-0.045em] text-slate-950">
            {question.prompt}
          </h1>

          <fieldset
            className={`mt-8 ${survey.kind === 'scale' ? 'scale-options' : 'space-y-3'}`}
          >
            <legend className="sr-only">{question.prompt}</legend>
            {question.options.map((option, optionIndex) => {
              const active = selected === option.id;
              return (
                <button
                  type="button"
                  aria-pressed={active}
                  key={option.id}
                  onClick={() => onSaveAnswer(question.id, option.id)}
                  className={`answer-option focus-ring ${active ? 'answer-selected' : ''} ${survey.kind === 'scale' ? 'scale-option' : ''}`}
                  style={
                    active
                      ? ({
                          '--survey': survey.color,
                          '--pale': survey.pale,
                          '--ink': survey.ink,
                        } as CSSProperties)
                      : undefined
                  }
                >
                  <span className="option-key">
                    {survey.kind === 'scale'
                      ? option.id
                      : String.fromCharCode(65 + optionIndex)}
                  </span>
                  <span className="flex-1 text-left">{option.label}</span>
                  <span className="option-check">
                    {active ? (
                      <Check size={15} strokeWidth={3} />
                    ) : (
                      <Circle size={15} />
                    )}
                  </span>
                </button>
              );
            })}
          </fieldset>

          <div className="mt-9 flex items-center justify-between gap-4 border-t border-slate-200 pt-6">
            <button
              type="button"
              onClick={() =>
                index === 0 ? onHome() : setIndex((value) => value - 1)
              }
              className="secondary-button focus-ring"
            >
              <ArrowLeft size={17} /> {index === 0 ? 'All surveys' : 'Previous'}
            </button>
            <button
              type="button"
              onClick={next}
              disabled={!selected}
              className="primary-button focus-ring"
              style={{ backgroundColor: survey.color }}
            >
              {isLast ? 'Finish this run' : 'Next question'}{' '}
              <ArrowRight size={17} />
            </button>
          </div>
        </section>
        <p className="mx-auto mt-5 max-w-[720px] text-center text-xs leading-5 text-slate-500">
          {actor === 'human'
            ? 'These answers become the fixed benchmark for every Agent run in this survey.'
            : 'This quiz view does not display Human answers or earlier Agent results. Context isolation still depends on using the fresh external session you confirmed.'}
        </p>
        {actor === 'agent' && onDiscard && (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={onDiscard}
              className="text-xs font-black text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-slate-900 focus-ring"
            >
              Discard this draft and start fresh
            </button>
          </div>
        )}
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
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow"
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
  completedAgentCount,
  onPrimary,
  onHistory,
  onNewAgent,
  onHumanChange,
  onHome,
}: {
  survey: SurveyDefinition;
  actor: Actor;
  run: StoredRun;
  agentRun?: AgentRun;
  completedAgentCount: number;
  onPrimary: () => void;
  onHistory: () => void;
  onNewAgent: () => void;
  onHumanChange: () => void;
  onHome: () => void;
}) {
  const result = scoreSurvey(survey, run.answers);
  const isAgent = actor === 'agent' && agentRun;
  const meta = actorMeta[actor];
  const primaryTitle = isAgent
    ? `Compare Agent run ${agentRun.sequence}`
    : completedAgentCount
      ? 'See how the Agent runs converge'
      : 'Start the first Agent run';
  const primaryCopy = isAgent
    ? 'The Human benchmark and this run are now ready for their own question-level comparison.'
    : completedAgentCount
      ? `There ${completedAgentCount === 1 ? 'is' : 'are'} ${completedAgentCount} saved Agent ${completedAgentCount === 1 ? 'run' : 'runs'} against this fixed benchmark.`
      : 'The Human answers are saved locally. Every new Agent run will compare back to this benchmark.';

  return (
    <Shell onHome={onHome}>
      <div
        className="result-stage"
        style={
          {
            '--survey': survey.color,
            '--pale': survey.pale,
            '--ink': survey.ink,
          } as CSSProperties
        }
      >
        <section className="result-hero">
          <div className="result-spark spark-a" aria-hidden="true">
            ✦
          </div>
          <div className="result-spark spark-b" aria-hidden="true">
            ●
          </div>
          <div className="relative z-10">
            <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/80 bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.13em] text-slate-600 shadow-sm">
              <meta.Icon size={15} />{' '}
              {isAgent ? `Agent run ${agentRun.sequence}` : 'Human benchmark'} -{' '}
              {survey.shortTitle}
            </div>
            {isAgent && (
              <div
                className="mx-auto mt-4 w-fit rounded-full px-3 py-1.5 text-xs font-black"
                style={{ backgroundColor: survey.color, color: 'white' }}
              >
                {agentRun.dimensionCount ?? 'Unknown'} reported persona
                dimensions
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

        <section className="mx-auto mt-7 max-w-[900px] rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
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
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 sm:ml-8 sm:mt-0 focus-ring"
          >
            {isAgent ? (
              <ClipboardCheck size={18} />
            ) : completedAgentCount ? (
              <TrendingUp size={18} />
            ) : (
              <Bot size={18} />
            )}
            {isAgent
              ? 'Compare this run'
              : completedAgentCount
                ? 'View convergence'
                : 'Start Agent run'}
            <ArrowRight size={17} />
          </button>
        </section>

        <div className="mx-auto mt-7 flex max-w-[900px] flex-wrap items-center justify-center gap-3 pb-14">
          <button
            type="button"
            onClick={onHome}
            className="secondary-button focus-ring"
          >
            <Home size={16} /> All surveys
          </button>
          {isAgent ? (
            <>
              <button
                type="button"
                onClick={onHistory}
                className="secondary-button focus-ring"
              >
                <History size={16} /> Run history
              </button>
              <button
                type="button"
                onClick={onNewAgent}
                className="secondary-button focus-ring"
              >
                <Plus size={16} /> New Agent run
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onHumanChange}
              className="secondary-button focus-ring"
            >
              <RotateCcw size={16} />{' '}
              {completedAgentCount ? 'Reset survey' : 'Retake benchmark'}
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
  onNewAgent,
  onHome,
}: {
  survey: SurveyDefinition;
  human: HumanBenchmark;
  agentRun: AgentRun;
  onResult: (actor: Actor) => void;
  onHistory: () => void;
  onNewAgent: () => void;
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
      <div
        className="comparison-stage"
        style={
          {
            '--survey': survey.color,
            '--pale': survey.pale,
            '--ink': survey.ink,
          } as CSSProperties
        }
      >
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
              <strong>{agentRun.dimensionCount ?? 'N/A'}</strong> reported
              persona dimensions
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

        <section className="mx-auto mt-8 max-w-[1080px] rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
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
            <div className="divide-y divide-slate-200">
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

        <section className="mx-auto mt-6 max-w-[1080px] rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950 sm:flex sm:items-start sm:gap-4 sm:p-6">
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
            onClick={onNewAgent}
            className="secondary-button focus-ring"
          >
            <Plus size={16} /> New Agent run
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
            <Home size={16} /> All surveys
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
        Reported persona dimensions and answer similarity
      </h3>
      <p id="convergence-chart-description" className="sr-only">
        A scatter plot of Agent runs. Reported persona dimensions are on the
        horizontal axis and answer similarity from zero to one hundred percent
        is on the vertical axis. Exact overlaps are grouped, and the table below
        contains every run.
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
            Reported persona dimensions
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
                  {runLabel}, {cluster.dimensionCount} reported persona
                  dimensions, {Math.round(cluster.similarity * 100)} percent
                  similarity
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
  onNewAgent,
  onHumanResult,
  onHome,
}: {
  survey: SurveyDefinition;
  history: SurveyHistory;
  onComparison: (runId: string) => void;
  onNewAgent: () => void;
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
      <div
        className="history-stage"
        style={
          {
            '--survey': survey.color,
            '--pale': survey.pale,
            '--ink': survey.ink,
          } as CSSProperties
        }
      >
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
              <small>Latest reported depth</small>
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

        <section className="mx-auto mt-8 max-w-[1120px] rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm sm:p-9">
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
            <button
              type="button"
              onClick={onNewAgent}
              className="primary-button shrink-0 focus-ring"
              style={{ backgroundColor: survey.color }}
            >
              <Plus size={17} /> New Agent run
            </button>
          </div>
          {points.length ? (
            <ConvergenceChart points={points} survey={survey} />
          ) : (
            <div className="empty-match">
              <TrendingUp size={34} style={{ color: survey.color }} />
              <p className="mt-4 max-w-[460px] text-center text-sm leading-6 text-slate-600">
                Start the first measured Agent run to add a point.
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

        <section className="mx-auto mt-8 max-w-[1120px] rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm sm:p-9">
          <div className="border-b border-slate-200 pb-6">
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
            <Table className="mt-4 min-w-[760px]">
              <TableCaption className="sr-only">
                Agent comparison runs in completion order
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>Reported dimensions</TableHead>
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
                        className="text-sm font-black underline decoration-slate-300 underline-offset-4 hover:text-slate-600 focus-ring"
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
                The Human benchmark is ready for a fresh experiment.
              </p>
            </div>
          )}
          {unpairedRuns.length > 0 && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
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

        <section className="mx-auto mt-6 max-w-[1120px] rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950 sm:flex sm:items-start sm:gap-4 sm:p-6">
          <Info className="mb-3 shrink-0 text-amber-700 sm:mb-0" size={20} />
          <p>
            <strong>Interpret with care:</strong> A higher score at greater
            reported persona depth is a pattern consistent with convergence in
            this survey. It is not proof of causation or general behavioral
            fidelity. Repeated runs at the same depth can help reveal
            variability.
          </p>
        </section>

        <div className="mx-auto flex max-w-[1120px] flex-wrap justify-center gap-3 pb-16 pt-8">
          <button
            type="button"
            onClick={onNewAgent}
            className="primary-button bg-slate-950 focus-ring"
          >
            <Plus size={17} /> New Agent run
          </button>
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
            <Home size={16} /> All surveys
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
          <ArrowLeft size={16} /> All surveys
        </button>
        <p className="section-kicker mt-10">Sources and license</p>
        <h1 className="font-display mt-2 text-4xl font-black tracking-[-0.045em] text-slate-950 sm:text-5xl">
          A playful remix, with credit
        </h1>
        <p className="mt-6 text-base leading-7 text-slate-600">
          The 28-question Internet Creature Index adapts the open-source Silly
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
        <div className="mt-10 rounded-2xl bg-slate-950 p-6 font-mono text-xs leading-6 text-slate-300 sm:p-8">
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

function LocalNotice({ message }: { message: string }) {
  return (
    <output className="local-notice" aria-live="polite">
      <ShieldCheck size={17} />
      <span>{message}</span>
    </output>
  );
}

export default function HomePage() {
  const [store, setStore] = useState<SurveyStore>({});
  const [view, setView] = useState<View>({ name: 'home' });
  const [hydrated, setHydrated] = useState(false);
  const [localNotice, setLocalNotice] = useState('');
  const skipNextSave = useRef(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const loaded = loadStoredSurveyData(
          window.localStorage.getItem(STORAGE_KEY),
          window.localStorage.getItem(LEGACY_STORAGE_KEY),
        );
        skipNextSave.current = loaded.source !== 'legacy';
        if (loaded.invalidV2Text) {
          window.localStorage.setItem(
            INVALID_STORAGE_BACKUP_KEY,
            loaded.invalidV2Text,
          );
        }
        setStore(loaded.store);
        if (loaded.warning) setLocalNotice(loaded.warning);
      } catch {
        skipNextSave.current = true;
        setLocalNotice(
          'Results could not be loaded from this browser. New answers may not persist.',
        );
      }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    let noticeFrame: number | undefined;
    let reconcileFrame: number | undefined;
    try {
      const saved = loadStoredSurveyData(
        window.localStorage.getItem(STORAGE_KEY),
        null,
      );
      const nextStore =
        saved.source === 'v2' ? mergeSurveyStores(saved.store, store) : store;
      window.localStorage.setItem(STORAGE_KEY, serializeSurveyData(nextStore));
      if (JSON.stringify(nextStore) !== JSON.stringify(store)) {
        skipNextSave.current = true;
        reconcileFrame = window.requestAnimationFrame(() => {
          setStore(nextStore);
          setLocalNotice(
            'Local changes from another tab were merged into this view.',
          );
        });
      }
    } catch {
      noticeFrame = window.requestAnimationFrame(() =>
        setLocalNotice(
          'Results could not be saved on this device. Check browser storage settings before continuing.',
        ),
      );
    }
    return () => {
      if (noticeFrame !== undefined) window.cancelAnimationFrame(noticeFrame);
      if (reconcileFrame !== undefined)
        window.cancelAnimationFrame(reconcileFrame);
    };
  }, [store, hydrated]);

  useEffect(() => {
    function syncFromAnotherTab(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      if (!event.newValue) {
        skipNextSave.current = true;
        setStore({});
        setView({ name: 'home' });
        setLocalNotice(
          'Local results were cleared in another tab. This view was reset.',
        );
        return;
      }
      const loaded = loadStoredSurveyData(event.newValue, null);
      if (loaded.source !== 'v2') {
        if (loaded.invalidV2Text) {
          try {
            window.localStorage.setItem(
              INVALID_STORAGE_BACKUP_KEY,
              loaded.invalidV2Text,
            );
          } catch {
            // Keep the active in-memory results when the remote value is invalid.
          }
        }
        setLocalNotice(
          'Another tab wrote an invalid results record. The current view was kept.',
        );
        return;
      }
      skipNextSave.current = true;
      setStore(loaded.store);
      setLocalNotice(
        'Local results changed in another tab. The latest saved version was loaded.',
      );
    }
    window.addEventListener('storage', syncFromAnotherTab);
    return () => window.removeEventListener('storage', syncFromAnotherTab);
  }, []);

  const activeSurvey = useMemo(
    () => ('surveyId' in view ? surveyById[view.surveyId] : undefined),
    [view],
  );

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
    setView({ name: 'home' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openHuman(surveyId: SurveyId) {
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
      const human: HumanBenchmark = {
        id: makeId('human'),
        answers: {},
        startedAt: new Date().toISOString(),
      };
      updateSurvey(surveyId, (current) => ({ ...current, human }));
      setView({ name: 'quiz', surveyId, actor: 'human', runId: human.id });
    }
    window.scrollTo({ top: 0 });
  }

  function openAgent(surveyId: SurveyId) {
    const history = surveyHistory(store, surveyId);
    if (!history.human?.completedAt) {
      openHuman(surveyId);
      return;
    }
    const draft = activeAgentDraft(history, history.human.id);
    setView(
      draft
        ? { name: 'quiz', surveyId, actor: 'agent', runId: draft.id }
        : { name: 'agent-setup', surveyId },
    );
    window.scrollTo({ top: 0 });
  }

  function createAgentRun(surveyId: SurveyId, dimensionCount: number) {
    const history = surveyHistory(store, surveyId);
    if (!history.human?.completedAt) return;
    const existingDraft = activeAgentDraft(history, history.human.id);
    if (existingDraft) {
      setView({
        name: 'quiz',
        surveyId,
        actor: 'agent',
        runId: existingDraft.id,
      });
      return;
    }
    const nextSequence =
      Math.max(0, ...history.agentRuns.map((run) => run.sequence)) + 1;
    const now = new Date().toISOString();
    const run: AgentRun = {
      id: makeId('agent'),
      sequence: nextSequence,
      dimensionCount,
      answers: {},
      startedAt: now,
      freshSessionAttestedAt: now,
      benchmarkId: history.human.id,
    };
    updateSurvey(surveyId, (current) => ({
      ...current,
      agentRuns: [...current.agentRuns, run],
    }));
    setView({ name: 'quiz', surveyId, actor: 'agent', runId: run.id });
    window.scrollTo({ top: 0 });
  }

  function discardAgentDraft(surveyId: SurveyId, runId: string) {
    if (
      !window.confirm(
        'Discard this unfinished Agent run? Completed runs and the Human benchmark will stay saved.',
      )
    )
      return;
    updateSurvey(surveyId, (history) => {
      const target = history.agentRuns.find((run) => run.id === runId);
      if (!target || target.completedAt) return history;
      return {
        ...history,
        agentRuns: history.agentRuns.filter((run) => run.id !== runId),
        deletedAgentRuns: [
          ...(history.deletedAgentRuns ?? []).filter(
            (deletion) => deletion.id !== runId,
          ),
          { id: runId, deletedAt: new Date().toISOString() },
        ],
      };
    });
    setView({ name: 'agent-setup', surveyId });
    window.scrollTo({ top: 0 });
  }

  function saveAnswer(
    surveyId: SurveyId,
    actor: Actor,
    runId: string,
    questionId: string,
    optionId: string,
  ) {
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
            answers: { ...history.human.answers, [questionId]: optionId },
          },
        };
      }
      return {
        ...history,
        agentRuns: history.agentRuns.map((run) =>
          run.id === runId && !run.completedAt
            ? { ...run, answers: { ...run.answers, [questionId]: optionId } }
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
        ? {
            ...current,
            human:
              current.human?.id === runId
                ? {
                    ...current.human,
                    completedAt: current.human.completedAt ?? completedAt,
                  }
                : current.human,
          }
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
    const hasAgentHistory = history.agentRuns.length > 0;
    const message = hasAgentHistory
      ? 'Reset this survey? This removes its Human benchmark and every Agent run from this browser. Other surveys are not affected.'
      : 'Retake this Human benchmark? Its current answers will be replaced.';
    if (!window.confirm(message)) return;
    const human: HumanBenchmark = {
      id: makeId('human'),
      answers: {},
      startedAt: new Date().toISOString(),
    };
    setStore((current) => ({
      ...current,
      [surveyId]: {
        human,
        agentRuns: [],
        generation: (surveyHistory(current, surveyId).generation ?? 0) + 1,
        deletedAgentRuns: [],
      },
    }));
    setView({ name: 'quiz', surveyId, actor: 'human', runId: human.id });
    window.scrollTo({ top: 0 });
  }

  function screen(): ReactNode {
    if (!hydrated) return <div className="min-h-screen bg-[#f8f7f4]" />;
    if (view.name === 'home')
      return (
        <HomeView
          store={store}
          onHuman={openHuman}
          onAgent={openAgent}
          onHistory={(surveyId) => setView({ name: 'history', surveyId })}
          onLicense={() => setView({ name: 'license' })}
        />
      );
    if (view.name === 'license') return <LicenseView onHome={goHome} />;
    if (!activeSurvey) return null;
    const history = surveyHistory(store, activeSurvey.id);

    if (view.name === 'agent-setup') {
      const nextSequence =
        Math.max(0, ...history.agentRuns.map((run) => run.sequence)) + 1;
      return (
        <AgentSetupView
          survey={activeSurvey}
          nextSequence={nextSequence}
          onStart={(dimensionCount) =>
            createAgentRun(view.surveyId, dimensionCount)
          }
          onHome={goHome}
        />
      );
    }

    if (view.name === 'quiz') {
      const run =
        view.actor === 'human'
          ? history.human
          : findAgentRun(history, view.runId);
      if (!run)
        return (
          <HomeView
            store={store}
            onHuman={openHuman}
            onAgent={openAgent}
            onHistory={(surveyId) => setView({ name: 'history', surveyId })}
            onLicense={() => setView({ name: 'license' })}
          />
        );
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
          onDiscard={
            view.actor === 'agent'
              ? () => discardAgentDraft(view.surveyId, view.runId)
              : undefined
          }
          onHome={goHome}
        />
      );
    }

    if (view.name === 'result') {
      const run =
        view.actor === 'human'
          ? history.human
          : findAgentRun(history, view.runId);
      if (!run?.completedAt)
        return (
          <HomeView
            store={store}
            onHuman={openHuman}
            onAgent={openAgent}
            onHistory={(surveyId) => setView({ name: 'history', surveyId })}
            onLicense={() => setView({ name: 'license' })}
          />
        );
      const completedCount = completedAgentRuns(
        history,
        history.human?.id,
      ).length;
      return (
        <ResultView
          survey={activeSurvey}
          actor={view.actor}
          run={run}
          agentRun={view.actor === 'agent' ? (run as AgentRun) : undefined}
          completedAgentCount={completedCount}
          onPrimary={() =>
            view.actor === 'agent'
              ? setView({
                  name: 'comparison',
                  surveyId: view.surveyId,
                  runId: view.runId,
                })
              : completedCount
                ? setView({ name: 'history', surveyId: view.surveyId })
                : openAgent(view.surveyId)
          }
          onHistory={() =>
            setView({ name: 'history', surveyId: view.surveyId })
          }
          onNewAgent={() => openAgent(view.surveyId)}
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
        agentRun.benchmarkId !== history.human.id
      )
        return (
          <HomeView
            store={store}
            onHuman={openHuman}
            onAgent={openAgent}
            onHistory={(surveyId) => setView({ name: 'history', surveyId })}
            onLicense={() => setView({ name: 'license' })}
          />
        );
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
          onNewAgent={() => openAgent(view.surveyId)}
          onHome={goHome}
        />
      );
    }

    if (!history.human?.completedAt)
      return (
        <HomeView
          store={store}
          onHuman={openHuman}
          onAgent={openAgent}
          onHistory={(surveyId) => setView({ name: 'history', surveyId })}
          onLicense={() => setView({ name: 'license' })}
        />
      );
    return (
      <HistoryView
        survey={activeSurvey}
        history={history}
        onComparison={(runId) =>
          setView({ name: 'comparison', surveyId: view.surveyId, runId })
        }
        onNewAgent={() => openAgent(view.surveyId)}
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

  return (
    <>
      {screen()}
      {localNotice && <LocalNotice message={localNotice} />}
    </>
  );
}
