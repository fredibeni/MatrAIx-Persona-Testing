import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const selectorElements = new Map();

function elementStub() {
  return {
    attributes: new Map(),
    appendChild() {},
    listeners: new Map(),
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    },
    classList: {
      add() {},
      remove() {},
    },
    click() {
      this.listeners.get('click')?.();
    },
    disabled: false,
    focus() {},
    innerHTML: '',
    querySelector(selector) {
      const attribute = selector.match(/^\[([^\]]+)\]$/)?.[1];
      if (attribute && this.innerHTML.includes(attribute)) {
        if (!selectorElements.has(selector)) {
          selectorElements.set(selector, elementStub());
        }
        return selectorElements.get(selector);
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    style: {},
    textContent: '',
  };
}

const elements = new Map();
const document = {
  createElement: elementStub,
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, elementStub());
    return elements.get(id);
  },
  visibilityState: 'visible',
};
const window = {
  addEventListener() {},
  dispatchEvent() {},
  location: { hash: '#survey' },
  requestAnimationFrame(callback) {
    callback();
  },
  scrollTo() {},
};

const context = vm.createContext({
  clearTimeout,
  console,
  CustomEvent: class CustomEvent {},
  document,
  fetch: () => new Promise(() => {}),
  setInterval: () => 0,
  setTimeout,
  window,
});

const source = readFileSync(
  new URL('../matraix/personal-persona/survey/app.js', import.meta.url),
  'utf8',
);
const chatSource = readFileSync(
  new URL('../matraix/personal-persona/survey/chat.js', import.meta.url),
  'utf8',
);
const shellStylesSource = readFileSync(
  new URL('../matraix/personal-persona/survey/styles.css', import.meta.url),
  'utf8',
);
assert.match(
  chatSource,
  /title:\s*'Results',[\s\S]*?showHomeIcon:\s*true,/,
  'the Validation sidebar Results item must request its Home icon',
);
assert.match(
  chatSource,
  /function createValidationHomeIcon\(\)[\s\S]*?validation-nav-home-icon[\s\S]*?aria-hidden[\s\S]*?return icon;/,
  'the Validation sidebar Home icon must be decorative and reusable',
);
assert.match(
  chatSource,
  /M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8[\s\S]*?M3 10a2 2 0 0 1 \.709-1\.528l7-6/,
  'the Validation sidebar must use the same Lucide Home geometry as the Results button',
);
assert.match(
  shellStylesSource,
  /\.validation-survey-nav \.validation-nav-item\.with-home-icon\s*\{\s*grid-template-columns:\s*15px minmax\(0, 1fr\);\s*\}/,
  'the Validation sidebar must reserve a leading column for the Home icon',
);
vm.runInContext(source, context, { filename: 'survey/app.js' });

const originalRanking = ['adventure', 'tradition', 'achievement'];
const rankingMoveResult = JSON.parse(
  vm.runInContext(
    `(() => {
      const input = ${JSON.stringify(originalRanking)};
      const result = moveRankingValue(input, 0, 2, 5);
      return JSON.stringify({ input, result });
    })()`,
    context,
  ),
);
assert.deepEqual(
  rankingMoveResult.result,
  ['tradition', 'achievement', 'adventure'],
  'Dragging the first selected value to the third slot must preserve every value in the new order',
);
assert.deepEqual(
  rankingMoveResult.input,
  ['adventure', 'tradition', 'achievement'],
  'Reordering must not mutate the stored input array',
);
assert.deepEqual(
  JSON.parse(
    vm.runInContext(
      `JSON.stringify(moveRankingValue(${JSON.stringify(originalRanking)}, 2, 0, 5))`,
      context,
    ),
  ),
  ['achievement', 'adventure', 'tradition'],
  'Dragging the last selected value to the first slot must work',
);
assert.deepEqual(
  JSON.parse(
    vm.runInContext(
      `JSON.stringify(moveRankingValue(${JSON.stringify(originalRanking)}, 1, 8, 5))`,
      context,
    ),
  ),
  originalRanking,
  'An invalid drop position must leave the ranking unchanged',
);
assert.deepEqual(
  JSON.parse(
    vm.runInContext(
      `JSON.stringify(normaliseRankingValues(['adventure', '', 'adventure', 'tradition', 'achievement'], 2))`,
      context,
    ),
  ),
  ['adventure', 'tradition'],
  'Ranking normalization must remove blanks and duplicates while respecting the maximum rank',
);
assert.deepEqual(
  JSON.parse(
    vm.runInContext(
      `JSON.stringify(normaliseRankingValues(
        ['adventure', {}, 1, 'missing', 'tradition'],
        5,
        new Set(['adventure', 'tradition']),
      ))`,
      context,
    ),
  ),
  ['adventure', 'tradition'],
  'Ranking normalization must discard malformed and unknown values',
);
const rankingProgress = JSON.parse(
  vm.runInContext(
    `(() => {
      const previousState = app.state;
      const question = {
        id: 'test_ranking',
        type: 'rank_dimensions',
        max_rank: 2,
        entries: [
          { dimension_id: 'adventure', label: 'Adventure' },
          { dimension_id: 'tradition', label: 'Tradition' },
        ],
      };
      app.state = {
        answers: {
          test_ranking: ['adventure', 'unknown', {}, 'adventure'],
        },
      };
      const result = {
        answered: questionAnsweredUnits(question),
        complete: isQuestionPageAnswered({ question, entry: null }),
      };
      app.state = previousState;
      return JSON.stringify(result);
    })()`,
    context,
  ),
);
assert.deepEqual(
  rankingProgress,
  { answered: 1, complete: false },
  'Unknown and malformed ranking values must not count toward progress or completion',
);
const rankingSlots = vm.runInContext(
  `rankingSlotsMarkup(
    {
      max_rank: 3,
      entries: [
        { dimension_id: 'adventure', label: 'Adventure' },
        { dimension_id: 'tradition', label: 'Tradition' },
      ],
    },
    ['adventure', 'tradition'],
  )`,
  context,
);
assert.match(
  rankingSlots,
  /class="rank-slot filled"[\s\S]*data-rank-draggable[\s\S]*tabindex="0"/,
  'The entire selected-value pill must be draggable and keyboard focusable',
);
assert.match(
  rankingSlots,
  /Adventure, rank 1 of 3\. 2 values selected\. Drag to reorder or use the arrow keys\./,
  'A selected pill must expose its rank and keyboard interaction',
);
assert.doesNotMatch(
  rankingSlots,
  /rank-move-button|rank-drag-handle|&#8593;|&#8595;|&#8942;/,
  'Selected pills must not render separate arrow buttons or drag handles',
);

vm.runInContext(
  `
    const testQuestion = (id) => ({
      id,
      type: 'single_choice',
      prompt: id,
      current_high_confidence: false,
      options: [{ value: 'yes', label: 'Yes' }],
    });
    app.definition = {
      coverage: { preanswered_dimensions: [], total_dimensions: 0 },
      modules: [
        {
          id: 'section-one',
          priority: 1,
          title: 'Section one',
          estimated_minutes: 1,
          questions: [testQuestion('one-a'), testQuestion('one-b')],
        },
        {
          id: 'section-two',
          priority: 2,
          title: 'Section two',
          estimated_minutes: 1,
          questions: [testQuestion('two-a'), testQuestion('two-b')],
        },
      ],
    };
    app.state = { answers: {}, visited_modules: ['section-two'] };
    app.currentIndex = 1;
    app.currentQuestionIndex = 0;
    renderCurrentModule();
  `,
  context,
);

assert.equal(
  document.getElementById('previous-button').disabled,
  true,
  'Previous must be disabled on question 1 of every section',
);

vm.runInContext('navigateQuestion(-1)', context);
assert.deepEqual(
  JSON.parse(
    vm.runInContext(
      'JSON.stringify([app.currentIndex, app.currentQuestionIndex])',
      context,
    ),
  ),
  [1, 0],
  'Previous must not move from question 1 into the preceding section',
);

vm.runInContext(
  `
    app.currentQuestionIndex = 1;
    renderCurrentModule();
  `,
  context,
);
assert.equal(
  document.getElementById('previous-button').disabled,
  false,
  'Previous must remain available after question 1',
);

vm.runInContext('navigateQuestion(-1)', context);
assert.deepEqual(
  JSON.parse(
    vm.runInContext(
      'JSON.stringify([app.currentIndex, app.currentQuestionIndex])',
      context,
    ),
  ),
  [1, 0],
  'Previous must navigate within the current section',
);

vm.runInContext(
  `
    app.currentIndex = 0;
    app.currentQuestionIndex = 1;
    app.viewMode = 'question';
    renderCurrentModule();
  `,
  context,
);
assert.equal(
  document.getElementById('next-button').disabled,
  false,
  'Next must remain available on the final question so Finished can open',
);

vm.runInContext('navigateQuestion(1)', context);
assert.deepEqual(
  JSON.parse(
    vm.runInContext(
      'JSON.stringify([app.currentIndex, app.currentQuestionIndex, app.viewMode])',
      context,
    ),
  ),
  [0, 1, 'module-complete'],
  'Next on the final question must keep the cursor and open Finished',
);
assert.match(
  document.getElementById('questions').innerHTML,
  />Finished</,
  'The completion view must say Finished',
);
assert.match(
  document.getElementById('questions').innerHTML,
  />Back</,
  'The completion view must offer Back',
);
assert.match(
  document.getElementById('questions').innerHTML,
  />Next survey</,
  'The completion view must offer Next survey',
);
assert.match(
  document.getElementById('questions').innerHTML,
  /data-finished-back[\s\S]*data-finished-validation[\s\S]*data-finished-next/,
  'Run validation must be the middle completion action',
);
assert.match(
  document.getElementById('questions').innerHTML,
  /<span class="section-finished-validation-title">Run validation in background<\/span>\s*<span class="section-finished-validation-subtitle">\(recommended\)<\/span>/,
  'The background Validation action must keep its activity label together on the first line',
);
assert.equal(
  document.getElementById('survey-footer').hidden,
  true,
  'The regular question footer must be hidden on Finished',
);

const finishedValidationButton = document
  .getElementById('questions')
  .querySelector('[data-finished-validation]');
const finishedNextButton = document
  .getElementById('questions')
  .querySelector('[data-finished-next]');
assert.equal(
  finishedValidationButton.disabled,
  true,
  'Run validation must stay disabled until its controller is ready',
);

window.updatePersonaValidationAgentBatchState({
  agentBatchActive: false,
  agentBatchControllerReady: true,
});
assert.equal(
  finishedValidationButton.disabled,
  false,
  'Run validation must enable when its controller is ready and idle',
);

let releasePersonaSave;
const pendingPersonaSave = new Promise((resolve) => {
  releasePersonaSave = resolve;
});
context.pendingPersonaSave = pendingPersonaSave;
vm.runInContext('app.saveInFlight = pendingPersonaSave', context);
let validationBatchRequests = 0;
window.requestValidationAgentBatch = () => {
  validationBatchRequests += 1;
  return true;
};

finishedValidationButton.click();
finishedValidationButton.click();
assert.equal(
  finishedValidationButton.disabled,
  true,
  'Run validation must disable synchronously when a start is requested',
);
assert.equal(
  finishedValidationButton.getAttribute('aria-busy'),
  'true',
  'A pending background Validation request must be exposed as busy',
);
await Promise.resolve();
assert.equal(
  validationBatchRequests,
  0,
  'The Agent batch command must wait for the persona save to finish',
);

releasePersonaSave();
await new Promise((resolve) => setTimeout(resolve, 0));
vm.runInContext('app.saveInFlight = null', context);
assert.equal(
  validationBatchRequests,
  1,
  'Repeated clicks during the pending save must dispatch only one Agent batch',
);

window.updatePersonaValidationAgentBatchState({
  agentBatchActive: true,
  agentBatchControllerReady: true,
});
assert.equal(
  finishedValidationButton.disabled,
  true,
  'Run validation must remain disabled throughout the active batch',
);
assert.equal(
  finishedNextButton.disabled,
  false,
  'Starting background Validation must not disable Next survey',
);
finishedNextButton.click();
assert.deepEqual(
  JSON.parse(
    vm.runInContext(
      'JSON.stringify([app.currentIndex, app.currentQuestionIndex, app.viewMode])',
      context,
    ),
  ),
  [1, 0, 'question'],
  'Next survey must remain independent while Validation runs in the background',
);

window.updatePersonaValidationAgentBatchState({
  agentBatchActive: false,
  agentBatchControllerReady: true,
});
vm.runInContext(
  `
    app.currentIndex = 0;
    app.currentQuestionIndex = 1;
    app.viewMode = 'module-complete';
    renderCurrentModule();
  `,
  context,
);
const reenabledValidationButton = document
  .getElementById('questions')
  .querySelector('[data-finished-validation]');
assert.equal(
  reenabledValidationButton.disabled,
  false,
  'Run validation must re-enable after the active batch finishes',
);

let validationBatchStateRequests = 0;
window.requestValidationAgentBatch = () => {
  validationBatchRequests += 1;
  return true;
};
window.requestValidationAgentBatchState = () => {
  validationBatchStateRequests += 1;
};
reenabledValidationButton.click();
await Promise.resolve();
await Promise.resolve();
vm.runInContext('checkPendingValidationBatchAcknowledgement()', context);
assert.equal(
  validationBatchStateRequests,
  1,
  'A start without an active acknowledgement must request fresh controller state',
);
assert.equal(
  reenabledValidationButton.disabled,
  true,
  'The acknowledgement check must keep the start latched until state responds',
);
window.updatePersonaValidationAgentBatchState({
  agentBatchActive: false,
  agentBatchControllerReady: true,
});
assert.equal(
  reenabledValidationButton.disabled,
  false,
  'A ready and inactive acknowledgement must release a rejected start',
);

window.requestValidationAgentBatch = () => {
  validationBatchRequests += 1;
  return false;
};
reenabledValidationButton.click();
assert.equal(
  reenabledValidationButton.disabled,
  true,
  'A rejected start must still disable immediately while it is checked',
);
await Promise.resolve();
await Promise.resolve();
assert.equal(
  reenabledValidationButton.disabled,
  false,
  'A rejected start must clear the pending latch',
);
vm.runInContext('clearTimeout(app.toastTimer); app.toastTimer = null', context);

document
  .getElementById('questions')
  .querySelector('[data-finished-back]')
  .click();
assert.deepEqual(
  JSON.parse(
    vm.runInContext(
      'JSON.stringify([app.currentIndex, app.currentQuestionIndex, app.viewMode])',
      context,
    ),
  ),
  [0, 1, 'question'],
  'Back from Finished must restore the same final question',
);
assert.match(
  document.getElementById('questions').innerHTML,
  /one-b/,
  'Back from Finished must render the final question again',
);
assert.equal(
  document.getElementById('survey-footer').hidden,
  false,
  'Back from Finished must restore the regular question footer',
);

vm.runInContext('navigateQuestion(1)', context);
document
  .getElementById('questions')
  .querySelector('[data-finished-next]')
  .click();
assert.deepEqual(
  JSON.parse(
    vm.runInContext(
      'JSON.stringify([app.currentIndex, app.currentQuestionIndex, app.viewMode])',
      context,
    ),
  ),
  [1, 0, 'question'],
  'Next survey must open the next section in normal question mode',
);

vm.runInContext(
  `
    app.currentIndex = 0;
    app.currentQuestionIndex = 1;
    app.viewMode = 'module-complete';
    renderCurrentModule();
    navigateTo(1);
  `,
  context,
);
assert.equal(
  vm.runInContext('app.viewMode', context),
  'question',
  'Direct sidebar navigation must clear Finished',
);

vm.runInContext(
  `
    app.currentIndex = 1;
    app.currentQuestionIndex = 1;
    app.viewMode = 'question';
    renderCurrentModule();
  `,
  context,
);
assert.equal(
  document.getElementById('next-button').disabled,
  false,
  'The final overall question must also be able to open Finished',
);
vm.runInContext('navigateQuestion(1)', context);
assert.equal(
  vm.runInContext('app.viewMode', context),
  'module-complete',
  'The final overall section must enter Finished',
);
assert.match(
  document.getElementById('questions').innerHTML,
  /data-finished-next disabled/,
  'Next survey must be disabled when no later survey exists',
);
vm.runInContext('navigateQuestion(1)', context);
assert.deepEqual(
  JSON.parse(
    vm.runInContext(
      'JSON.stringify([app.currentIndex, app.currentQuestionIndex, app.viewMode])',
      context,
    ),
  ),
  [1, 1, 'module-complete'],
  'Forward navigation from the final Finished page must be a no-op',
);

vm.runInContext(
  `
    app.currentIndex = 0;
    app.currentQuestionIndex = 1;
    app.viewMode = 'question';
    navigateQuestion(1, { fromAutoAdvance: true });
  `,
  context,
);
assert.equal(
  vm.runInContext('app.viewMode', context),
  'module-complete',
  'Auto-advance from a final answer must open Finished',
);

vm.runInContext(
  `
    app.state.context_id = 'same-context';
    applySurveySnapshot({
      definition: app.definition,
      state: {
        ...app.state,
        answers: { ...app.state.answers },
        visited_modules: [...app.state.visited_modules],
        context_id: 'same-context',
      },
    });
  `,
  context,
);
assert.equal(
  vm.runInContext('app.viewMode', context),
  'module-complete',
  'A same-context refresh must preserve Finished',
);

vm.runInContext(
  `
    applySurveySnapshot({
      definition: {
        ...app.definition,
        modules: app.definition.modules.map((module, index) =>
          index === 0
            ? { ...module, questions: [...module.questions, testQuestion('one-c')] }
            : module,
        ),
      },
      state: {
        ...app.state,
        answers: { ...app.state.answers },
        visited_modules: [...app.state.visited_modules],
        context_id: 'same-context',
      },
    });
  `,
  context,
);
assert.equal(
  vm.runInContext('app.viewMode', context),
  'question',
  'A new later question in the same section must clear Finished',
);

vm.runInContext(
  `
    applySurveySnapshot({
      definition: app.definition,
      state: {
        ...app.state,
        answers: { ...app.state.answers },
        visited_modules: [...app.state.visited_modules],
        context_id: 'replacement-context',
      },
    });
  `,
  context,
);
assert.equal(
  vm.runInContext('app.viewMode', context),
  'question',
  'A persona replacement must clear Finished',
);

console.log(
  'Survey ranking, section boundary, and completion navigation fixtures passed.',
);
