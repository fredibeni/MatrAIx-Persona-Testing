import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  activeAgentDraft,
  backfillSurveyStorePersonaAgent,
  bindPendingAgentRuns,
  completedAgentRuns,
  convergenceNarrative,
  convergencePoints,
  loadStoredSurveyData,
  mergeSurveyStores,
  parseStoredSurveyData,
  serializeSurveyData,
} from '../lib/history.ts';
import { compareSurvey, scoreSurvey } from '../lib/scoring.ts';
import { surveyById, surveys } from '../lib/surveys.ts';
import {
  buildValidationSidebarState,
  isValidationHostLayoutMessage,
  isValidationNavigateMessage,
  isValidationRequestStateMessage,
  isValidationRunAgentBatchMessage,
  validationStateMessage,
} from '../lib/validation-bridge.ts';
import {
  parseValidationAgentResult,
  runValidationAgentSurvey,
  VALIDATION_AGENT_ENDPOINT,
} from '../lib/validation-agent.ts';
import {
  aggregateValidationExperiment,
  aggregateValidationTrends,
  validationExperimentOptions,
  validationExperimentWarning,
} from '../lib/validation-results.ts';
import {
  browserMigrationCandidate,
  diskStateAcceptsBrowserMigration,
  loadValidationDiskState,
  parseValidationDiskState,
  saveValidationDiskState,
  saveValidationDiskStateWithRetry,
  VALIDATION_STATE_ENDPOINT,
  ValidationPersistenceError,
} from '../lib/validation-persistence.ts';

function answersFor(survey, optionIndex) {
  return Object.fromEntries(
    survey.questions.map((question) => [
      question.id,
      question.options[optionIndex].id,
    ]),
  );
}

const alfredPersona = {
  contextId: 'persona-context-1',
  personaId: 'persona_alfred',
  displayName: 'Alfred',
  baselineSha256: 'abc123',
  revisionSha256: 'revision-alfred-1',
};
const secondPersona = {
  contextId: 'persona-context-2',
  personaId: 'persona_second',
  displayName: 'Second',
  baselineSha256: 'def456',
  revisionSha256: 'revision-second-1',
};

assert.deepEqual(
  surveys.map((survey) => survey.questions.length),
  [5, 5, 5, 28],
  'the four surveys must remain independent and complete',
);
assert.deepEqual(
  surveys.map(({ color, pale, ink }) => ({ color, pale, ink })),
  Array.from({ length: surveys.length }, () => ({
    color: 'var(--validation-survey-accent)',
    pale: 'var(--validation-survey-soft)',
    ink: 'var(--validation-survey-ink)',
  })),
  'all validation surveys must use the standard MatrAIx palette',
);

const validationManifest = JSON.parse(
  readFileSync(
    new URL(
      '../matraix/personal-persona/survey/validation-surveys.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
assert.deepEqual(
  validationManifest,
  {
    version: 1,
    surveys: Object.fromEntries(
      surveys.map(({ id, title, questions }) => [
        id,
        {
          id,
          title,
          questions: questions.map(({ id: questionId, prompt, options }) => ({
            id: questionId,
            prompt,
            options: options.map(({ id: optionId, label }) => ({
              id: optionId,
              label,
            })),
          })),
        },
      ]),
    ),
  },
  'the browser and isolated Agent endpoint must use the same survey manifest',
);

const validationPageSource = readFileSync(
  new URL('../app/page.tsx', import.meta.url),
  'utf8',
);
const validationStylesSource = readFileSync(
  new URL('../app/globals.css', import.meta.url),
  'utf8',
);
const updatePersonaStylesSource = readFileSync(
  new URL('../matraix/personal-persona/survey/styles.css', import.meta.url),
  'utf8',
);
const surveyCardStart = validationPageSource.indexOf('function SurveyCard(');
const surveyCardEnd = validationPageSource.indexOf(
  'function QuestionAggregateRow(',
  surveyCardStart,
);
const surveyCardSource = validationPageSource.slice(
  surveyCardStart,
  surveyCardEnd,
);
assert.match(
  surveyCardSource,
  /<div className="survey-card-header">\s*<h2 className="survey-title[^"]*"[\s\S]*?<\/h2>\s*<button[\s\S]*?className="run-row survey-human-run focus-ring"[\s\S]*?<\/button>\s*<\/div>\s*<p className="survey-description/,
  'each Human benchmark control must share the survey title row',
);
const surveyCardHeaderRule = validationStylesSource.match(
  /(?:^|\n)\.survey-card-header\s*\{([^}]*)\}/,
);
assert.match(
  surveyCardHeaderRule?.[1] ?? '',
  /display:\s*flex;/,
  'the survey header must lay out its title and benchmark control side by side',
);
assert.match(
  surveyCardHeaderRule?.[1] ?? '',
  /justify-content:\s*space-between;/,
  'the Human benchmark control must align to the right of the survey title',
);
const surveyHumanRunRule = validationStylesSource.match(
  /(?:^|\n)\.survey-human-run\s*\{([^}]*)\}/,
);
assert.match(
  surveyHumanRunRule?.[1] ?? '',
  /width:\s*fit-content;/,
  'the Human benchmark control must use its content width on wide layouts',
);
assert.match(
  surveyCardSource,
  /className="survey-human-run-label">Human benchmark<\/span>/,
  'the Human benchmark control must retain a compact text label',
);
assert.doesNotMatch(
  surveyCardSource,
  /className="run-icon"/,
  'the compact Human benchmark control must not include a person icon',
);
assert.match(
  validationStylesSource,
  /@media \(max-width: 780px\) \{[\s\S]*?\.survey-card-header\s*\{[\s\S]*?flex-direction:\s*column;[\s\S]*?\}[\s\S]*?\.survey-human-run\s*\{[\s\S]*?align-self:\s*flex-start;[\s\S]*?\}/,
  'compact survey cards must retain a tight Human benchmark control',
);
const quizViewStart = validationPageSource.indexOf('function QuizView(');
const quizViewEnd = validationPageSource.indexOf(
  'function CategoryProfile(',
  quizViewStart,
);
assert.ok(
  quizViewStart >= 0 && quizViewEnd > quizViewStart,
  'the validation quiz view must remain discoverable for navigation checks',
);
const quizViewSource = validationPageSource.slice(quizViewStart, quizViewEnd);
assert.doesNotMatch(
  quizViewSource,
  />\s*Results\s*</,
  'mid-survey question pages must not render a Results button',
);
assert.doesNotMatch(
  quizViewSource,
  /These answers become the fixed benchmark/,
  'survey question pages must not render the removed fixed-benchmark note',
);
assert.match(
  quizViewSource,
  /<div className="question-progress-copy">[\s\S]*?<strong>[\s\S]*?Question \{index \+ 1\} of \{survey\.questions\.length\}[\s\S]*?<\/strong>[\s\S]*?<\/div>/,
  'validation question progress must reuse the Update persona progress label structure',
);
assert.match(
  quizViewSource,
  /className="question-progress-track"[\s\S]*?role="progressbar"[\s\S]*?aria-label="Question progress in this survey"[\s\S]*?aria-valuemin=\{1\}[\s\S]*?aria-valuemax=\{survey\.questions\.length\}[\s\S]*?aria-valuenow=\{index \+ 1\}/,
  'validation question progress must expose the current question through a progressbar',
);
assert.match(
  quizViewSource,
  /className="question-progress-bar"[\s\S]*?style=\{\{ width: `\$\{progress\}%` \}\}/,
  'validation question progress must reuse the Update persona progress bar structure',
);
assert.doesNotMatch(
  quizViewSource,
  /className="validation-question-count"/,
  'validation question pages must not show the old right-aligned question counter',
);
assert.doesNotMatch(
  quizViewSource,
  /className="progress-track"/,
  'validation question pages must not use the old progress track',
);
const quizToplineStart = quizViewSource.indexOf('className="quiz-topline"');
const questionProgressStart = quizViewSource.indexOf(
  'className="question-progress-copy"',
);
const questionCardStart = quizViewSource.indexOf('className="question-card"');
function matchingDivClose(source, openingIndex) {
  const tagPattern = /<div\b[^>]*\/?\s*>|<\/div>/g;
  tagPattern.lastIndex = openingIndex;
  let depth = 0;
  for (const match of source.matchAll(tagPattern)) {
    const tag = match[0];
    if (tag.startsWith('</div')) depth -= 1;
    else if (!tag.match(/\/\s*>$/)) depth += 1;
    if (depth === 0) return match.index + tag.length;
  }
  return -1;
}
const quizToplineOpenStart = quizViewSource.lastIndexOf(
  '<div',
  quizToplineStart,
);
const quizToplineEnd = matchingDivClose(quizViewSource, quizToplineOpenStart);
const questionProgressOpenStart = quizViewSource.lastIndexOf(
  '<div',
  questionProgressStart,
);
const questionProgressEnd = matchingDivClose(
  quizViewSource,
  questionProgressOpenStart,
);
const questionProgressTrackStart = quizViewSource.indexOf(
  'className="question-progress-track"',
);
const questionProgressTrackOpenStart = quizViewSource.lastIndexOf(
  '<div',
  questionProgressTrackStart,
);
assert.ok(
  quizToplineOpenStart >= 0 &&
    quizToplineEnd > quizToplineOpenStart &&
    questionProgressOpenStart > quizToplineEnd &&
    quizViewSource.slice(quizToplineEnd, questionProgressOpenStart).trim() ===
      '' &&
    questionProgressEnd > questionProgressOpenStart &&
    questionProgressTrackOpenStart > questionProgressEnd &&
    quizViewSource
      .slice(questionProgressEnd, questionProgressTrackOpenStart)
      .trim() === '' &&
    questionCardStart > questionProgressStart,
  'validation question progress label and track must be direct quiz-stage children below the quiz context',
);
assert.match(
  quizViewSource,
  /const progress = \(\(index \+ 1\) \/ survey\.questions\.length\) \* 100;/,
  'validation question progress must use the current one-based question ratio',
);

function cssDeclarations(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = source.match(
    new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([^}]*)\\}`),
  );
  assert.ok(rule, `${selector} must have a CSS rule`);
  return Object.fromEntries(
    rule[1]
      .split(';')
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separator = declaration.indexOf(':');
        return [
          declaration.slice(0, separator).trim(),
          declaration.slice(separator + 1).trim(),
        ];
      }),
  );
}
for (const [selector, properties] of Object.entries({
  '.question-progress-copy': [
    'display',
    'align-items',
    'justify-content',
    'margin-top',
    'font-size',
  ],
  '.question-progress-copy strong': ['font-weight'],
  '.question-progress-track': [
    'height',
    'margin-top',
    'overflow',
    'border-radius',
  ],
  '.question-progress-bar': ['height', 'border-radius', 'transition'],
})) {
  const validationDeclarations = cssDeclarations(
    validationStylesSource,
    selector,
  );
  const updatePersonaDeclarations = cssDeclarations(
    updatePersonaStylesSource,
    selector,
  );
  for (const property of properties) {
    assert.equal(
      validationDeclarations[property],
      updatePersonaDeclarations[property],
      `${selector} ${property} must match Update persona`,
    );
  }
}
assert.equal(
  cssDeclarations(validationStylesSource, '.question-progress-copy')[
    'line-height'
  ],
  'normal',
  'the validation root reset must not change the reference label height',
);
assert.deepEqual(
  {
    copy: cssDeclarations(
      validationStylesSource,
      '.validation-embedded .question-progress-copy',
    ).color,
    strong: cssDeclarations(
      validationStylesSource,
      '.validation-embedded .question-progress-copy strong',
    ).color,
    track: cssDeclarations(
      validationStylesSource,
      '.validation-embedded .question-progress-track',
    ).background,
    bar: cssDeclarations(
      validationStylesSource,
      '.validation-embedded .question-progress-bar',
    ).background,
  },
  {
    copy: 'var(--validation-muted)',
    strong: 'var(--validation-ink)',
    track: 'var(--validation-hover)',
    bar: 'var(--validation-gold)',
  },
  'embedded validation progress must map to the matching host theme colors',
);
assert.match(
  quizViewSource,
  /<section className="question-card" data-question-id=\{question\.id\}>\s*<div className="question-heading">[\s\S]*?<h1[\s\S]*?className="validation-question-title outline-none"[\s\S]*?<fieldset\s*className=\{`validation-answer-list/,
  'validation questions must reuse the Update persona card, heading, and answer-list structure',
);
assert.doesNotMatch(
  quizViewSource,
  /(?:mt-8|space-y-3)/,
  'validation answer spacing must come from the shared question layout instead of Tailwind margins',
);
const updateQuestionCard = cssDeclarations(
  updatePersonaStylesSource,
  '.question-card',
);
const updateQuestionDataCard = cssDeclarations(
  updatePersonaStylesSource,
  '.question-card[data-question-id]',
);
const validationQuestionDataCard = cssDeclarations(
  validationStylesSource,
  '.question-card[data-question-id]',
);
const embeddedValidationQuestionCard = cssDeclarations(
  validationStylesSource,
  '.validation-embedded .question-card',
);
assert.deepEqual(
  {
    padding: validationQuestionDataCard.padding,
    border: validationQuestionDataCard.border,
    background: validationQuestionDataCard.background,
    shadow: validationQuestionDataCard['box-shadow'],
  },
  {
    padding: updateQuestionCard.padding,
    border: updateQuestionDataCard.border,
    background: updateQuestionDataCard.background,
    shadow: updateQuestionDataCard['box-shadow'],
  },
  'validation question cards must match the Update persona inset and unboxed surface',
);
assert.equal(
  embeddedValidationQuestionCard.padding,
  updateQuestionCard.padding,
  'embedded validation question cards must retain the Update persona inset',
);
assert.equal(
  embeddedValidationQuestionCard['border-radius'],
  '18px',
  'embedded validation question cards must retain the Update persona radius',
);
const updateQuestionTitle = cssDeclarations(
  updatePersonaStylesSource,
  '.question-title',
);
const validationQuestionTitle = cssDeclarations(
  validationStylesSource,
  '.validation-question-title',
);
for (const property of ['margin', 'font-size', 'font-weight', 'line-height']) {
  assert.equal(
    validationQuestionTitle[property],
    updateQuestionTitle[property],
    `validation question title ${property} must match Update persona`,
  );
}
assert.equal(
  validationQuestionTitle['max-width'],
  updateQuestionTitle['max-width'],
  'validation question titles must use the same available width as Update persona',
);
assert.equal(
  cssDeclarations(
    validationStylesSource,
    '.validation-embedded .validation-question-title',
  )['font-size'],
  '20px !important',
  'the embedded theme must not shrink validation question titles',
);
assert.equal(
  cssDeclarations(validationStylesSource, '.question-heading')['margin-bottom'],
  cssDeclarations(updatePersonaStylesSource, '.question-heading')[
    'margin-bottom'
  ],
  'validation question headings must use the Update persona answer separation',
);
assert.deepEqual(
  cssDeclarations(
    validationStylesSource,
    '.validation-answer-list:not(.scale-options)',
  ),
  cssDeclarations(updatePersonaStylesSource, '.choice-list'),
  'categorical validation answers must use the Update persona grid spacing',
);
const updateChoiceOption = cssDeclarations(
  updatePersonaStylesSource,
  '.choice-option',
);
const validationAnswerOption = cssDeclarations(
  validationStylesSource,
  '.answer-option',
);
for (const property of [
  'display',
  'align-items',
  'gap',
  'min-height',
  'padding',
  'border',
  'border-radius',
  'font-size',
]) {
  assert.equal(
    validationAnswerOption[property],
    updateChoiceOption[property],
    `validation answer option ${property} must match Update persona`,
  );
}
assert.deepEqual(
  {
    width: cssDeclarations(validationStylesSource, '.option-radio').width,
    height: cssDeclarations(validationStylesSource, '.option-radio').height,
    border: cssDeclarations(validationStylesSource, '.option-radio').border,
    background: cssDeclarations(validationStylesSource, '.option-radio')
      .background,
  },
  {
    width: '13px',
    height: '13px',
    border: '1px solid #94a3b8',
    background: 'transparent',
  },
  'validation radio markers must match the Update persona control size and outline treatment',
);
assert.equal(
  cssDeclarations(validationStylesSource, '.scale-options').gap,
  cssDeclarations(updatePersonaStylesSource, '.likert').gap,
  'validation scale questions must use the Update persona option spacing',
);
const validationScaleOption = cssDeclarations(
  validationStylesSource,
  '.scale-option',
);
const updateLikertOption = cssDeclarations(
  updatePersonaStylesSource,
  '.likert-option label',
);
for (const property of [
  'display',
  'grid-template-rows',
  'align-items',
  'justify-items',
  'min-height',
  'padding',
  'border-radius',
  'font-size',
  'line-height',
  'text-align',
]) {
  assert.equal(
    validationScaleOption[property],
    updateLikertOption[property],
    `validation scale option ${property} must match Update persona`,
  );
}
const validationScaleKey = cssDeclarations(
  validationStylesSource,
  '.scale-option .option-key',
);
const updateLikertKey = cssDeclarations(
  updatePersonaStylesSource,
  '.likert-option label strong',
);
for (const property of ['display', 'margin', 'font-size', 'line-height']) {
  assert.equal(
    validationScaleKey[property],
    updateLikertKey[property],
    `validation scale number ${property} must match Update persona`,
  );
}
assert.equal(
  validationScaleKey['font-weight'],
  '400',
  'validation scale numbers must use the effective Update persona weight',
);
assert.match(
  validationStylesSource,
  /@media \(max-width: 920px\) \{[\s\S]*?\.scale-option \{\s*display: flex;\s*min-height: 42px;\s*align-items: center;\s*justify-content: flex-start;\s*gap: 9px;\s*padding: 9px 12px;\s*text-align: left;[\s\S]*?\.scale-option > span:nth-child\(2\) \{\s*align-self: auto;\s*text-align: left;/,
  'validation scale questions must match the Update persona mobile layout',
);
assert.match(
  validationStylesSource,
  /@media \(max-width: 920px\) \{[\s\S]*?\.validation-embedded \.scale-option \{\s*display: flex;\s*min-height: 42px;\s*align-items: center;\s*justify-content: flex-start;\s*gap: 9px;\s*padding: 9px 12px;\s*text-align: left;[\s\S]*?\.validation-embedded \.scale-option > span:nth-child\(2\) \{\s*align-self: auto;\s*text-align: left;/,
  'embedded validation scale questions must retain the Update persona mobile layout',
);
assert.match(
  quizViewSource,
  /onClick=\{\(\) => setIndex\(\(value\) => Math\.max\(0, value - 1\)\)\}[\s\S]*?<ArrowLeft[\s\S]*?Previous/,
  'mid-survey question pages must retain Previous navigation',
);
assert.match(
  quizViewSource,
  /onClick=\{next\}[\s\S]*?\{isLast \? 'Finish this run' : 'Next'\}[\s\S]*?<ArrowRight/,
  'mid-survey question pages must retain Next and final-question completion navigation',
);

const selectOptionStart = quizViewSource.indexOf('function selectOption(');
const selectOptionEnd = quizViewSource.indexOf(
  'function next()',
  selectOptionStart,
);
assert.ok(
  selectOptionStart >= 0 && selectOptionEnd > selectOptionStart,
  'the answer-selection handler must remain discoverable',
);
const selectOptionSource = quizViewSource.slice(
  selectOptionStart,
  selectOptionEnd,
);
const saveAnswerStart = selectOptionSource.indexOf(
  'onSaveAnswer(question.id, optionId);',
);
const finalOrDuplicateGuardStart = selectOptionSource.search(
  /if\s*\(\s*(?:isLast\s*\|\|\s*advancingRef\.current|advancingRef\.current\s*\|\|\s*isLast)\s*\)\s*return;/,
);
const advanceLatchStart = selectOptionSource.indexOf(
  'advancingRef.current = true;',
);
const delayedAdvanceStart = selectOptionSource.search(
  /(?:window\.)?setTimeout\(/,
);
const delayedSetIndexStart = selectOptionSource.indexOf(
  'setIndex(',
  delayedAdvanceStart,
);
assert.ok(
  saveAnswerStart >= 0 &&
    finalOrDuplicateGuardStart > saveAnswerStart &&
    advanceLatchStart > finalOrDuplicateGuardStart &&
    delayedAdvanceStart > advanceLatchStart &&
    delayedSetIndexStart > delayedAdvanceStart,
  'saving an answer must guard final and duplicate advances, latch the interaction, and only then schedule the next question',
);
assert.doesNotMatch(
  selectOptionSource.slice(advanceLatchStart, delayedAdvanceStart),
  /setIndex\(/,
  'answer selection must not advance synchronously before the delay',
);
assert.ok(
  finalOrDuplicateGuardStart > saveAnswerStart &&
    finalOrDuplicateGuardStart < delayedAdvanceStart,
  'the final question must save its answer without scheduling an automatic advance',
);
assert.ok(
  finalOrDuplicateGuardStart < advanceLatchStart &&
    advanceLatchStart < delayedAdvanceStart,
  'the advance latch must prevent repeated selections from scheduling duplicate advances',
);
const answerAdvanceDelayMatch = selectOptionSource.match(
  /(?:window\.)?setTimeout\([\s\S]*?,\s*(\d+|[A-Z][A-Z0-9_]*)\s*\);/,
);
assert.ok(
  answerAdvanceDelayMatch,
  'answer selection must schedule its next-question advance with an explicit delay',
);
const answerAdvanceDelayToken = answerAdvanceDelayMatch?.[1] ?? '';
const answerAdvanceDelayConstantMatch = answerAdvanceDelayToken.match(/^\d+$/)
  ? null
  : validationPageSource.match(
      new RegExp(`const\\s+${answerAdvanceDelayToken}\\s*=\\s*(\\d+)`),
    );
const answerAdvanceDelayMs = Number(
  answerAdvanceDelayConstantMatch?.[1] ?? answerAdvanceDelayToken,
);
assert.ok(
  answerAdvanceDelayMs >= 100 && answerAdvanceDelayMs <= 1000,
  'the answer-selection delay must be a short 100 to 1000 millisecond pause',
);
assert.match(
  quizViewSource,
  /const advanceTimerRef = useRef<[^>]+>\([^)]*\);/,
  'the pending answer advance must keep a timer reference for cleanup',
);
assert.match(
  quizViewSource,
  /useEffect\(\(\) => \{[\s\S]*?return \(\) => \{[\s\S]*?(?:window\.)?clearTimeout\(advanceTimerRef\.current\);[\s\S]*?advanceTimerRef\.current = undefined;[\s\S]*?\};[\s\S]*?\}, \[index\]\);/,
  'changing questions or unmounting must clear any pending answer-advance timer',
);
assert.match(
  quizViewSource,
  /onClick=\{\(\) => setIndex\(\(value\) => Math\.max\(0, value - 1\)\)\}[\s\S]*?disabled=\{index === 0 \|\| advancePending\}[\s\S]*?<ArrowLeft[\s\S]*?Previous/,
  'Previous must be disabled while an automatic answer advance is pending',
);
assert.match(
  quizViewSource,
  /onClick=\{next\}[\s\S]*?disabled=\{!selected \|\| advancePending\}[\s\S]*?\{isLast \? 'Finish this run' : 'Next'\}/,
  'Next must be disabled while an automatic answer advance is pending',
);

const resultViewStart = validationPageSource.indexOf('function ResultView(');
assert.match(
  validationPageSource,
  /onClick=\{onLicense\}[\s\S]*?className="quiet-button validation-license-button[^"]*"[\s\S]*?Sources and license/,
  'the Validation Sources and license action must use an exact 14px size',
);
assert.match(
  validationStylesSource,
  /\.validation-embedded \.validation-license-button\s*\{[\s\S]*?font-size:\s*14px !important;/,
  'the embedded Validation Sources and license action must override inherited sizing',
);
const resultViewEnd = validationPageSource.indexOf(
  'function MiniResult(',
  resultViewStart,
);
assert.ok(
  resultViewStart >= 0 && resultViewEnd > resultViewStart,
  'the completed validation result view must remain discoverable',
);
const resultViewSource = validationPageSource.slice(
  resultViewStart,
  resultViewEnd,
);
assert.doesNotMatch(
  resultViewSource,
  /\{survey\.questions\.length\}\s*answers/,
  'completed validation results must not render an answer-count badge',
);
assert.doesNotMatch(
  resultViewSource,
  /How the choices stacked up/,
  'completed validation results must not render the choices-stacked-up heading',
);
assert.doesNotMatch(
  resultViewSource,
  /Strongest signal/i,
  'completed validation results must not render a Strongest signal label',
);
assert.match(
  resultViewSource,
  /<h1 className="[^"]*text-\[20px\][^"]*">\s*\{result\.title\}/,
  'the completed-result title must declare an exact 20px size',
);
assert.doesNotMatch(
  resultViewSource,
  /Persona agent:|survey\.shortTitle/,
  'completed-result heroes must omit persona and survey-name metadata',
);
assert.match(
  resultViewSource,
  /<meta\.Icon size=\{15\} \/>\s*\{isAgent \? `Agent run \$\{agentRun\.sequence\}` : 'Human benchmark'\}/,
  'completed-result heroes must retain only the actor label',
);
const resultDescriptionMatch = resultViewSource.match(
  /<p className="([^"]*)">\s*\{result\.description\}\s*<\/p>/,
);
assert.ok(
  resultDescriptionMatch,
  'the completed-result description must remain discoverable',
);
const resultDescriptionClasses = resultDescriptionMatch?.[1] ?? '';
assert.match(
  resultDescriptionClasses,
  /(?:^|\s)text-\[14px\](?:\s|$)/,
  'the completed-result description must declare an exact 14px size',
);
assert.doesNotMatch(
  resultDescriptionClasses,
  /(?:^|\s)(?:sm|md|lg|xl|2xl):text-[^\s]+/,
  'the completed-result description must remain 14px at every breakpoint without a responsive text-size override',
);
const validationHomeTitleRule = validationStylesSource.match(
  /\.validation-embedded \.hero-grid h1\s*\{([^}]*)\}/,
);
const validationResultTitleRule = validationStylesSource.match(
  /\.validation-embedded \.result-hero h1\s*\{([^}]*)\}/,
);
assert.ok(
  validationHomeTitleRule && validationResultTitleRule,
  'the Validation home and completed-result title rules must remain discoverable',
);
const validationHomeTitleSize = validationHomeTitleRule?.[1].match(
  /font-size:\s*([^;]+);/,
)?.[1];
const validationResultTitleSize = validationResultTitleRule?.[1].match(
  /font-size:\s*([^;]+);/,
)?.[1];
assert.equal(
  validationHomeTitleSize,
  '28px !important',
  'the embedded Validation home title must remain exactly 28px',
);
assert.equal(
  validationResultTitleSize,
  '20px !important',
  'the completed-result title must use the requested exact 20px size',
);
assert.match(
  validationStylesSource,
  /\.validation-embedded \.result-run-label\s*\{[\s\S]*?font-weight:\s*400;[\s\S]*?font-size:\s*10px !important;/,
  'the completed-result actor label must use regular weight at a compact 10px size',
);
assert.doesNotMatch(
  resultViewSource,
  /id="result-detail-heading"|>\s*Result detail\s*<\//,
  'completed-result details must not render a visible Result detail heading',
);
assert.match(
  resultViewSource,
  /<section className="result-hero" aria-label="Result detail">[\s\S]*?<div className="result-detail-content">[\s\S]*?<ResultVisual result=\{result\} survey=\{survey\} \/>/,
  'completed-result details must share the accessible result hero container',
);
assert.doesNotMatch(
  resultViewSource,
  /rounded-\[30px\] bg-white p-6 shadow-sm sm:p-9/,
  'completed-result details must not render a separate outer card',
);
assert.match(
  validationStylesSource,
  /\.validation-embedded \.result-hero\s*\{[\s\S]*?display:\s*block;[\s\S]*?\.validation-embedded \.result-detail-content\s*\{[\s\S]*?margin-top:\s*20px;/,
  'the merged completed-result card must stack profile content below its summary',
);
assert.match(
  validationStylesSource,
  /\.validation-embedded \.result-detail-content,\s*\.validation-embedded \.result-detail-content \*\s*\{[\s\S]*?font-weight:\s*400 !important;/,
  'all text in completed-result details must use regular weight',
);
const validationResultHeroRule = validationStylesSource.match(
  /\.validation-embedded \.result-hero\s*\{([^}]*)\}/,
);
assert.match(
  validationResultHeroRule?.[1] ?? '',
  /padding:\s*20px 22px;/,
  'the simplified completed-result hero must use tighter padding',
);
assert.doesNotMatch(
  resultViewSource,
  /Next stage|primaryTitle|primaryCopy|result-primary-button|onClick=\{onPrimary\}/,
  'completed validation results must not render the aggregate-results Next stage panel or its action',
);
assert.match(
  resultViewSource,
  /onClick=\{onHome\}[\s\S]*?<Home[\s\S]*?Results/,
  'completed validation views must retain their Results navigation',
);
assert.match(
  resultViewSource,
  /onClick=\{onHistory\}[\s\S]*?<History[\s\S]*?Earlier run history/,
  'completed Agent results must retain the conditional Earlier run history control',
);
assert.match(
  resultViewSource,
  /onClick=\{onHumanEdit\}[\s\S]*?<ArrowLeft[\s\S]*?Back[\s\S]*?onClick=\{onHumanChange\}[\s\S]*?<RotateCcw[\s\S]*?Retake/,
  'completed Human results must offer Back before Retake',
);
assert.doesNotMatch(
  resultViewSource,
  /Retake benchmark/,
  'the Human result action must use the shorter Retake label',
);
assert.match(
  validationPageSource,
  /function editHumanBenchmark\(surveyId: SurveyId\)[\s\S]*?completedAt: undefined[\s\S]*?setView\(\{ name: 'quiz', surveyId, actor: 'human', runId: human\.id \}\)/,
  'Back must reopen the completed Human benchmark for editing with its existing answers',
);
assert.match(
  validationStylesSource,
  /\.validation-embedded \.result-action-button\s*\{[\s\S]*?font-weight:\s*400;/,
  'completed-result actions must use regular-weight labels',
);
const resultActionsStart = resultViewSource.indexOf(
  'className="mx-auto mt-7 flex max-w-[900px]',
);
assert.ok(
  resultActionsStart >= 0,
  'the completed-result action row must remain discoverable',
);
const resultActionsSource = resultViewSource.slice(resultActionsStart);
const backActionStart = resultActionsSource.indexOf('onClick={onHumanEdit}');
const retakeActionStart = resultActionsSource.indexOf(
  'onClick={onHumanChange}',
);
const resultsActionStart = resultActionsSource.indexOf('onClick={onHome}');
const historyActionStart = resultActionsSource.indexOf('onClick={onHistory}');
assert.ok(
  backActionStart >= 0 &&
    retakeActionStart > backActionStart &&
    resultsActionStart > retakeActionStart &&
    historyActionStart > resultsActionStart,
  'Human results must render Back and Retake before Results while Agent results keep Results before Earlier run history',
);
assert.match(
  resultActionsSource.slice(resultsActionStart, historyActionStart),
  /isAgent[\s\S]*?hasCompletedHuman/,
  'Earlier run history must remain limited to completed Agent comparisons',
);
const questionDetailsStart = validationPageSource.indexOf(
  '<details className="validation-question-details">',
);
const questionSummaryEnd = validationPageSource.indexOf(
  '</summary>',
  questionDetailsStart,
);
assert.ok(
  questionDetailsStart >= 0 && questionSummaryEnd > questionDetailsStart,
  'each survey result must render its Question results disclosure summary',
);
const questionSummaryMarkup = validationPageSource.slice(
  questionDetailsStart,
  questionSummaryEnd,
);
const questionSummaryLabelStart = questionSummaryMarkup.indexOf(
  'className="validation-question-summary-label"',
);
const questionChevronStart = questionSummaryMarkup.indexOf('<ChevronDown');
const questionResultsTextStart =
  questionSummaryMarkup.indexOf('Question results');
assert.ok(
  questionSummaryLabelStart >= 0 &&
    questionChevronStart > questionSummaryLabelStart &&
    questionResultsTextStart > questionChevronStart,
  'the disclosure chevron must appear inside the summary label before Question results',
);
assert.match(
  questionSummaryMarkup,
  /<ChevronDown[\s\S]*?className="validation-question-chevron"[\s\S]*?aria-hidden="true"[\s\S]*?\/>/,
  'the Question results chevron must be decorative and expose its styling hook',
);
assert.match(
  questionSummaryMarkup,
  /className="validation-question-count"/,
  'the result count must remain a separate badge beside Question results',
);
assert.match(
  validationStylesSource,
  /\.validation-embedded \.validation-question-details summary\s*\{[\s\S]*?justify-content:\s*flex-start;[\s\S]*?\}/,
  'Question results counts must sit immediately after their label rather than at the far edge',
);
assert.match(
  validationStylesSource,
  /\.validation-question-details\[open\][\s\S]*?\.validation-question-chevron\s*\{\s*transform:\s*rotate\(180deg\);\s*\}/,
  'opening Question results must rotate its chevron',
);
assert.match(
  validationPageSource,
  /<p>Starts 10 fresh runs per survey<\/p>/,
  'the Agent validation helper copy must describe the number of runs concisely',
);
assert.equal(
  validationPageSource.match(
    /backgroundColor: survey\.color,\s*color: 'var\(--validation-on-accent\)',/g,
  )?.length,
  2,
  'survey-colored actions and metadata must use the standard on-accent foreground',
);
assert.match(
  validationStylesSource,
  /:root\s*\{[\s\S]*?--validation-survey-accent:\s*#ffd166;[\s\S]*?--validation-survey-soft:\s*#fff1ce;[\s\S]*?--validation-survey-ink:\s*#8a5700;[\s\S]*?--validation-on-accent:\s*#17130a;/,
  'the standalone validation view must use the standard light-theme palette',
);
assert.match(
  validationStylesSource,
  /\.validation-embedded\s*\{[\s\S]*?--validation-survey-accent:\s*var\(--validation-gold\);[\s\S]*?--validation-survey-soft:\s*var\(--validation-gold-soft\);[\s\S]*?--validation-survey-ink:\s*var\(--validation-gold-light\);[\s\S]*?--validation-on-accent:\s*var\(--validation-on-gold\);/,
  'the embedded validation view must map every survey to the standard dark-theme palette',
);
assert.equal(
  cssDeclarations(validationStylesSource, '.compare-button').color,
  'var(--validation-on-accent)',
  'standalone survey-colored buttons must keep an accessible foreground',
);
assert.match(
  validationStylesSource,
  /\.answer-selected \.option-key,\s*\.answer-selected \.option-check\s*\{[\s\S]*?color:\s*var\(--validation-on-accent\);/,
  'selected standalone scale keys must keep an accessible foreground',
);
assert.match(
  validationStylesSource,
  /\.validation-embedded\s+:is\([\s\S]*?\.similarity-ring[\s\S]*?\)\s*\{[\s\S]*?--survey:\s*var\(--validation-survey-accent\) !important;[\s\S]*?--pale:\s*var\(--validation-survey-soft\) !important;[\s\S]*?--ink:\s*var\(--validation-survey-ink\) !important;/,
  'embedded survey components must consume the shared semantic palette',
);
const resultsToolbarRule = validationStylesSource.match(
  /\.validation-embedded \.validation-results-toolbar\s*\{([^}]*)\}/,
);
assert.match(
  resultsToolbarRule?.[1] ?? '',
  /grid-template-columns:\s*max-content minmax\(200px, 220px\);/,
  'the experiment selector must sit directly beside its label with a tight width',
);
assert.match(
  validationStylesSource,
  /@media \(max-width: 780px\) \{[\s\S]*?\.validation-embedded \.validation-results-toolbar\s*\{\s*grid-template-columns:\s*1fr;\s*\}/,
  'the compact experiment toolbar must keep its stacked layout',
);
assert.match(
  validationPageSource,
  /className="validation-experiment-controls"[\s\S]*?id="validation-experiment-selector"[\s\S]*?className="validation-experiment-delete focus-ring"[\s\S]*?>\s*Delete\s*</,
  'the selected validation run must have a Delete control beside its selector',
);
assert.match(
  validationPageSource,
  /Are you sure you want to delete this validation run's results: "\$\{experiment\.label\}"\?/,
  'deleting a validation run must confirm the selected run label',
);
assert.match(
  validationStylesSource,
  /\.validation-embedded \.validation-experiment-controls\s*\{[\s\S]*?display:\s*flex;[\s\S]*?\.validation-embedded \.validation-experiment-delete\s*\{[\s\S]*?min-height:\s*42px;/,
  'the Delete control must stay aligned with the experiment selector',
);
const resultsToolbarStart = validationPageSource.indexOf(
  '<div className="validation-results-toolbar">',
);
const validationTrendsStart = validationPageSource.indexOf(
  '<ValidationTrendSection',
);
const validationTrendChartStart = validationPageSource.indexOf(
  'function ValidationTrendChart(',
);
const validationTrendSectionStart = validationPageSource.indexOf(
  'function ValidationTrendSection(',
);
const validationTrendChartSource = validationPageSource.slice(
  validationTrendChartStart,
  validationTrendSectionStart,
);
const resultsViewStart = validationPageSource.indexOf('function ResultsView(');
const resultsHeroStart = validationPageSource.indexOf(
  '<section className="hero-wrap">',
  resultsViewStart,
);
const resultsContentStart = validationPageSource.indexOf(
  '<section className="mx-auto max-w-[1240px] px-5 pb-20 pt-16 sm:px-8 lg:px-10">',
  resultsHeroStart,
);
const experimentWarningStart = validationPageSource.indexOf(
  'className="validation-experiment-warning"',
);
const overallResultsStart = validationPageSource.indexOf(
  '<section className="validation-overall-results"',
);
const overallResultsEnd = validationPageSource.indexOf(
  '</section>',
  overallResultsStart,
);
assert.ok(resultsToolbarStart >= 0, 'the experiment selector must be rendered');
assert.match(
  validationStylesSource,
  /\.validation-embedded\.validation-save-visible \.hero-wrap\s*\{\s*margin-top:\s*-24px;\s*\}/,
  'the Validation results title must share the saved-status row at the top of the page',
);
assert.ok(
  resultsHeroStart >= 0 &&
    resultsContentStart > resultsHeroStart &&
    validationTrendsStart > resultsContentStart &&
    validationTrendsStart < resultsToolbarStart,
  'the validation history charts must render after the Results hero and before the experiment selector',
);
assert.match(
  validationPageSource,
  /useState<ValidationBenchmarkTrendMode>\('overall'\)/,
  'the benchmark history chart must default to overall benchmark match',
);
assert.match(
  validationPageSource,
  /<option value="overall">Overall benchmark match<\/option>[\s\S]*?<option value="individual">Individual benchmark match<\/option>/,
  'the benchmark history chart must offer overall and individual views',
);
assert.match(
  validationPageSource,
  /id="validation-benchmark-trend-mode"[\s\S]*?aria-label="Benchmark match view"/,
  'the benchmark history selector must have an unambiguous accessible name',
);
assert.match(
  validationPageSource,
  /const allHumanBenchmarksComplete = surveys\.every\([\s\S]*?store\[survey\.id\]\?\.human\?\.completedAt[\s\S]*?\);[\s\S]*?const trendData = allHumanBenchmarksComplete\s*\?\s*aggregateValidationTrends\(store\)\s*:\s*null;/,
  'validation history aggregation must wait for all four completed Human benchmarks',
);
assert.match(
  validationPageSource,
  /hasAllHumanBenchmarks=\{allHumanBenchmarksComplete\}/,
  'the validation history display must receive the Human benchmark completion state',
);
assert.match(
  validationTrendChartSource,
  /const plotVisible = !lockedMessage && allPoints\.length > 0/,
  'locked validation history charts must not render plotted results',
);
assert.match(
  validationPageSource,
  /'Fill in all human benchmarks to see results'/,
  'incomplete validation history charts must explain how to unlock results',
);
assert.equal(
  validationPageSource.match(/lockedMessage=\{lockedMessage\}/g)?.length,
  2,
  'both validation history charts must use the locked completion message',
);
assert.doesNotMatch(
  validationPageSource,
  /<span>View<\/span>/,
  'the benchmark history selector must not render a redundant visible View label',
);
assert.doesNotMatch(
  validationPageSource,
  /<h3>Benchmark match<\/h3>/,
  'the benchmark history selector must replace the redundant Benchmark match title',
);
assert.match(
  validationPageSource,
  /className="validation-trend-title-row"[\s\S]*?className="validation-trend-selector"[\s\S]*?id="validation-benchmark-trend-mode"[\s\S]*?label="About benchmark match"/,
  'the benchmark history selector and explanation control must share the title row',
);
assert.match(
  validationPageSource,
  /surveys\.map\(\(survey, index\) => \(\{[\s\S]*?points: trendData\.surveyBenchmarkMatches\[survey\.id\],[\s\S]*?styleIndex: index/,
  'the individual benchmark view must render all four surveys in canonical order',
);
assert.match(
  validationPageSource,
  /id: 'agent-consistency',[\s\S]*?points: trendData\.agentConsistency/,
  'the right-hand chart must always use the independent Agent consistency series',
);
assert.equal(
  validationPageSource.match(/dimensionValues=\{dimensionValues\}/g)?.length,
  2,
  'both charts must share the same numeric dimension domain',
);
assert.match(
  validationPageSource,
  /\[0, 0\.25, 0\.5, 0\.75, 1\]\.map/,
  'both history charts must keep a fixed zero to one hundred percent Y-axis',
);
assert.match(
  validationPageSource,
  />\s*Number of dimensions filled\s*</,
  'both history charts must label the number of filled dimensions on the X-axis',
);
assert.match(
  validationPageSource,
  /<polyline[\s\S]*?<ValidationTrendMarker/,
  'history charts must retain point markers, including when only one dimension is available',
);
assert.match(
  validationPageSource,
  /const validationTrendSeriesColors = \[[\s\S]*?--validation-trend-series-1[\s\S]*?--validation-trend-series-4/,
  'individual benchmark series must define four distinct chart colours',
);
assert.match(
  validationPageSource,
  /function ValidationTrendMarker[\s\S]*?<circle[\s\S]*?fill=\{validationTrendColor\(styleIndex\)\}/,
  'individual benchmark points must use the series colour with a consistent marker shape',
);
assert.match(
  validationTrendChartSource,
  /stroke=\{validationTrendColor\(item\.styleIndex\)\}/,
  'legend keys and plotted lines must use their series colour',
);
assert.doesNotMatch(
  validationTrendChartSource,
  /strokeDasharray=/,
  'individual benchmark series must use colour rather than dash patterns',
);
assert.doesNotMatch(
  validationPageSource,
  /validationTrendLinePatterns/,
  'validation charts must not retain pattern-based series encoding',
);
assert.match(
  validationTrendChartSource,
  /className="validation-trend-svg"[\s\S]*?Hover or focus a data point for its coordinates/,
  'interactive charts must expose their purpose without hiding the SVG from assistive technology',
);
assert.match(
  validationTrendChartSource,
  /className="validation-trend-point"[\s\S]*?role="graphics-symbol"[\s\S]*?tabIndex=\{0\}[\s\S]*?focusable="true"[\s\S]*?aria-label=\{validationTrendCoordinateLabel/,
  'every plotted coordinate must be a named keyboard-focusable non-action target',
);
assert.match(
  validationTrendChartSource,
  /onMouseEnter=[\s\S]*?onMouseLeave=[\s\S]*?onFocus=[\s\S]*?onBlur=[\s\S]*?event\.key !== 'Escape'/,
  'coordinate tooltips must support hover, focus, dismissal, and Escape',
);
assert.match(
  validationTrendChartSource,
  /r=\{12\}[\s\S]*?className="validation-trend-hit-target"/,
  'each small marker must have a larger transparent hover target',
);
assert.match(
  validationTrendChartSource,
  /pointClustersByCoordinate[\s\S]*?existing\.entries\.push\(entry\)/,
  'overlapping series must share one reachable tooltip target',
);
assert.match(
  validationTrendChartSource,
  /role="tooltip"[\s\S]*?\{activePoint\.dimensionCount\} dimensions[\s\S]*?\{percent\(activePoint\.value\)\} \{entry\.label\}/,
  'visible tooltips must pair the dimension count with each named percentage value',
);
assert.match(
  validationTrendChartSource,
  /role="tooltip"(?:(?!<text)[\s\S])*?<text[\s\S]*?className="validation-trend-tooltip-coordinate"[\s\S]*?\{activePoint\.dimensionCount\} dimensions/,
  'the dimension count must be the first line in the tooltip, without a header',
);
assert.match(
  validationPageSource,
  /return `\$\{dimensionCount\} dimensions\. \$\{labels\s*\.map\(\(label\) => `\$\{percent\(value\)\} \$\{label\}`\)\s*\.join\('\. '\)\}\.\`;/,
  'accessible point labels must use the same header-free dimension and named percentage format',
);
assert.doesNotMatch(
  validationTrendChartSource,
  />\s*X:|>\s*Y:/,
  'visible tooltips must not expose abstract X or Y labels',
);
assert.doesNotMatch(
  validationTrendChartSource,
  /<title>/,
  'custom coordinate tooltips must replace delayed native SVG titles',
);
assert.match(
  validationStylesSource,
  /\.validation-trend-point:focus-visible \.validation-trend-hit-target[\s\S]*?stroke:\s*var\(--validation-trend-line\);/,
  'keyboard-focused data points must have a visible chart-native halo',
);
assert.match(
  validationPageSource,
  /<table className="sr-only">[\s\S]*?Experiments averaged/,
  'history charts must expose exact averages and sample counts accessibly',
);
assert.equal(
  validationPageSource.match(/<ValidationTrendInfo label=/g)?.length,
  5,
  'validation history and both overall metric explanations must be hidden behind reusable info buttons',
);
assert.match(
  validationPageSource,
  /aria-label=\{label\}[\s\S]*?aria-expanded=\{open\}[\s\S]*?aria-controls=\{descriptionId\}/,
  'the info buttons must expose their names, state, and controlled descriptions',
);
assert.match(
  validationPageSource,
  /<p id=\{descriptionId\} hidden=\{!open\}>/,
  'each controlled chart description must remain mounted and hidden while collapsed',
);
assert.match(
  validationPageSource,
  /label="About validation history calculations"[\s\S]*?label="About benchmark match"[\s\S]*?label="About Agent consistency"/,
  'all validation history info controls must retain explicit accessible names',
);
assert.match(
  validationPageSource,
  /className="validation-trend-kicker-row"[\s\S]*?Validation history[\s\S]*?label="About validation history calculations"/,
  'the Validation history info control must sit beside the section kicker',
);
assert.match(
  validationPageSource,
  /<section className="validation-trends" aria-label="Validation history">/,
  'the validation history region must retain an accessible name without a visible title',
);
assert.doesNotMatch(
  validationPageSource,
  /Performance by persona dimensions/,
  'the redundant validation history title must not render',
);
assert.match(
  validationPageSource,
  /className="section-kicker"[\s\S]*?htmlFor="validation-experiment-selector"[\s\S]*?Experiment breakdown/,
  'the experiment selector must use the Validation history eyebrow treatment and label',
);
assert.match(
  validationStylesSource,
  /\.validation-trend-info button\s*\{[\s\S]*?width:\s*24px;[\s\S]*?border-radius:\s*999px;/,
  'chart explanations must use compact circular info controls',
);
assert.match(
  validationStylesSource,
  /\.validation-trends-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
  'validation history charts must use two equal columns at wide widths',
);
assert.match(
  validationStylesSource,
  /@media \(max-width: 650px\) \{[\s\S]*?\.validation-trends-grid\s*\{\s*grid-template-columns:\s*1fr;/,
  'validation history charts must stack at compact widths',
);
assert.match(
  validationStylesSource,
  /\.validation-trend-svg\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/,
  'each chart must fit its card so both dimension endpoints remain visible',
);
assert.match(
  validationStylesSource,
  /\.validation-trend-scroll\s*\{[\s\S]*?overflow:\s*hidden;/,
  'chart cards must not hide endpoints inside an unreachable horizontal scroller',
);
assert.match(
  validationStylesSource,
  /\.validation-trend-info p\s*\{[\s\S]*?top:\s*calc\(100% \+ 4px\);/,
  'opened chart explanations must clear wrapped card titles and controls',
);
assert.ok(
  experimentWarningStart > resultsToolbarStart &&
    experimentWarningStart < overallResultsStart,
  'the partial-run warning must appear directly under the selected experiment',
);
const overallResultsMarkup = validationPageSource.slice(
  overallResultsStart,
  overallResultsEnd,
);
const overallMetricLabelRule = validationStylesSource.match(
  /\.validation-embedded \.validation-overall-metric-header\s*\{([^}]*)\}/,
);
assert.ok(
  overallMetricLabelRule,
  'the overall Results metric label rule must remain discoverable',
);
assert.match(
  overallMetricLabelRule?.[1] ?? '',
  /min-height:\s*2\.5em;/,
  'overall Results labels must retain a compact aligned header row',
);
const overallMetricTextRule = validationStylesSource.match(
  /\.validation-embedded \.validation-overall-metric-header > span\s*\{([^}]*)\}/,
);
assert.match(
  overallMetricTextRule?.[1] ?? '',
  /line-height:\s*1\.25;/,
  'overall Results label row height must stay fixed for aligned values',
);
const compactValidationStylesStart = validationStylesSource.indexOf(
  '@media (max-width: 650px) {',
);
const compactValidationStylesEnd = validationStylesSource.indexOf(
  "\n#validation-root[data-validation-host-viewport='wide']",
  compactValidationStylesStart,
);
assert.ok(
  compactValidationStylesStart >= 0 &&
    compactValidationStylesEnd > compactValidationStylesStart,
  'the compact Validation styles must remain discoverable',
);
const compactOverallMetricLabelRule = validationStylesSource
  .slice(compactValidationStylesStart, compactValidationStylesEnd)
  .match(
    /\.validation-embedded \.validation-overall-metric-header\s*\{([^}]*)\}/,
  );
assert.match(
  compactOverallMetricLabelRule?.[1] ?? '',
  /min-height:\s*0;/,
  'stacked overall Results cards must release the shared label height',
);
assert.doesNotMatch(
  overallResultsMarkup,
  /<span>Agent responses<\/span>/,
  'the overall Agent responses card must not be rendered',
);
assert.doesNotMatch(
  overallResultsMarkup,
  /surveys represented/,
  'the removed Agent responses card copy must not remain',
);
assert.doesNotMatch(
  overallResultsMarkup,
  /<span>Human benchmarks<\/span>/,
  'the overall Human benchmarks card must not be rendered',
);
assert.doesNotMatch(
  overallResultsMarkup,
  /Current completed benchmarks/,
  'the removed Human benchmarks card copy must not remain',
);
assert.match(
  overallResultsMarkup,
  /<span>Overall benchmark match<\/span>/,
  'the overall benchmark match card must remain',
);
assert.match(
  overallResultsMarkup,
  /<span>Overall Agent consistency<\/span>/,
  'the overall Agent consistency card must remain',
);
assert.equal(
  (
    overallResultsMarkup.match(
      /className="validation-overall-metric-header"/g,
    ) ?? []
  ).length,
  2,
  'the overall Results summary must render exactly its two remaining metric cards',
);
assert.equal(
  (overallResultsMarkup.match(/<ValidationTrendInfo/g) ?? []).length,
  2,
  'each overall metric header must provide its own info button',
);
assert.doesNotMatch(
  validationPageSource,
  /className="validation-results-method"/,
  'the combined Results methodology block must be removed',
);

const partialExperimentWarning = validationExperimentWarning({
  completedRuns: 39,
  expectedRuns: 40,
});
assert.equal(
  partialExperimentWarning,
  'Only 39 of 40 Agent responses finished successfully.',
  'a partial experiment must report its successful run count out of 40',
);
assert.equal(
  validationExperimentWarning({ completedRuns: 40, expectedRuns: 40 }),
  null,
  'a complete 40 of 40 experiment must not show a warning',
);
assert.equal(
  validationExperimentWarning({ completedRuns: 41, expectedRuns: 40 }),
  null,
  'the warning condition must be strictly completedRuns < expectedRuns',
);
assert.equal(
  validationExperimentWarning(null),
  null,
  'the empty experiment state must not show a partial-run warning',
);

const everyday = surveyById.everyday;
const everydayA = answersFor(everyday, 0);
const everydayB = answersFor(everyday, 1);

const validAgentBody = {
  ok: true,
  survey_id: everyday.id,
  answers: everydayA,
  context_id: alfredPersona.contextId,
  persona_id: alfredPersona.personaId,
  persona_display_name: alfredPersona.displayName,
  baseline_sha256: alfredPersona.baselineSha256,
  persona_revision: alfredPersona.revisionSha256,
  persona_dimension_count: 198,
  model: 'gpt-5.6-luna',
  reasoning_effort: 'low',
  started_at: '2026-09-01T09:00:00.000Z',
  completed_at: '2026-09-01T09:00:04.000Z',
  execution: {
    mode: 'codex-ephemeral',
    prior_conversation_messages: 0,
    memory: 'disabled',
    tools: 'disabled',
  },
};
const parsedAgentResult = parseValidationAgentResult(
  validAgentBody,
  everyday,
  alfredPersona.contextId,
  alfredPersona.revisionSha256,
);
assert.deepEqual(parsedAgentResult.answers, everydayA);
assert.equal(parsedAgentResult.executionMode, 'codex-ephemeral');

let requestedAgentUrl;
let requestedAgentInit;
const fetchedAgentResult = await runValidationAgentSurvey(
  everyday,
  alfredPersona.contextId,
  alfredPersona.revisionSha256,
  async (url, init) => {
    requestedAgentUrl = String(url);
    requestedAgentInit = init;
    return new Response(JSON.stringify(validAgentBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
);
assert.equal(requestedAgentUrl, VALIDATION_AGENT_ENDPOINT);
assert.deepEqual(JSON.parse(requestedAgentInit.body), {
  survey_id: everyday.id,
  context_id: alfredPersona.contextId,
  persona_revision: alfredPersona.revisionSha256,
});
assert.deepEqual(fetchedAgentResult.answers, everydayA);

assert.throws(
  () =>
    parseValidationAgentResult(
      {
        ...validAgentBody,
        answers: { ...everydayA, restaurant: 'not-an-option' },
      },
      everyday,
      alfredPersona.contextId,
      alfredPersona.revisionSha256,
    ),
  /unknown survey option/,
);
const identical = compareSurvey(everyday, everydayA, everydayA);
assert.equal(identical.similarity, 1);
assert.equal(identical.exactMatches, 5);
assert.equal(identical.differences.length, 0);

const different = compareSurvey(everyday, everydayA, everydayB);
assert.equal(different.similarity, 0);
assert.equal(different.exactMatches, 0);
assert.equal(different.differences.length, 5);

const dials = surveyById.dials;
const lowDials = answersFor(dials, 0);
const highDials = answersFor(dials, 4);
const dialComparison = compareSurvey(dials, lowDials, highDials);
assert.equal(dialComparison.similarity, 0);
assert.equal(dialComparison.exactMatches, 0);
assert.equal(dialComparison.withinOne, 0);
assert.equal(
  dialComparison.differences.every((item) => item.distance === 4),
  true,
);

const dialHuman = Object.fromEntries(
  dials.questions.map((question, index) => [question.id, String(index + 1)]),
);
const dialAgentValues = ['1', '3', '1', '5', '5'];
const dialAgent = Object.fromEntries(
  dials.questions.map((question, index) => [
    question.id,
    dialAgentValues[index],
  ]),
);
const mixedDialComparison = compareSurvey(dials, dialHuman, dialAgent);
assert.equal(mixedDialComparison.similarity, 0.8);
assert.equal(mixedDialComparison.exactMatches, 2);
assert.equal(mixedDialComparison.withinOne, 4);
assert.equal(mixedDialComparison.differences.length, 3);

const silly = surveyById['internet-creature'];
const sillyA = answersFor(silly, 0);
const sillyB = answersFor(silly, 1);
const sillyResult = scoreSurvey(silly, sillyA);
assert.equal(sillyResult.kind, 'silly');
assert.equal(sillyResult.code.length, 4);
assert.equal(sillyResult.scores.length, 4);
assert.equal(
  sillyResult.scores.every((score) => score >= 0 && score <= 100),
  true,
);

const sillyComparison = compareSurvey(silly, sillyA, sillyB);
assert.equal(sillyComparison.similarity, 0);
assert.equal(sillyComparison.differences.length, 28);
assert.equal(typeof sillyComparison.profileSimilarity, 'number');

const legacy = JSON.stringify({
  everyday: {
    human: { answers: everydayA, completedAt: '2026-01-01T10:00:00.000Z' },
    persona: { answers: everydayB, completedAt: '2026-01-01T10:05:00.000Z' },
  },
});
const migrated = parseStoredSurveyData(null, legacy);
assert.equal(migrated.everyday.human.id, 'migrated-human-everyday');
assert.equal(migrated.everyday.agentRuns.length, 1);
assert.equal(migrated.everyday.agentRuns[0].dimensionCount, null);
assert.equal(
  migrated.everyday.agentRuns[0].benchmarkId,
  migrated.everyday.human.id,
);

const recoveredFromInvalidV2 = loadStoredSurveyData(
  JSON.stringify({ version: 99, surveys: {} }),
  legacy,
);
assert.equal(recoveredFromInvalidV2.source, 'legacy');
assert.equal(recoveredFromInvalidV2.store.everyday.agentRuns.length, 1);
assert.equal(typeof recoveredFromInvalidV2.warning, 'string');

const invalidCompletedLegacy = JSON.stringify({
  everyday: {
    human: {
      answers: { ...everydayA, restaurant: 'not-a-real-option' },
      completedAt: 'not-a-date',
    },
  },
});
const sanitized = parseStoredSurveyData(null, invalidCompletedLegacy);
assert.equal(sanitized.everyday.human.answers.restaurant, undefined);
assert.equal(sanitized.everyday.human.completedAt, undefined);

const roundTripped = parseStoredSurveyData(serializeSurveyData(migrated), null);
assert.equal(roundTripped.everyday.agentRuns.length, 1);
assert.equal(roundTripped.everyday.agentRuns[0].dimensionCount, null);
assert.equal(roundTripped.everyday.human.personaAgent, null);

const identifiedStore = {
  everyday: {
    human: {
      id: 'identified-human',
      answers: everydayA,
      startedAt: '2026-01-01T09:00:00.000Z',
      completedAt: '2026-01-01T09:05:00.000Z',
      personaAgent: alfredPersona,
    },
    agentRuns: [
      {
        id: 'identified-agent',
        sequence: 1,
        dimensionCount: 8,
        answers: everydayA,
        startedAt: '2026-01-01T10:00:00.000Z',
        completedAt: '2026-01-01T10:05:00.000Z',
        freshSessionAttestedAt: '2026-01-01T10:00:00.000Z',
        benchmarkId: 'identified-human',
        personaAgent: alfredPersona,
      },
    ],
    generation: 0,
    deletedAgentRuns: [],
  },
};
const identifiedRoundTrip = parseStoredSurveyData(
  serializeSurveyData(identifiedStore),
  null,
);
assert.deepEqual(
  identifiedRoundTrip.everyday.human.personaAgent,
  alfredPersona,
);
assert.deepEqual(
  identifiedRoundTrip.everyday.agentRuns[0].personaAgent,
  alfredPersona,
);

const experimentMetadata = {
  id: 'experiment-round-trip',
  startedAt: '2026-01-01T09:59:00.000Z',
  responseIndex: 1,
  responsesPerSurvey: 10,
  surveyIds: surveys.map((survey) => survey.id),
};
const experimentRoundTrip = parseStoredSurveyData(
  serializeSurveyData({
    everyday: {
      agentRuns: [
        {
          ...identifiedStore.everyday.agentRuns[0],
          experiment: experimentMetadata,
        },
      ],
    },
  }),
  null,
);
assert.deepEqual(
  experimentRoundTrip.everyday.agentRuns[0].experiment,
  experimentMetadata,
);
const invalidExperimentRoundTrip = parseStoredSurveyData(
  serializeSurveyData({
    everyday: {
      agentRuns: [
        {
          ...identifiedStore.everyday.agentRuns[0],
          experiment: { ...experimentMetadata, responseIndex: 11 },
        },
      ],
    },
  }),
  null,
);
assert.equal(
  invalidExperimentRoundTrip.everyday.agentRuns[0].experiment,
  undefined,
);

const experimentBackfillMerge = mergeSurveyStores(
  {
    everyday: {
      agentRuns: [identifiedStore.everyday.agentRuns[0]],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
  {
    everyday: {
      agentRuns: [
        {
          ...identifiedStore.everyday.agentRuns[0],
          experiment: experimentMetadata,
        },
      ],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
);
assert.deepEqual(
  experimentBackfillMerge.everyday.agentRuns[0].experiment,
  experimentMetadata,
);

const backfilledLegacyIdentity = backfillSurveyStorePersonaAgent(migrated, {
  ...alfredPersona,
  revisionSha256: null,
});
assert.equal(
  backfilledLegacyIdentity.everyday.human.personaAgent.displayName,
  'Alfred',
);
assert.equal(
  backfilledLegacyIdentity.everyday.agentRuns[0].personaAgent.revisionSha256,
  null,
);

const agentFirstDraft = {
  id: 'agent-first-draft',
  sequence: 1,
  dimensionCount: 7,
  answers: Object.fromEntries(
    everyday.questions
      .slice(0, 2)
      .map((question) => [question.id, question.options[0].id]),
  ),
  startedAt: '2026-01-01T08:00:00.000Z',
  freshSessionAttestedAt: '2026-01-01T08:00:00.000Z',
  benchmarkId: null,
};
const agentFirstDraftRoundTrip = parseStoredSurveyData(
  serializeSurveyData({
    everyday: {
      agentRuns: [agentFirstDraft],
      generation: 0,
      deletedAgentRuns: [],
    },
  }),
  null,
);
assert.equal(agentFirstDraftRoundTrip.everyday.agentRuns.length, 1);
assert.equal(
  activeAgentDraft(agentFirstDraftRoundTrip.everyday)?.id,
  agentFirstDraft.id,
);
assert.equal(agentFirstDraftRoundTrip.everyday.agentRuns[0].benchmarkId, null);

function mixedAnswers(matchCount) {
  return Object.fromEntries(
    everyday.questions.map((question, index) => [
      question.id,
      question.options[index < matchCount ? 0 : 1].id,
    ]),
  );
}

const convergenceHistory = {
  human: {
    id: 'human-1',
    answers: everydayA,
    startedAt: '2026-01-01T09:00:00.000Z',
    completedAt: '2026-01-01T09:05:00.000Z',
  },
  agentRuns: [
    {
      id: 'run-1',
      sequence: 1,
      dimensionCount: 0,
      answers: everydayB,
      startedAt: '2026-01-01T10:00:00.000Z',
      completedAt: '2026-01-01T10:05:00.000Z',
      freshSessionAttestedAt: '2026-01-01T10:00:00.000Z',
      benchmarkId: 'human-1',
    },
    {
      id: 'run-2',
      sequence: 2,
      dimensionCount: 4,
      answers: mixedAnswers(2),
      startedAt: '2026-01-01T11:00:00.000Z',
      completedAt: '2026-01-01T11:05:00.000Z',
      freshSessionAttestedAt: '2026-01-01T11:00:00.000Z',
      benchmarkId: 'human-1',
    },
    {
      id: 'run-3',
      sequence: 3,
      dimensionCount: 9,
      answers: everydayA,
      startedAt: '2026-01-01T12:00:00.000Z',
      completedAt: '2026-01-01T12:05:00.000Z',
      freshSessionAttestedAt: '2026-01-01T12:00:00.000Z',
      benchmarkId: 'human-1',
    },
    {
      id: 'run-4',
      sequence: 4,
      dimensionCount: 9,
      answers: mixedAnswers(4),
      startedAt: '2026-01-01T13:00:00.000Z',
      completedAt: '2026-01-01T13:05:00.000Z',
      freshSessionAttestedAt: '2026-01-01T13:00:00.000Z',
      benchmarkId: 'human-1',
    },
    {
      id: 'legacy',
      sequence: 5,
      dimensionCount: null,
      answers: everydayA,
      startedAt: '2026-01-01T14:00:00.000Z',
      completedAt: '2026-01-01T14:05:00.000Z',
      freshSessionAttestedAt: null,
      benchmarkId: 'human-1',
      migrated: true,
    },
  ],
};

const agentFirstComplete = {
  id: 'agent-first-complete',
  sequence: 1,
  dimensionCount: 7,
  answers: everydayB,
  startedAt: '2026-01-01T07:00:00.000Z',
  completedAt: '2026-01-01T07:05:00.000Z',
  freshSessionAttestedAt: '2026-01-01T07:00:00.000Z',
  benchmarkId: null,
};
const migratedUnpairedRun = {
  ...agentFirstComplete,
  id: 'migrated-unpaired',
  sequence: 3,
  benchmarkId: null,
  migrated: true,
};
const alreadyBoundRun = {
  ...agentFirstComplete,
  id: 'already-bound',
  sequence: 4,
  benchmarkId: 'human-other',
};
const pendingHistory = {
  agentRuns: [
    agentFirstComplete,
    { ...agentFirstDraft, sequence: 2 },
    migratedUnpairedRun,
    alreadyBoundRun,
  ],
  generation: 0,
  deletedAgentRuns: [],
};
const boundPendingHistory = bindPendingAgentRuns(pendingHistory, 'human-later');
assert.equal(
  boundPendingHistory.agentRuns.find((run) => run.id === agentFirstComplete.id)
    .benchmarkId,
  'human-later',
);
assert.equal(
  boundPendingHistory.agentRuns.find((run) => run.id === agentFirstDraft.id)
    .benchmarkId,
  'human-later',
);
assert.equal(
  boundPendingHistory.agentRuns.find((run) => run.id === migratedUnpairedRun.id)
    .benchmarkId,
  null,
);
assert.equal(
  boundPendingHistory.agentRuns.find((run) => run.id === alreadyBoundRun.id)
    .benchmarkId,
  'human-other',
);
assert.deepEqual(
  bindPendingAgentRuns(boundPendingHistory, 'human-later'),
  boundPendingHistory,
);

const mergedAgentFirstBinding = mergeSurveyStores(
  {
    everyday: {
      agentRuns: [agentFirstComplete],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
  {
    everyday: {
      agentRuns: [
        {
          ...agentFirstComplete,
          benchmarkId: 'human-later',
          answers: everydayA,
          completedAt: '2026-01-01T07:06:00.000Z',
        },
      ],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
);
assert.equal(
  mergedAgentFirstBinding.everyday.agentRuns[0].benchmarkId,
  'human-later',
);
assert.deepEqual(
  mergedAgentFirstBinding.everyday.agentRuns[0].answers,
  everydayB,
);
assert.equal(
  mergedAgentFirstBinding.everyday.agentRuns[0].completedAt,
  agentFirstComplete.completedAt,
);

assert.deepEqual(
  convergencePoints('everyday', {
    agentRuns: [agentFirstComplete],
    generation: 0,
    deletedAgentRuns: [],
  }),
  [],
);
const laterHuman = {
  id: 'human-later',
  answers: everydayA,
  startedAt: '2026-01-01T09:00:00.000Z',
  completedAt: '2026-01-01T09:05:00.000Z',
};
const humanWithUnboundAgent = {
  human: laterHuman,
  agentRuns: [agentFirstComplete],
  generation: 0,
  deletedAgentRuns: [],
};
assert.deepEqual(convergencePoints('everyday', humanWithUnboundAgent), []);
const humanWithBoundAgent = bindPendingAgentRuns(
  humanWithUnboundAgent,
  laterHuman.id,
);
assert.equal(convergencePoints('everyday', humanWithBoundAgent).length, 1);
assert.equal(
  convergencePoints('everyday', humanWithBoundAgent)[0].runId,
  agentFirstComplete.id,
);

const mismatchedPersonaHistory = {
  human: { ...laterHuman, personaAgent: alfredPersona },
  agentRuns: [
    {
      ...agentFirstComplete,
      benchmarkId: laterHuman.id,
      personaAgent: secondPersona,
    },
  ],
  generation: 0,
  deletedAgentRuns: [],
};
assert.equal(
  completedAgentRuns(mismatchedPersonaHistory, laterHuman.id).length,
  0,
);
assert.equal(convergencePoints('everyday', mismatchedPersonaHistory).length, 0);
assert.equal(
  bindPendingAgentRuns(
    {
      ...mismatchedPersonaHistory,
      agentRuns: [
        {
          ...mismatchedPersonaHistory.agentRuns[0],
          benchmarkId: null,
        },
      ],
    },
    laterHuman.id,
  ).agentRuns[0].benchmarkId,
  null,
);

const preHumanSidebarState = buildValidationSidebarState(
  {
    everyday: {
      agentRuns: [agentFirstComplete, agentFirstDraft],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
  {
    name: 'quiz',
    surveyId: 'everyday',
    actor: 'agent',
    runId: agentFirstDraft.id,
  },
);
assert.equal(preHumanSidebarState.totals.completedBenchmarks, 0);
assert.equal(preHumanSidebarState.totals.completedAgentRuns, 1);
assert.equal(preHumanSidebarState.surveys[0].humanStatus, 'not-started');
assert.equal(preHumanSidebarState.surveys[0].agentDraftAnswered, 2);
assert.deepEqual(preHumanSidebarState.activeProgress, {
  answered: 2,
  total: everyday.questions.length,
});

const points = convergencePoints('everyday', convergenceHistory);
assert.deepEqual(
  points.map((point) => point.dimensionCount),
  [0, 4, 9, 9],
);
assert.deepEqual(
  points.map((point) => point.similarity),
  [0, 0.4, 1, 0.8],
);
assert.equal(
  convergenceNarrative(points).title,
  'Similarity rose by 90 points',
);

const unevenNarrative = convergenceNarrative([
  { ...points[0], dimensionCount: 0, similarity: 0.7 },
  { ...points[1], dimensionCount: 4, similarity: 0.3 },
  { ...points[2], dimensionCount: 9, similarity: 0.8 },
]);
assert.match(unevenNarrative.detail, /path across recorded depths was uneven/);

function experimentRun({
  id,
  sequence,
  survey,
  answers,
  dimensionCount,
  completedAt,
  experiment,
  benchmarkId = null,
}) {
  return {
    id,
    sequence,
    dimensionCount,
    answers,
    startedAt: completedAt,
    completedAt,
    freshSessionAttestedAt: completedAt,
    benchmarkId,
    personaAgent: alfredPersona,
    ...(experiment
      ? {
          experiment: {
            ...experiment,
            responseIndex: sequence,
            surveyIds: experiment.surveyIds ?? [survey.id],
          },
        }
      : {}),
  };
}

const groupedExperimentBase = {
  id: 'batch-190-first',
  startedAt: '2026-02-01T09:00:00.000Z',
  responsesPerSurvey: 2,
  surveyIds: ['everyday', 'dials'],
};
const groupedExperimentSecond = {
  ...groupedExperimentBase,
  id: 'batch-190-second',
  startedAt: '2026-02-02T09:00:00.000Z',
};
const groupedExperimentsStore = {
  everyday: {
    agentRuns: [
      experimentRun({
        id: 'batch-first-everyday-1',
        sequence: 1,
        survey: everyday,
        answers: everydayA,
        dimensionCount: 190,
        completedAt: '2026-02-01T09:01:00.000Z',
        experiment: groupedExperimentBase,
      }),
      experimentRun({
        id: 'batch-first-everyday-duplicate-slot',
        sequence: 1,
        survey: everyday,
        answers: everydayB,
        dimensionCount: 190,
        completedAt: '2026-02-01T09:02:00.000Z',
        experiment: groupedExperimentBase,
      }),
      experimentRun({
        id: 'batch-second-everyday-1',
        sequence: 1,
        survey: everyday,
        answers: everydayA,
        dimensionCount: 190,
        completedAt: '2026-02-02T09:01:00.000Z',
        experiment: groupedExperimentSecond,
      }),
    ],
  },
  dials: {
    agentRuns: [
      experimentRun({
        id: 'batch-first-dials-1',
        sequence: 1,
        survey: dials,
        answers: lowDials,
        dimensionCount: 190,
        completedAt: '2026-02-01T09:01:00.000Z',
        experiment: groupedExperimentBase,
      }),
    ],
  },
};
const groupedExperimentOptions = validationExperimentOptions(
  groupedExperimentsStore,
);
assert.deepEqual(
  groupedExperimentOptions.map((option) => option.label),
  ['190 dim, #2', '190 dim'],
);
assert.equal(groupedExperimentOptions[1].completedRuns, 2);
assert.equal(groupedExperimentOptions[1].expectedRuns, 4);
assert.equal(groupedExperimentOptions[1].status, 'partial');

const legacyExperimentOptions = validationExperimentOptions({
  everyday: {
    agentRuns: [
      experimentRun({
        id: 'legacy-everyday',
        sequence: 1,
        survey: everyday,
        answers: everydayA,
        dimensionCount: 190,
        completedAt: '2026-01-01T09:00:00.000Z',
      }),
    ],
  },
  dials: {
    agentRuns: [
      experimentRun({
        id: 'legacy-dials',
        sequence: 1,
        survey: dials,
        answers: lowDials,
        dimensionCount: 190,
        completedAt: '2026-01-02T09:00:00.000Z',
      }),
    ],
  },
});
assert.equal(legacyExperimentOptions.length, 2);
assert.deepEqual(
  legacyExperimentOptions.map((option) => option.label),
  ['190 dim, #2', '190 dim'],
);
assert.deepEqual(
  legacyExperimentOptions.map((option) => option.completedRuns),
  [1, 1],
);

const consistencyBatch = {
  id: 'consistency-only',
  startedAt: '2026-03-01T09:00:00.000Z',
  responsesPerSurvey: 10,
  surveyIds: ['everyday'],
};
const consistencyOnlyStore = {
  everyday: {
    agentRuns: Array.from({ length: 10 }, (_, index) =>
      experimentRun({
        id: `consistency-${index + 1}`,
        sequence: index + 1,
        survey: everyday,
        answers: index < 7 ? everydayA : everydayB,
        dimensionCount: 190,
        completedAt: `2026-03-01T09:00:${String(index + 1).padStart(2, '0')}.000Z`,
        experiment: consistencyBatch,
      }),
    ),
  },
};
const consistencyOnly = aggregateValidationExperiment(
  consistencyOnlyStore,
  consistencyBatch.id,
);
assert.equal(consistencyOnly.experiment.status, 'complete');
assert.equal(consistencyOnly.overall.completedRuns, 10);
assert.equal(consistencyOnly.overall.humanBenchmarkCount, 0);
assert.equal(consistencyOnly.overall.benchmarkSimilarity, null);
assert.equal(consistencyOnly.overall.exactBenchmarkMatchRate, null);
assert.equal(consistencyOnly.overall.consistency, 0.7);
assert.equal(consistencyOnly.surveys[0].questions[0].consistency, 0.7);
assert.deepEqual(
  consistencyOnly.surveys[0].questions[0].distribution.map(
    ({ count, share }) => [count, share],
  ),
  [
    [7, 0.7],
    [3, 0.3],
  ],
);

const aggregateBatch = {
  id: 'aggregate-with-benchmarks',
  startedAt: '2026-04-01T09:00:00.000Z',
  responsesPerSurvey: 3,
  surveyIds: ['everyday', 'dials'],
};
const aggregateStore = {
  everyday: {
    human: {
      id: 'aggregate-human-everyday',
      answers: everydayA,
      startedAt: '2026-03-31T09:00:00.000Z',
      completedAt: '2026-03-31T09:05:00.000Z',
      personaAgent: alfredPersona,
    },
    agentRuns: [everydayA, everydayA, everydayB].map((answers, index) =>
      experimentRun({
        id: `aggregate-everyday-${index + 1}`,
        sequence: index + 1,
        survey: everyday,
        answers,
        dimensionCount: 191,
        completedAt: `2026-04-01T09:01:0${index}.000Z`,
        experiment: aggregateBatch,
        benchmarkId: 'aggregate-human-everyday',
      }),
    ),
  },
  dials: {
    human: {
      id: 'aggregate-human-dials',
      answers: lowDials,
      startedAt: '2026-03-31T09:00:00.000Z',
      completedAt: '2026-03-31T09:05:00.000Z',
      personaAgent: alfredPersona,
    },
    agentRuns: [lowDials, highDials].map((answers, index) =>
      experimentRun({
        id: `aggregate-dials-${index + 1}`,
        sequence: index + 1,
        survey: dials,
        answers,
        dimensionCount: 191,
        completedAt: `2026-04-01T09:02:0${index}.000Z`,
        experiment: aggregateBatch,
        benchmarkId: 'aggregate-human-dials',
      }),
    ),
  },
};
const aggregated = aggregateValidationExperiment(
  aggregateStore,
  aggregateBatch.id,
);
assert.equal(aggregated.experiment.completedRuns, 5);
assert.equal(aggregated.experiment.expectedRuns, 6);
assert.equal(aggregated.experiment.status, 'partial');
assert.equal(aggregated.overall.humanBenchmarkCount, 2);
assert.equal(aggregated.overall.benchmarkedSurveyCount, 2);
assert.equal(aggregated.overall.benchmarkComparisons, 25);
assert.ok(Math.abs(aggregated.overall.consistency - 0.6) < 1e-12);
assert.ok(Math.abs(aggregated.overall.benchmarkSimilarity - 0.6) < 1e-12);
assert.ok(Math.abs(aggregated.overall.exactBenchmarkMatchRate - 0.6) < 1e-12);
assert.ok(Math.abs(aggregated.surveys[0].benchmarkSimilarity - 2 / 3) < 1e-12);
assert.equal(aggregated.surveys[1].benchmarkSimilarity, 0.5);
assert.equal(
  aggregated.surveys[0].questions[0].consensusAnswerId,
  everyday.questions[0].options[0].id,
);
assert.equal(aggregated.surveys[0].questions[0].exactBenchmarkMatchRate, 2 / 3);

const trendBatch154Partial = {
  id: 'trend-154-partial',
  startedAt: '2026-05-01T09:00:00.000Z',
  responsesPerSurvey: 2,
  surveyIds: ['everyday', 'dials'],
};
const trendBatch154Complete = {
  id: 'trend-154-complete',
  startedAt: '2026-05-02T09:00:00.000Z',
  responsesPerSurvey: 2,
  surveyIds: ['everyday', 'dials'],
};
const trendBatch198Complete = {
  id: 'trend-198-complete',
  startedAt: '2026-05-03T09:00:00.000Z',
  responsesPerSurvey: 2,
  surveyIds: ['everyday'],
};
const trendBatchUnknownDimensions = {
  id: 'trend-unknown-dimensions',
  startedAt: '2026-05-04T09:00:00.000Z',
  responsesPerSurvey: 1,
  surveyIds: ['everyday'],
};
const trendStore = {
  everyday: {
    human: {
      id: 'trend-human-everyday',
      answers: everydayA,
      startedAt: '2026-04-30T09:00:00.000Z',
      completedAt: '2026-04-30T09:05:00.000Z',
      personaAgent: alfredPersona,
    },
    agentRuns: [
      ...[everydayA, everydayB].map((answers, index) =>
        experimentRun({
          id: `trend-154-partial-everyday-${index + 1}`,
          sequence: index + 1,
          survey: everyday,
          answers,
          dimensionCount: 154,
          completedAt: `2026-05-01T09:01:0${index}.000Z`,
          experiment: trendBatch154Partial,
        }),
      ),
      ...[everydayA, everydayA].map((answers, index) =>
        experimentRun({
          id: `trend-154-complete-everyday-${index + 1}`,
          sequence: index + 1,
          survey: everyday,
          answers,
          dimensionCount: 154,
          completedAt: `2026-05-02T09:01:0${index}.000Z`,
          experiment: trendBatch154Complete,
        }),
      ),
      ...[everydayB, everydayB].map((answers, index) =>
        experimentRun({
          id: `trend-198-complete-everyday-${index + 1}`,
          sequence: index + 1,
          survey: everyday,
          answers,
          dimensionCount: 198,
          completedAt: `2026-05-03T09:01:0${index}.000Z`,
          experiment: trendBatch198Complete,
        }),
      ),
      experimentRun({
        id: 'trend-unknown-dimensions-everyday-1',
        sequence: 1,
        survey: everyday,
        answers: everydayA,
        dimensionCount: null,
        completedAt: '2026-05-04T09:01:00.000Z',
        experiment: trendBatchUnknownDimensions,
      }),
      experimentRun({
        id: 'trend-legacy-everyday-1',
        sequence: 1,
        survey: everyday,
        answers: everydayA,
        dimensionCount: 198,
        completedAt: '2026-04-29T09:01:00.000Z',
      }),
    ],
  },
  dials: {
    human: {
      id: 'trend-human-dials',
      answers: lowDials,
      startedAt: '2026-04-30T09:00:00.000Z',
      completedAt: '2026-04-30T09:05:00.000Z',
      personaAgent: alfredPersona,
    },
    agentRuns: [
      experimentRun({
        id: 'trend-154-partial-dials-1',
        sequence: 1,
        survey: dials,
        answers: lowDials,
        dimensionCount: 154,
        completedAt: '2026-05-01T09:02:00.000Z',
        experiment: trendBatch154Partial,
      }),
      ...[lowDials, highDials].map((answers, index) =>
        experimentRun({
          id: `trend-154-complete-dials-${index + 1}`,
          sequence: index + 1,
          survey: dials,
          answers,
          dimensionCount: 154,
          completedAt: `2026-05-02T09:02:0${index}.000Z`,
          experiment: trendBatch154Complete,
        }),
      ),
    ],
  },
};
const validationTrends = aggregateValidationTrends(trendStore);
assert.deepEqual(
  validationTrends.overallBenchmarkMatch.map(
    ({ dimensionCount, experimentCount }) => [dimensionCount, experimentCount],
  ),
  [
    [154, 2],
    [198, 2],
  ],
  'repeated dimension counts must collapse to one sorted point while unknown-dimension runs are excluded',
);
const overallBenchmark154 = validationTrends.overallBenchmarkMatch.find(
  (point) => point.dimensionCount === 154,
);
const overallBenchmark198 = validationTrends.overallBenchmarkMatch.find(
  (point) => point.dimensionCount === 198,
);
assert.ok(
  Math.abs(overallBenchmark154.value - 17 / 24) < 1e-12,
  'overall benchmark match must average experiment-level metrics equally',
);
assert.equal(
  overallBenchmark198.value,
  0.5,
  'repeated legacy and current validations must be averaged into one dimension point',
);
assert.deepEqual(
  validationTrends.agentConsistency.map((point) => point.dimensionCount),
  [154, 198],
  'Agent consistency must include every saved validation result with a known dimension count',
);
assert.ok(
  Math.abs(validationTrends.agentConsistency[0].value - 17 / 24) < 1e-12,
  'Agent consistency must average independently from benchmark availability',
);
assert.deepEqual(
  validationTrends.agentConsistency[1],
  {
    dimensionCount: 198,
    value: 1,
    experimentCount: 2,
    completeExperimentCount: 2,
    partialExperimentCount: 0,
  },
  'repeated consistency results at one dimension count must collapse into one averaged point',
);
assert.deepEqual(
  overallBenchmark154,
  {
    dimensionCount: 154,
    value: overallBenchmark154.value,
    experimentCount: 2,
    completeExperimentCount: 1,
    partialExperimentCount: 1,
  },
  'chart points must report complete and partial experiment contributions',
);
assert.ok(
  Math.abs(
    validationTrends.surveyBenchmarkMatches.everyday.find(
      (point) => point.dimensionCount === 154,
    ).value - 0.75,
  ) < 1e-12,
  'each survey benchmark line must be averaged independently',
);
assert.equal(validationTrends.surveyBenchmarkMatches.dials[0].value, 0.75);
assert.deepEqual(validationTrends.surveyBenchmarkMatches['plot-twists'], []);
assert.deepEqual(
  validationTrends.surveyBenchmarkMatches['internet-creature'],
  [],
);

const oneSuccessPartialBatch = {
  id: 'trend-one-success-partial',
  startedAt: '2026-05-05T09:00:00.000Z',
  responsesPerSurvey: 2,
  surveyIds: ['everyday'],
};
const oneSuccessPartialTrends = aggregateValidationTrends({
  everyday: {
    agentRuns: [
      experimentRun({
        id: 'trend-one-success-partial-everyday-1',
        sequence: 1,
        survey: everyday,
        answers: everydayA,
        dimensionCount: 222,
        completedAt: '2026-05-05T09:01:00.000Z',
        experiment: oneSuccessPartialBatch,
      }),
    ],
  },
});
assert.deepEqual(
  oneSuccessPartialTrends.agentConsistency,
  [
    {
      dimensionCount: 222,
      value: 1,
      experimentCount: 1,
      completeExperimentCount: 0,
      partialExperimentCount: 1,
    },
  ],
  'an explicit partial validation with one successful response must still contribute its available consistency metric',
);

const benchmarkedTrendBatch = {
  id: 'trend-benchmarked-at-230',
  startedAt: '2026-05-06T09:00:00.000Z',
  responsesPerSurvey: 1,
  surveyIds: ['everyday'],
};
const unbenchmarkedTrendBatch = {
  id: 'trend-unbenchmarked-at-230',
  startedAt: '2026-05-07T09:00:00.000Z',
  responsesPerSurvey: 1,
  surveyIds: ['internet-creature'],
};
const missingBenchmarkTrends = aggregateValidationTrends({
  everyday: {
    human: {
      id: 'trend-missing-value-human-everyday',
      answers: everydayA,
      startedAt: '2026-05-05T09:00:00.000Z',
      completedAt: '2026-05-05T09:05:00.000Z',
      personaAgent: alfredPersona,
    },
    agentRuns: [
      experimentRun({
        id: 'trend-benchmarked-at-230-everyday-1',
        sequence: 1,
        survey: everyday,
        answers: everydayA,
        dimensionCount: 230,
        completedAt: '2026-05-06T09:01:00.000Z',
        experiment: benchmarkedTrendBatch,
      }),
    ],
  },
  'internet-creature': {
    agentRuns: [
      experimentRun({
        id: 'trend-unbenchmarked-at-230-creature-1',
        sequence: 1,
        survey: silly,
        answers: sillyA,
        dimensionCount: 230,
        completedAt: '2026-05-07T09:01:00.000Z',
        experiment: unbenchmarkedTrendBatch,
      }),
    ],
  },
});
assert.deepEqual(
  missingBenchmarkTrends.overallBenchmarkMatch,
  [
    {
      dimensionCount: 230,
      value: 1,
      experimentCount: 1,
      completeExperimentCount: 1,
      partialExperimentCount: 0,
    },
  ],
  'a missing benchmark metric at a repeated dimension must be omitted from the average denominator rather than counted as zero',
);

const mismatchedBenchmarkStore = structuredClone(aggregateStore);
mismatchedBenchmarkStore.everyday.human.personaAgent = secondPersona;
const mismatchedBenchmark = aggregateValidationExperiment(
  mismatchedBenchmarkStore,
  aggregateBatch.id,
);
assert.equal(mismatchedBenchmark.overall.humanBenchmarkCount, 1);
assert.equal(mismatchedBenchmark.overall.benchmarkedSurveyCount, 1);
assert.equal(mismatchedBenchmark.overall.benchmarkComparisons, 10);
assert.equal(mismatchedBenchmark.surveys[0].hasHumanBenchmark, false);
assert.equal(mismatchedBenchmark.surveys[0].benchmarkSimilarity, null);
assert.equal(mismatchedBenchmark.surveys[0].exactBenchmarkMatchRate, null);
assert.equal(
  mismatchedBenchmark.surveys[0].questions[0].humanAnswerLabel,
  null,
);
assert.ok(Math.abs(mismatchedBenchmark.surveys[0].consistency - 2 / 3) < 1e-12);
assert.deepEqual(
  mismatchedBenchmark.surveys[0].questions[0].distribution.map(
    ({ count, share }) => [count, share],
  ),
  [
    [2, 2 / 3],
    [1, 1 / 3],
  ],
);

const sidebarState = buildValidationSidebarState(
  { everyday: convergenceHistory },
  {
    name: 'quiz',
    surveyId: 'everyday',
    actor: 'agent',
    runId: 'run-2',
  },
  { active: true, ready: false },
);
assert.equal(sidebarState.totals.completedBenchmarks, 1);
assert.equal(sidebarState.totals.completedAgentRuns, 5);
assert.deepEqual(sidebarState.activeProgress, { answered: 5, total: 5 });
assert.equal(sidebarState.surveys[0].humanStatus, 'complete');
assert.equal(sidebarState.surveys[0].completedAgentRuns, 5);
assert.equal(sidebarState.agentBatchActive, true);
assert.equal(sidebarState.agentBatchControllerReady, false);
const readyStateMessage = validationStateMessage(
  { everyday: convergenceHistory },
  { name: 'home' },
  { active: false, ready: true },
);
assert.equal(readyStateMessage.state.agentBatchActive, false);
assert.equal(readyStateMessage.state.agentBatchControllerReady, true);
assert.equal(
  isValidationNavigateMessage({
    channel: 'matraix-validation',
    version: 1,
    type: 'navigate',
    target: { name: 'human', surveyId: 'everyday' },
  }),
  true,
);
assert.equal(
  isValidationNavigateMessage({
    channel: 'matraix-validation',
    version: 1,
    type: 'navigate',
    target: { name: 'history', surveyId: 'unknown' },
  }),
  false,
);
assert.equal(
  isValidationRequestStateMessage({
    channel: 'matraix-validation',
    version: 1,
    type: 'request-state',
  }),
  true,
);
assert.equal(
  isValidationRunAgentBatchMessage({
    channel: 'matraix-validation',
    version: 1,
    type: 'run-agent-batch',
  }),
  true,
);
assert.equal(
  isValidationRunAgentBatchMessage({
    channel: 'matraix-validation',
    version: 2,
    type: 'run-agent-batch',
  }),
  false,
);
assert.equal(
  isValidationHostLayoutMessage({
    channel: 'matraix-validation',
    version: 1,
    type: 'host-layout',
    viewport: 'medium',
  }),
  true,
);
assert.equal(
  isValidationHostLayoutMessage({
    channel: 'matraix-validation',
    version: 1,
    type: 'host-layout',
    viewport: 'phone',
  }),
  false,
);

const mergedTabs = mergeSurveyStores(
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: [convergenceHistory.agentRuns[0]],
    },
  },
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: [
        {
          ...convergenceHistory.agentRuns[1],
          sequence: 1,
        },
      ],
    },
  },
);
assert.equal(mergedTabs.everyday.agentRuns.length, 2);
assert.deepEqual(
  mergedTabs.everyday.agentRuns.map((run) => run.sequence),
  [1, 2],
);

const firstEverydayQuestion = everyday.questions[0];
const secondEverydayQuestion = everyday.questions[1];
const draftHumanWithAnswer = {
  id: 'human-toggle-draft',
  answers: {
    [firstEverydayQuestion.id]: firstEverydayQuestion.options[0].id,
  },
  startedAt: '2026-01-03T09:00:00.000Z',
  personaAgent: alfredPersona,
};
const humanAnswerCleared = mergeSurveyStores(
  {
    everyday: {
      human: draftHumanWithAnswer,
      agentRuns: [],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
  {
    everyday: {
      human: {
        ...draftHumanWithAnswer,
        answers: {
          [secondEverydayQuestion.id]: secondEverydayQuestion.options[0].id,
        },
        clearedAnswers: [firstEverydayQuestion.id],
      },
      agentRuns: [],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
);
assert.equal(
  humanAnswerCleared.everyday.human.answers[firstEverydayQuestion.id],
  undefined,
);
assert.equal(
  humanAnswerCleared.everyday.human.answers[secondEverydayQuestion.id],
  secondEverydayQuestion.options[0].id,
);
assert.deepEqual(humanAnswerCleared.everyday.human.clearedAnswers, [
  firstEverydayQuestion.id,
]);

const clearedAnswerRoundTrip = parseStoredSurveyData(
  serializeSurveyData(humanAnswerCleared),
  null,
);
assert.equal(
  clearedAnswerRoundTrip.everyday.human.answers[firstEverydayQuestion.id],
  undefined,
);
assert.deepEqual(clearedAnswerRoundTrip.everyday.human.clearedAnswers, [
  firstEverydayQuestion.id,
]);

const humanAnswerReselected = mergeSurveyStores(humanAnswerCleared, {
  everyday: {
    human: {
      ...humanAnswerCleared.everyday.human,
      answers: {
        ...humanAnswerCleared.everyday.human.answers,
        [firstEverydayQuestion.id]: firstEverydayQuestion.options[1].id,
      },
      clearedAnswers: undefined,
    },
    agentRuns: [],
    generation: 0,
    deletedAgentRuns: [],
  },
});
assert.equal(
  humanAnswerReselected.everyday.human.answers[firstEverydayQuestion.id],
  firstEverydayQuestion.options[1].id,
);
assert.equal(humanAnswerReselected.everyday.human.clearedAnswers, undefined);

const draftAgentWithAnswer = {
  id: 'agent-toggle-draft',
  sequence: 1,
  dimensionCount: 7,
  answers: {
    [firstEverydayQuestion.id]: firstEverydayQuestion.options[0].id,
  },
  startedAt: '2026-01-03T10:00:00.000Z',
  freshSessionAttestedAt: '2026-01-03T10:00:00.000Z',
  benchmarkId: null,
  personaAgent: alfredPersona,
};
const agentAnswerCleared = mergeSurveyStores(
  {
    everyday: {
      agentRuns: [draftAgentWithAnswer],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
  {
    everyday: {
      agentRuns: [
        {
          ...draftAgentWithAnswer,
          answers: {},
          clearedAnswers: [firstEverydayQuestion.id],
        },
      ],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
);
assert.equal(
  agentAnswerCleared.everyday.agentRuns[0].answers[firstEverydayQuestion.id],
  undefined,
);
assert.deepEqual(agentAnswerCleared.everyday.agentRuns[0].clearedAnswers, [
  firstEverydayQuestion.id,
]);

const savedCompletedHuman = {
  ...convergenceHistory.human,
  answers: everydayA,
};
const savedCompletedAgent = convergenceHistory.agentRuns[0];
const completedRecordsStayImmutable = mergeSurveyStores(
  {
    everyday: {
      human: savedCompletedHuman,
      agentRuns: [savedCompletedAgent],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
  {
    everyday: {
      human: {
        ...savedCompletedHuman,
        answers: everydayB,
        completedAt: undefined,
      },
      agentRuns: [
        {
          ...savedCompletedAgent,
          answers: everydayA,
          completedAt: undefined,
        },
      ],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
);
assert.deepEqual(
  completedRecordsStayImmutable.everyday.human.answers,
  everydayA,
);
assert.deepEqual(
  completedRecordsStayImmutable.everyday.agentRuns[0].answers,
  everydayB,
);
assert.equal(
  completedRecordsStayImmutable.everyday.human.completedAt,
  savedCompletedHuman.completedAt,
);
assert.equal(
  completedRecordsStayImmutable.everyday.agentRuns[0].completedAt,
  savedCompletedAgent.completedAt,
);

const identityBackfillMerge = mergeSurveyStores(
  {
    everyday: {
      human: { ...savedCompletedHuman, personaAgent: null },
      agentRuns: [{ ...savedCompletedAgent, personaAgent: null }],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
  {
    everyday: {
      human: { ...savedCompletedHuman, personaAgent: alfredPersona },
      agentRuns: [{ ...savedCompletedAgent, personaAgent: alfredPersona }],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
);
assert.deepEqual(
  identityBackfillMerge.everyday.human.personaAgent,
  alfredPersona,
);
assert.deepEqual(
  identityBackfillMerge.everyday.agentRuns[0].personaAgent,
  alfredPersona,
);
const conflictingIdentityMerge = mergeSurveyStores(identityBackfillMerge, {
  everyday: {
    human: { ...savedCompletedHuman, personaAgent: secondPersona },
    agentRuns: [{ ...savedCompletedAgent, personaAgent: secondPersona }],
    generation: 0,
    deletedAgentRuns: [],
  },
});
assert.deepEqual(
  conflictingIdentityMerge.everyday.human.personaAgent,
  alfredPersona,
);
assert.deepEqual(
  conflictingIdentityMerge.everyday.agentRuns[0].personaAgent,
  alfredPersona,
);

const discardedDraftStaysDeleted = mergeSurveyStores(
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: [],
      generation: 0,
      deletedAgentRuns: [
        {
          id: 'discarded-run',
          deletedAt: '2026-01-01T09:30:00.000Z',
        },
      ],
    },
  },
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: [
        {
          ...convergenceHistory.agentRuns[0],
          id: 'discarded-run',
          completedAt: undefined,
        },
      ],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
);
assert.equal(discardedDraftStaysDeleted.everyday.agentRuns.length, 0);
assert.deepEqual(discardedDraftStaysDeleted.everyday.deletedAgentRuns, [
  { id: 'discarded-run', deletedAt: '2026-01-01T09:30:00.000Z' },
]);

const earlierCompletionBeatsStaleDiscard = mergeSurveyStores(
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: [savedCompletedAgent],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: [],
      generation: 0,
      deletedAgentRuns: [
        { id: savedCompletedAgent.id, deletedAt: '2026-01-01T10:06:00.000Z' },
      ],
    },
  },
);
assert.equal(earlierCompletionBeatsStaleDiscard.everyday.agentRuns.length, 1);

const earlierDiscardBeatsStaleCompletion = mergeSurveyStores(
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: [],
      generation: 0,
      deletedAgentRuns: [
        { id: savedCompletedAgent.id, deletedAt: '2026-01-01T10:04:00.000Z' },
      ],
    },
  },
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: [savedCompletedAgent],
      generation: 0,
      deletedAgentRuns: [],
    },
  },
);
assert.equal(earlierDiscardBeatsStaleCompletion.everyday.agentRuns.length, 0);

const replacementHuman = {
  ...convergenceHistory.human,
  id: 'human-2',
  answers: everydayB,
  startedAt: '2026-01-02T09:00:00.000Z',
  completedAt: '2026-01-02T09:05:00.000Z',
};
const newerGenerationWins = mergeSurveyStores(
  {
    everyday: {
      human: replacementHuman,
      agentRuns: [],
      generation: 1,
      deletedAgentRuns: [],
    },
  },
  {
    everyday: {
      human: convergenceHistory.human,
      agentRuns: convergenceHistory.agentRuns,
      generation: 0,
      deletedAgentRuns: [],
    },
  },
);
assert.equal(newerGenerationWins.everyday.generation, 1);
assert.equal(newerGenerationWins.everyday.human.id, 'human-2');
assert.deepEqual(newerGenerationWins.everyday.human.answers, everydayB);
assert.equal(newerGenerationWins.everyday.agentRuns.length, 0);

const persistedStore = JSON.parse(
  serializeSurveyData({ everyday: convergenceHistory }),
);
const diskEnvelope = {
  schema_version: 1,
  context_id: 'persona-context-1',
  persona_id: 'persona_alfred',
  persona_display_name: 'Alfred',
  baseline_sha256: 'abc123',
  persona_revision: 'revision-alfred-1',
  persona_dimension_count: 198,
  save_revision: 3,
  saved_at: '2026-08-31T17:47:00.000Z',
  store: persistedStore,
};
const parsedDiskState = parseValidationDiskState(diskEnvelope);
assert.equal(parsedDiskState.contextId, 'persona-context-1');
assert.equal(parsedDiskState.personaDisplayName, 'Alfred');
assert.equal(parsedDiskState.personaRevision, 'revision-alfred-1');
assert.equal(parsedDiskState.personaDimensionCount, 198);
assert.deepEqual(parsedDiskState.personaAgent, alfredPersona);
assert.equal(parsedDiskState.saveRevision, 3);
assert.equal(parsedDiskState.store.everyday.agentRuns.length, 5);
assert.equal(
  parsedDiskState.store.everyday.human.personaAgent.revisionSha256,
  null,
);
assert.equal(
  parseValidationDiskState({ current: diskEnvelope }).contextId,
  'persona-context-1',
);
assert.throws(
  () => parseValidationDiskState({ ...diskEnvelope, save_revision: -1 }),
  /invalid shape/,
);
for (const personaDimensionCount of [undefined, -1, 1.5, 10_000]) {
  assert.throws(
    () =>
      parseValidationDiskState({
        ...diskEnvelope,
        persona_dimension_count: personaDimensionCount,
      }),
    /invalid shape/,
  );
}

assert.equal(
  diskStateAcceptsBrowserMigration({
    ...parsedDiskState,
    saveRevision: 0,
    savedAt: null,
    store: {},
  }),
  true,
);
assert.equal(diskStateAcceptsBrowserMigration(parsedDiskState), false);
const migrationCandidate = browserMigrationCandidate(null, legacy);
assert.equal(migrationCandidate.source, 'legacy');
assert.equal(migrationCandidate.hasData, true);

let loadedRequest;
const loadedFromDisk = await loadValidationDiskState(async (input, init) => {
  loadedRequest = { input, init };
  return new Response(JSON.stringify(diskEnvelope), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
assert.equal(loadedRequest.input, VALIDATION_STATE_ENDPOINT);
assert.equal(loadedRequest.init.method, 'GET');
assert.equal(loadedFromDisk.saveRevision, 3);

let savedRequest;
const savedToDisk = await saveValidationDiskState(
  'persona-context-1',
  3,
  identifiedStore,
  async (input, init) => {
    savedRequest = { input, init };
    return new Response(
      JSON.stringify({
        ...diskEnvelope,
        save_revision: 4,
        saved_at: '2026-08-31T17:48:00.000Z',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  },
);
assert.equal(savedRequest.input, VALIDATION_STATE_ENDPOINT);
assert.equal(savedRequest.init.method, 'POST');
const savedBody = JSON.parse(savedRequest.init.body);
assert.equal(savedBody.context_id, 'persona-context-1');
assert.equal(savedBody.expected_save_revision, 3);
assert.equal(savedBody.store.version, 2);
assert.deepEqual(
  savedBody.store.surveys.everyday.human.personaAgent,
  alfredPersona,
);
assert.deepEqual(
  savedBody.store.surveys.everyday.agentRuns[0].personaAgent,
  alfredPersona,
);
assert.equal(savedToDisk.saveRevision, 4);

await assert.rejects(
  saveValidationDiskState(
    'persona-context-1',
    2,
    {},
    async () =>
      new Response(
        JSON.stringify({
          ok: false,
          code: 'validation_state_changed',
          error: 'The current results changed on disk.',
          state: diskEnvelope,
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      ),
  ),
  (error) => {
    assert.equal(error instanceof ValidationPersistenceError, true);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'validation_state_changed');
    assert.match(error.message, /current results changed/i);
    assert.equal(error.currentState.saveRevision, 3);
    return true;
  },
);

let transientAttempts = 0;
let retryWaits = 0;
const savedAfterRetry = await saveValidationDiskStateWithRetry(
  'persona-context-1',
  3,
  { everyday: convergenceHistory },
  async () => {
    transientAttempts += 1;
    if (transientAttempts === 1) {
      return new Response(
        JSON.stringify({ code: 'disk_busy', error: 'disk is busy' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ ...diskEnvelope, save_revision: 4 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
  async () => {
    retryWaits += 1;
  },
);
assert.equal(transientAttempts, 2);
assert.equal(retryWaits, 1);
assert.equal(savedAfterRetry.saveRevision, 4);

console.log(
  'Survey scoring, migration, convergence, and disk persistence fixtures passed.',
);
