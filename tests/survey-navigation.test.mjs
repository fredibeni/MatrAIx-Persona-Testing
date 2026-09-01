import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function elementStub() {
  return {
    appendChild() {},
    addEventListener() {},
    classList: {
      add() {},
      remove() {},
    },
    disabled: false,
    focus() {},
    innerHTML: '',
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    setAttribute() {},
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
vm.runInContext(source, context, { filename: 'survey/app.js' });

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

console.log('Survey section boundary navigation fixtures passed.');
