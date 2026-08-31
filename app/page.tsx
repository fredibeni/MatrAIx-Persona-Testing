'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, ChevronRight, Circle, ClipboardCheck, Home, Info, RotateCcw, Sparkles, UserRound, UsersRound } from 'lucide-react';
import { compareSurvey, percent, scoreSurvey, type Answers, type CategoryResult, type DialResult, type SillyResult, type SurveyResult } from '@/lib/scoring';
import { axisMeta, categoryMeta, surveyById, surveys, type Respondent, type SurveyDefinition, type SurveyId } from '@/lib/surveys';

interface StoredRun { answers: Answers; completedAt?: string }
type Store = Partial<Record<SurveyId, Partial<Record<Respondent, StoredRun>>>>;
type View =
  | { name: 'home' }
  | { name: 'quiz'; surveyId: SurveyId; respondent: Respondent }
  | { name: 'result'; surveyId: SurveyId; respondent: Respondent }
  | { name: 'comparison'; surveyId: SurveyId }
  | { name: 'license' };

const STORAGE_KEY = 'mirror-match-surveys-v1';
const respondentMeta = {
  human: { label: 'Human', action: 'Answer as me', Icon: UserRound },
  persona: { label: 'Persona', action: 'Run my persona', Icon: Bot },
};

function runStatus(run?: StoredRun) {
  if (run?.completedAt) return 'complete';
  if (run && Object.keys(run.answers).length > 0) return 'in-progress';
  return 'not-started';
}

function completedRun(store: Store, surveyId: SurveyId, respondent: Respondent) {
  const run = store[surveyId]?.[respondent];
  return run?.completedAt ? run : undefined;
}

function formatDate(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function StatusPill({ run }: { run?: StoredRun }) {
  const status = runStatus(run);
  if (status === 'complete') return <span className="status-pill status-complete"><Check size={12} strokeWidth={3} /> Complete</span>;
  if (status === 'in-progress') return <span className="status-pill status-progress">In progress</span>;
  return <span className="status-pill status-empty">Not started</span>;
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="logo-mark" aria-hidden="true"><span /><span /></div>
      <div>
        <p className="font-display text-[18px] font-black leading-none tracking-[-0.03em]">Mirror Match</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Persona check</p>
      </div>
    </div>
  );
}

function Shell({ children, onHome, simple = false }: { children: React.ReactNode; onHome: () => void; simple?: boolean }) {
  return (
    <main className="min-h-screen">
      <header className="site-header">
        <button type="button" onClick={onHome} aria-label="Go to all surveys" className="rounded-xl focus-ring"><Logo /></button>
        {!simple && <button type="button" onClick={onHome} className="header-home focus-ring"><Home size={15} /> All surveys</button>}
      </header>
      {children}
    </main>
  );
}

function SurveyCard({ survey, store, onOpen, onCompare }: { survey: SurveyDefinition; store: Store; onOpen: (surveyId: SurveyId, respondent: Respondent) => void; onCompare: (surveyId: SurveyId) => void }) {
  const human = store[survey.id]?.human;
  const persona = store[survey.id]?.persona;
  const ready = Boolean(human?.completedAt && persona?.completedAt);
  return (
    <article className="survey-card" style={{ '--survey': survey.color, '--pale': survey.pale, '--ink': survey.ink } as React.CSSProperties}>
      <div className="card-stripe" aria-hidden="true" />
      <div className="flex items-start justify-between gap-4">
        <div className="survey-number" aria-hidden="true">{String(surveys.indexOf(survey) + 1).padStart(2, '0')}</div>
        <span className="time-chip">{survey.time}</span>
      </div>
      <p className="mt-6 text-[11px] font-black uppercase tracking-[0.17em]" style={{ color: survey.ink }}>{survey.eyebrow}</p>
      <h2 className="font-display mt-2 text-[clamp(1.55rem,3vw,2.15rem)] font-black leading-[0.98] tracking-[-0.045em] text-slate-950">{survey.title}</h2>
      <p className="mt-3 min-h-[3.1rem] text-sm leading-6 text-slate-600">{survey.description}</p>
      <div className="mt-6 space-y-3">
        {(['human', 'persona'] as Respondent[]).map((respondent) => {
          const meta = respondentMeta[respondent];
          const run = respondent === 'human' ? human : persona;
          const status = runStatus(run);
          return (
            <button key={respondent} type="button" onClick={() => onOpen(survey.id, respondent)} className="run-row focus-ring" aria-label={`${status === 'complete' ? 'View' : status === 'in-progress' ? 'Resume' : 'Start'} ${meta.label} run for ${survey.title}`}>
              <span className="run-icon"><meta.Icon size={18} /></span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-sm font-bold text-slate-900">{meta.label} run</span>
                <span className="block truncate text-xs text-slate-500">{status === 'complete' ? `Result saved ${formatDate(run?.completedAt)}` : status === 'in-progress' ? `${Object.keys(run?.answers ?? {}).length} of ${survey.questions.length} answered` : meta.action}</span>
              </span>
              <StatusPill run={run} />
              <ChevronRight size={17} className="text-slate-400" />
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => onCompare(survey.id)} disabled={!ready} className="compare-button focus-ring">
        <UsersRound size={17} />{ready ? 'Compare this survey' : 'Complete both runs to compare'}{ready && <ArrowRight size={16} className="ml-auto" />}
      </button>
    </article>
  );
}

function HomeView({ store, onOpen, onCompare, onLicense }: { store: Store; onOpen: (surveyId: SurveyId, respondent: Respondent) => void; onCompare: (surveyId: SurveyId) => void; onLicense: () => void }) {
  const completeRuns = surveys.reduce((sum, survey) => sum + (completedRun(store, survey.id, 'human') ? 1 : 0) + (completedRun(store, survey.id, 'persona') ? 1 : 0), 0);
  return (
    <Shell onHome={() => undefined} simple>
      <section className="hero-wrap">
        <div className="hero-orbit orbit-one" aria-hidden="true" /><div className="hero-orbit orbit-two" aria-hidden="true" />
        <div className="hero-grid">
          <div className="relative z-10 max-w-[770px]">
            <div className="hero-kicker"><Sparkles size={14} /> Human you, meet simulated you</div>
            <h1 className="font-display mt-6 text-[clamp(3.25rem,8vw,7.4rem)] font-black leading-[0.84] tracking-[-0.07em] text-slate-950">How well does your <span className="ink-swipe">persona</span> know you?</h1>
            <p className="mt-7 max-w-[610px] text-[clamp(1rem,2vw,1.25rem)] leading-8 text-slate-600">Take the same playful surveys twice - once as yourself and once as your persona agent. Every survey keeps its own result and comparison.</p>
          </div>
          <div className="hero-note relative z-10">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">Your progress</p>
            <p className="font-display mt-2 text-5xl font-black tracking-[-0.05em] text-slate-950">{completeRuns}<span className="text-2xl text-slate-400"> / 8</span></p>
            <p className="mt-2 text-sm leading-5 text-slate-600">runs complete across four independent surveys</p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/70"><div className="h-full rounded-full bg-slate-950 transition-all" style={{ width: `${(completeRuns / 8) * 100}%` }} /></div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-[1240px] px-5 pb-20 pt-16 sm:px-8 lg:px-10">
        <div className="mb-9 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="section-kicker">Choose your own adventure</p><h2 className="font-display mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950 sm:text-4xl">Start anywhere. Stop anytime.</h2></div>
          <p className="max-w-[400px] text-sm leading-6 text-slate-600">Each card is a standalone survey. Finish one, compare it, and leave the others for later.</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">{surveys.map((survey) => <SurveyCard key={survey.id} survey={survey} store={store} onOpen={onOpen} onCompare={onCompare} />)}</div>
        <div className="mt-12 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:flex sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-start gap-4"><div className="rounded-2xl bg-amber-100 p-3 text-amber-800"><Info size={20} /></div><div><h3 className="font-display text-lg font-black text-slate-950">A mirror, not a verdict</h3><p className="mt-1 max-w-[720px] text-sm leading-6 text-slate-600">These surveys are playful. Similarity shows how closely the selected answers line up - it does not prove that a persona is accurate in every context.</p></div></div>
          <button type="button" onClick={onLicense} className="mt-5 shrink-0 text-sm font-bold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-950 sm:ml-6 sm:mt-0">Sources and license</button>
        </div>
      </section>
    </Shell>
  );
}

function QuizView({ survey, respondent, run, onSaveAnswer, onComplete, onHome }: { survey: SurveyDefinition; respondent: Respondent; run: StoredRun; onSaveAnswer: (questionId: string, optionId: string) => void; onComplete: () => void; onHome: () => void }) {
  const firstMissing = survey.questions.findIndex((question) => !run.answers[question.id]);
  const [index, setIndex] = useState(firstMissing === -1 ? survey.questions.length - 1 : firstMissing);
  const question = survey.questions[index];
  const selected = run.answers[question.id];
  const progress = ((index + 1) / survey.questions.length) * 100;
  const meta = respondentMeta[respondent];
  const isLast = index === survey.questions.length - 1;
  const next = () => { if (!selected) return; if (isLast) onComplete(); else setIndex((value) => value + 1); };
  return (
    <Shell onHome={onHome}>
      <div className="quiz-stage" style={{ '--survey': survey.color, '--pale': survey.pale, '--ink': survey.ink } as React.CSSProperties}>
        <div className="quiz-topline"><div><p className="section-kicker" style={{ color: survey.ink }}>{survey.shortTitle}</p><div className="mt-2 flex items-center gap-2 text-sm font-bold text-slate-700"><meta.Icon size={17} /> {meta.label} run</div></div><p className="text-right text-sm font-bold text-slate-500">Question {index + 1} of {survey.questions.length}</p></div>
        <div className="progress-track" aria-label={`${Math.round(progress)} percent complete`}><div style={{ width: `${progress}%`, backgroundColor: survey.color }} /></div>
        <section className="question-card">
          <div className="question-bubble" style={{ backgroundColor: survey.pale, color: survey.ink }}>{index + 1}</div>
          {question.dimension && <p className="mb-3 text-xs font-black uppercase tracking-[0.16em]" style={{ color: survey.ink }}>{question.dimension}</p>}
          <h1 className="font-display max-w-[820px] text-[clamp(1.75rem,4vw,3.3rem)] font-black leading-[1.05] tracking-[-0.045em] text-slate-950">{question.prompt}</h1>
          <fieldset className={`mt-8 ${survey.kind === 'scale' ? 'scale-options' : 'space-y-3'}`}>
            <legend className="sr-only">{question.prompt}</legend>
            {question.options.map((option, optionIndex) => {
              const active = selected === option.id;
              return <button type="button" aria-pressed={active} key={option.id} onClick={() => onSaveAnswer(question.id, option.id)} className={`answer-option focus-ring ${active ? 'answer-selected' : ''} ${survey.kind === 'scale' ? 'scale-option' : ''}`} style={active ? ({ '--survey': survey.color, '--pale': survey.pale, '--ink': survey.ink } as React.CSSProperties) : undefined}><span className="option-key">{survey.kind === 'scale' ? option.id : String.fromCharCode(65 + optionIndex)}</span><span className="flex-1 text-left">{option.label}</span><span className="option-check">{active ? <Check size={15} strokeWidth={3} /> : <Circle size={15} />}</span></button>;
            })}
          </fieldset>
          <div className="mt-9 flex items-center justify-between gap-4 border-t border-slate-200 pt-6">
            <button type="button" onClick={() => (index === 0 ? onHome() : setIndex((value) => value - 1))} className="secondary-button focus-ring"><ArrowLeft size={17} /> {index === 0 ? 'All surveys' : 'Previous'}</button>
            <button type="button" onClick={next} disabled={!selected} className="primary-button focus-ring" style={{ backgroundColor: survey.color }}>{isLast ? 'See my result' : 'Next question'} <ArrowRight size={17} /></button>
          </div>
        </section>
        <p className="mx-auto mt-5 max-w-[680px] text-center text-xs leading-5 text-slate-500">{respondent === 'human' ? 'Choose what feels most like you. There are no correct answers.' : 'Choose the answer your persona agent predicts for you. The visible question and choices are identical to the Human run.'}</p>
      </div>
    </Shell>
  );
}

function CategoryProfile({ result, survey }: { result: CategoryResult; survey: SurveyDefinition }) {
  const entries = Object.entries(result.scores) as Array<[keyof typeof categoryMeta, number]>;
  return <div className="mt-8 space-y-4">{entries.map(([key, value]) => <div key={key}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-bold text-slate-600"><span>{categoryMeta[key].name.replace('The ', '')}</span><span>{value} / 5</span></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(value / 5) * 100}%`, backgroundColor: survey.color }} /></div></div>)}</div>;
}

function DialProfile({ result, survey, compact = false }: { result: DialResult; survey: SurveyDefinition; compact?: boolean }) {
  return <div className={`mt-7 ${compact ? 'space-y-4' : 'grid gap-4 sm:grid-cols-2'}`}>{result.values.map((item) => <div key={item.id} className="dial-card"><div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[0.11em] text-slate-500">{item.dimension}</p><span className="rounded-full px-2.5 py-1 text-xs font-black" style={{ backgroundColor: survey.pale, color: survey.ink }}>{item.value} / 5</span></div><div className="mt-4 flex gap-1.5" aria-label={`${item.value} out of 5`}>{[1, 2, 3, 4, 5].map((number) => <span key={number} className="h-2 flex-1 rounded-full" style={{ backgroundColor: number <= item.value ? survey.color : '#e8eaf0' }} />)}</div><p className="mt-3 text-sm font-bold text-slate-800">{item.label}</p></div>)}</div>;
}

function SillyProfile({ result, survey, compact = false }: { result: SillyResult; survey: SurveyDefinition; compact?: boolean }) {
  return <div className="mt-7 space-y-5">{axisMeta.map((axis, index) => <div key={axis.key}><div className="mb-2 flex items-center justify-between gap-4 text-xs font-bold text-slate-600"><span>{axis.low}</span><span>{axis.high}</span></div><div className="relative h-3 rounded-full bg-slate-100"><span className="absolute left-1/2 top-[-3px] h-[18px] w-px bg-slate-300" /><span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow" style={{ left: `${result.scores[index]}%`, backgroundColor: survey.color }} /></div>{!compact && <p className="mt-2 text-center text-xs font-bold" style={{ color: survey.ink }}>{result.scores[index]}% toward {axis.high}</p>}</div>)}</div>;
}

function ResultVisual({ result, survey, compact = false }: { result: SurveyResult; survey: SurveyDefinition; compact?: boolean }) {
  if (result.kind === 'categorical') return <CategoryProfile result={result} survey={survey} />;
  if (result.kind === 'scale') return <DialProfile result={result} survey={survey} compact={compact} />;
  return <SillyProfile result={result} survey={survey} compact={compact} />;
}

function ResultView({ survey, respondent, run, otherComplete, onCompare, onOther, onRetake, onHome }: { survey: SurveyDefinition; respondent: Respondent; run: StoredRun; otherComplete: boolean; onCompare: () => void; onOther: () => void; onRetake: () => void; onHome: () => void }) {
  const result = scoreSurvey(survey, run.answers);
  const meta = respondentMeta[respondent];
  const other = respondent === 'human' ? respondentMeta.persona : respondentMeta.human;
  return (
    <Shell onHome={onHome}>
      <div className="result-stage" style={{ '--survey': survey.color, '--pale': survey.pale, '--ink': survey.ink } as React.CSSProperties}>
        <section className="result-hero"><div className="result-spark spark-a" aria-hidden="true">✦</div><div className="result-spark spark-b" aria-hidden="true">●</div><div className="relative z-10"><div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/80 bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.13em] text-slate-600 shadow-sm"><meta.Icon size={15} /> {meta.label} result - {survey.shortTitle}</div><p className="mt-8 text-center text-xs font-black uppercase tracking-[0.16em]" style={{ color: survey.ink }}>{result.kind === 'silly' ? result.code : 'Your strongest signal'}</p><h1 className="font-display mx-auto mt-3 max-w-[850px] text-center text-[clamp(2.7rem,7vw,6.3rem)] font-black leading-[0.9] tracking-[-0.065em] text-slate-950">{result.title}</h1>{'description' in result && <p className="mx-auto mt-6 max-w-[620px] text-center text-base leading-7 text-slate-600 sm:text-lg">{result.description}</p>}</div></section>
        <section className="mx-auto mt-7 max-w-[900px] rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm sm:p-9"><div className="flex items-start justify-between gap-5"><div><p className="section-kicker">Result detail</p><h2 className="font-display mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950">{result.kind === 'silly' ? 'Your four silly axes' : result.kind === 'scale' ? 'Your five personal dials' : 'How your choices stacked up'}</h2></div><span className="hidden rounded-xl px-3 py-2 text-xs font-bold sm:block" style={{ backgroundColor: survey.pale, color: survey.ink }}>{survey.questions.length} answers</span></div><ResultVisual result={result} survey={survey} /></section>
        <section className="mx-auto mt-6 max-w-[900px] rounded-[28px] bg-slate-950 p-6 text-white sm:flex sm:items-center sm:justify-between sm:p-8"><div className="max-w-[560px]"><p className="text-xs font-black uppercase tracking-[0.15em] text-slate-400">Next stage</p><h2 className="font-display mt-2 text-2xl font-black tracking-[-0.035em]">{otherComplete ? 'Your comparison is ready' : `Complete the ${other.label} run`}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{otherComplete ? 'See the overall similarity and every question where the two answers differed.' : `This result stays saved. The comparison unlocks after the ${other.label} answers the same survey.`}</p></div><button type="button" onClick={otherComplete ? onCompare : onOther} className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-slate-950 transition hover:-translate-y-0.5 sm:ml-8 sm:mt-0 focus-ring">{otherComplete ? <UsersRound size={18} /> : <other.Icon size={18} />}{otherComplete ? 'Compare results' : other.action}<ArrowRight size={17} /></button></section>
        <div className="mx-auto mt-7 flex max-w-[900px] flex-wrap items-center justify-center gap-3 pb-14"><button type="button" onClick={onHome} className="secondary-button focus-ring"><Home size={16} /> All surveys</button><button type="button" onClick={onRetake} className="secondary-button focus-ring"><RotateCcw size={16} /> Retake this run</button></div>
      </div>
    </Shell>
  );
}

function MiniResult({ survey, respondent, result }: { survey: SurveyDefinition; respondent: Respondent; result: SurveyResult }) {
  const meta = respondentMeta[respondent];
  return <div className="comparison-result-card"><div className="flex items-center gap-3"><span className="run-icon" style={{ backgroundColor: survey.pale, color: survey.ink }}><meta.Icon size={18} /></span><div><p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{meta.label}</p><h3 className="font-display text-xl font-black tracking-[-0.03em] text-slate-950">{result.title}</h3></div></div>{'description' in result && <p className="mt-4 text-sm leading-6 text-slate-600">{result.description}</p>}<ResultVisual result={result} survey={survey} compact /></div>;
}

function ComparisonView({ survey, human, persona, onResult, onHome }: { survey: SurveyDefinition; human: StoredRun; persona: StoredRun; onResult: (respondent: Respondent) => void; onHome: () => void }) {
  const comparison = compareSurvey(survey, human.answers, persona.answers);
  const humanResult = scoreSurvey(survey, human.answers);
  const personaResult = scoreSurvey(survey, persona.answers);
  const exactSentence = comparison.exactMatches === survey.questions.length ? 'Every answer matched.' : `${comparison.exactMatches} of ${survey.questions.length} answers matched exactly.`;
  return (
    <Shell onHome={onHome}>
      <div className="comparison-stage" style={{ '--survey': survey.color, '--pale': survey.pale, '--ink': survey.ink } as React.CSSProperties}>
        <section className="comparison-hero"><div className="comparison-label"><ClipboardCheck size={15} /> {survey.shortTitle} comparison</div><div className="similarity-ring" style={{ '--score': `${Math.round(comparison.similarity * 100) * 3.6}deg`, '--survey': survey.color } as React.CSSProperties}><div><span>{percent(comparison.similarity)}</span><small>similarity</small></div></div><h1 className="font-display mt-6 text-center text-[clamp(2.5rem,6vw,5.6rem)] font-black leading-[0.92] tracking-[-0.06em] text-slate-950">Human meets persona</h1><p className="mx-auto mt-5 max-w-[660px] text-center text-base leading-7 text-slate-600">{exactSentence} {survey.kind === 'scale' ? 'The headline score gives partial credit when ratings are close.' : 'The headline score uses exact question matches.'}</p><div className="mt-7 flex flex-wrap justify-center gap-3"><span className="metric-chip"><strong>{comparison.exactMatches}</strong> exact matches</span><span className="metric-chip"><strong>{comparison.differences.length}</strong> differences</span>{comparison.withinOne !== undefined && <span className="metric-chip"><strong>{comparison.withinOne}</strong> within one point</span>}{comparison.profileSimilarity !== undefined && <span className="metric-chip"><strong>{percent(comparison.profileSimilarity)}</strong> profile similarity</span>}</div></section>
        <section className="mx-auto mt-10 grid max-w-[1080px] gap-5 lg:grid-cols-2"><MiniResult survey={survey} respondent="human" result={humanResult} /><MiniResult survey={survey} respondent="persona" result={personaResult} /></section>
        <section className="mx-auto mt-8 max-w-[1080px] rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm sm:p-9"><div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end"><div><p className="section-kicker">Question-level audit</p><h2 className="font-display mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">Where the answers differed</h2></div><p className="text-sm text-slate-500">{comparison.differences.length} {comparison.differences.length === 1 ? 'question' : 'questions'}</p></div>
          {comparison.differences.length === 0 ? <div className="empty-match"><CheckCircle2 size={34} style={{ color: survey.color }} /><h3 className="font-display mt-4 text-2xl font-black text-slate-950">A perfect match</h3><p className="mt-2 text-sm leading-6 text-slate-600">The Human and Persona runs selected the same answer for every question in this survey.</p></div> : <div className="divide-y divide-slate-200">{comparison.differences.map((difference, index) => <article key={difference.question.id} className="difference-row"><div className="difference-number">{index + 1}</div><div className="min-w-0 flex-1"><h3 className="font-display text-lg font-black leading-6 text-slate-950">{difference.question.prompt}</h3><div className="mt-4 grid gap-3 md:grid-cols-2"><div className="answer-quote human-quote"><span><UserRound size={14} /> Human</span><p>{difference.humanAnswer}</p></div><div className="answer-quote persona-quote"><span><Bot size={14} /> Persona</span><p>{difference.personaAnswer}</p></div></div>{difference.distance !== undefined && <p className="mt-3 text-xs font-bold text-slate-500">Scale distance: {difference.distance} {difference.distance === 1 ? 'point' : 'points'}</p>}</div></article>)}</div>}
        </section>
        <section className="mx-auto mt-6 max-w-[1080px] rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950 sm:flex sm:items-start sm:gap-4 sm:p-6"><Info className="mb-3 shrink-0 text-amber-700 sm:mb-0" size={20} /><p><strong>How to read this:</strong> Similarity describes agreement on this survey, not a universal accuracy score. A named type can match even when individual answers differ, so the question list is the more useful diagnostic.</p></section>
        <div className="mx-auto flex max-w-[1080px] flex-wrap justify-center gap-3 pb-16 pt-8"><button type="button" onClick={onHome} className="primary-button bg-slate-950 focus-ring"><Home size={17} /> All surveys</button><button type="button" onClick={() => onResult('human')} className="secondary-button focus-ring"><UserRound size={16} /> Human result</button><button type="button" onClick={() => onResult('persona')} className="secondary-button focus-ring"><Bot size={16} /> Persona result</button></div>
      </div>
    </Shell>
  );
}

function LicenseView({ onHome }: { onHome: () => void }) {
  return (
    <Shell onHome={onHome}>
      <article className="prose-card"><button type="button" onClick={onHome} className="secondary-button focus-ring"><ArrowLeft size={16} /> All surveys</button><p className="section-kicker mt-10">Sources and license</p><h1 className="font-display mt-2 text-4xl font-black tracking-[-0.045em] text-slate-950 sm:text-5xl">A playful remix, with credit</h1><p className="mt-6 text-base leading-7 text-slate-600">The 28-question Internet Creature Index adapts the open-source Silly Big Type Indicator repository. It uses the repository&apos;s question bank, four-axis scoring method, and 16 type names under the MIT License. It is not the official sbti.ai experience.</p><p className="mt-4 text-base leading-7 text-slate-600">The three five-question surveys and all comparison mechanics were created for Mirror Match. Every section is for entertainment and self-reflection only. None is a scientific diagnosis or a suitability assessment.</p><a className="mt-6 inline-flex items-center gap-2 text-sm font-black text-pink-700 underline underline-offset-4" href="https://github.com/SillyBigTypeIndicator/SBTI" target="_blank" rel="noreferrer">View the source repository <ArrowRight size={15} /></a>
        <div className="mt-10 rounded-2xl bg-slate-950 p-6 font-mono text-xs leading-6 text-slate-300 sm:p-8"><p className="text-white">MIT License</p><p className="mt-4">Copyright (c) 2026 Silly Big Type Indicator contributors</p><p className="mt-4">Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the &quot;Software&quot;), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:</p><p className="mt-4">The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.</p><p className="mt-4">THE SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.</p></div></article>
    </Shell>
  );
}

export default function HomePage() {
  const [store, setStore] = useState<Store>({});
  const [view, setView] = useState<View>({ name: 'home' });
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) setStore(JSON.parse(saved) as Store);
      } catch {
        // A blocked or malformed local store should not block the survey.
      }
      setHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => { if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }, [store, hydrated]);
  const activeSurvey = useMemo(() => ('surveyId' in view ? surveyById[view.surveyId] : undefined), [view]);
  function openRun(surveyId: SurveyId, respondent: Respondent) { const run = store[surveyId]?.[respondent]; setView(run?.completedAt ? { name: 'result', surveyId, respondent } : { name: 'quiz', surveyId, respondent }); window.scrollTo({ top: 0 }); }
  function saveAnswer(surveyId: SurveyId, respondent: Respondent, questionId: string, optionId: string) { setStore((current) => ({ ...current, [surveyId]: { ...current[surveyId], [respondent]: { answers: { ...current[surveyId]?.[respondent]?.answers, [questionId]: optionId } } } })); }
  function complete(surveyId: SurveyId, respondent: Respondent) { setStore((current) => ({ ...current, [surveyId]: { ...current[surveyId], [respondent]: { answers: current[surveyId]?.[respondent]?.answers ?? {}, completedAt: new Date().toISOString() } } })); setView({ name: 'result', surveyId, respondent }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function retake(surveyId: SurveyId, respondent: Respondent) { if (!window.confirm(`Retake the ${respondentMeta[respondent].label} run? Its saved answers for this survey will be replaced.`)) return; setStore((current) => ({ ...current, [surveyId]: { ...current[surveyId], [respondent]: { answers: {} } } })); setView({ name: 'quiz', surveyId, respondent }); window.scrollTo({ top: 0 }); }
  function goHome() { setView({ name: 'home' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  if (!hydrated) return <div className="min-h-screen bg-[#f8f7f4]" />;
  if (view.name === 'home') return <HomeView store={store} onOpen={openRun} onCompare={(surveyId) => setView({ name: 'comparison', surveyId })} onLicense={() => setView({ name: 'license' })} />;
  if (view.name === 'license') return <LicenseView onHome={goHome} />;
  if (!activeSurvey) return null;
  if (view.name === 'quiz') { const run = store[view.surveyId]?.[view.respondent] ?? { answers: {} }; return <QuizView key={`${view.surveyId}-${view.respondent}`} survey={activeSurvey} respondent={view.respondent} run={run} onSaveAnswer={(questionId, optionId) => saveAnswer(view.surveyId, view.respondent, questionId, optionId)} onComplete={() => complete(view.surveyId, view.respondent)} onHome={goHome} />; }
  if (view.name === 'result') { const run = completedRun(store, view.surveyId, view.respondent); if (!run) return <QuizView key={`${view.surveyId}-${view.respondent}`} survey={activeSurvey} respondent={view.respondent} run={store[view.surveyId]?.[view.respondent] ?? { answers: {} }} onSaveAnswer={(questionId, optionId) => saveAnswer(view.surveyId, view.respondent, questionId, optionId)} onComplete={() => complete(view.surveyId, view.respondent)} onHome={goHome} />; const otherRespondent: Respondent = view.respondent === 'human' ? 'persona' : 'human'; return <ResultView survey={activeSurvey} respondent={view.respondent} run={run} otherComplete={Boolean(completedRun(store, view.surveyId, otherRespondent))} onCompare={() => setView({ name: 'comparison', surveyId: view.surveyId })} onOther={() => openRun(view.surveyId, otherRespondent)} onRetake={() => retake(view.surveyId, view.respondent)} onHome={goHome} />; }
  const human = completedRun(store, view.surveyId, 'human'); const persona = completedRun(store, view.surveyId, 'persona');
  if (!human || !persona) return <HomeView store={store} onOpen={openRun} onCompare={(surveyId) => setView({ name: 'comparison', surveyId })} onLicense={() => setView({ name: 'license' })} />;
  return <ComparisonView survey={activeSurvey} human={human} persona={persona} onResult={(respondent) => setView({ name: 'result', surveyId: view.surveyId, respondent })} onHome={goHome} />;
}
