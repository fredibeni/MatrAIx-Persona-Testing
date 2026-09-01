'use strict';

const workspaceElements = {
  tabs: Array.from(document.querySelectorAll('[data-view]')),
  brandName: document.getElementById('persona-brand-name'),
  sidebarBody: document.getElementById('sidebar-workspace-body'),
  surveySidebar: document.getElementById('survey-sidebar'),
  validationSidebar: document.getElementById('validation-sidebar'),
  validationSurveyNav: document.getElementById('validation-survey-nav'),
  chatView: document.getElementById('chat-view'),
  surveyView: document.getElementById('survey-view'),
  validationView: document.getElementById('validation-view'),
};

const chatElements = {
  connection: document.getElementById('chat-connection'),
  surface: document.getElementById('chat-surface'),
  messages: document.getElementById('chat-messages'),
  welcome: document.getElementById('chat-welcome'),
  form: document.getElementById('chat-form'),
  inputLabel: document.getElementById('chat-input-label'),
  input: document.getElementById('chat-input'),
  send: document.getElementById('chat-send'),
  reset: document.getElementById('chat-reset'),
  model: document.getElementById('chat-model'),
  modelSelected: document.getElementById('chat-model-selected'),
  privacyNote: document.getElementById('chat-privacy-note'),
};

const chat = {
  available: false,
  pending: false,
  modelChanging: false,
  messages: [],
  models: [],
  model: '',
  personaName: 'Persona',
};

const validationBridge = {
  channel: 'matraix-validation',
  version: 1,
  snapshot: null,
  contextId: null,
  contextCheckInFlight: null,
  agentBatchRequestPending: false,
  agentBatchAcknowledgementCheck: false,
};
const validationCommandEvent = 'matraix-validation-command';
const validationStateEvent = 'matraix-validation-state';
const validationReloadEvent = 'matraix-validation-reload';

const validationSurveyIdsInOrder = Object.freeze([
  'everyday',
  'dials',
  'plot-twists',
  'internet-creature',
]);
const validationSurveyIds = new Set(validationSurveyIdsInOrder);
const validationViews = new Set([
  'home',
  'quiz',
  'result',
  'comparison',
  'history',
  'license',
]);
const validationHumanStatuses = new Set([
  'not-started',
  'in-progress',
  'complete',
]);

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function validationSnapshotFromMessage(message) {
  if (
    !isRecord(message) ||
    message.channel !== validationBridge.channel ||
    message.version !== validationBridge.version ||
    message.type !== 'state' ||
    !isRecord(message.state)
  ) {
    return null;
  }

  const state = message.state;
  if (!validationViews.has(state.view) || !isRecord(state.totals)) return null;
  if (
    !isNonNegativeInteger(state.totals.completedBenchmarks) ||
    state.totals.completedBenchmarks > validationSurveyIdsInOrder.length ||
    !isNonNegativeInteger(state.totals.completedAgentRuns) ||
    typeof state.agentBatchActive !== 'boolean' ||
    typeof state.agentBatchControllerReady !== 'boolean' ||
    !Array.isArray(state.surveys) ||
    state.surveys.length !== validationSurveyIdsInOrder.length
  ) {
    return null;
  }

  const seen = new Set();
  const surveys = [];
  for (const candidate of state.surveys) {
    if (
      !isRecord(candidate) ||
      !validationSurveyIds.has(candidate.id) ||
      seen.has(candidate.id) ||
      typeof candidate.title !== 'string' ||
      !candidate.title.trim() ||
      !validationHumanStatuses.has(candidate.humanStatus) ||
      !isNonNegativeInteger(candidate.humanAnswered) ||
      !isNonNegativeInteger(candidate.questionCount) ||
      candidate.humanAnswered > candidate.questionCount ||
      !isNonNegativeInteger(candidate.completedAgentRuns) ||
      !(
        candidate.agentDraftAnswered === null ||
        (isNonNegativeInteger(candidate.agentDraftAnswered) &&
          candidate.agentDraftAnswered <= candidate.questionCount)
      )
    ) {
      return null;
    }
    seen.add(candidate.id);
    surveys.push({
      id: candidate.id,
      title: candidate.title.trim(),
      humanStatus: candidate.humanStatus,
      humanAnswered: candidate.humanAnswered,
      questionCount: candidate.questionCount,
      agentDraftAnswered: candidate.agentDraftAnswered,
      completedAgentRuns: candidate.completedAgentRuns,
    });
  }

  if (
    state.activeSurveyId !== undefined &&
    !validationSurveyIds.has(state.activeSurveyId)
  ) {
    return null;
  }
  if (
    state.activeActor !== undefined &&
    !['human', 'agent'].includes(state.activeActor)
  ) {
    return null;
  }

  let activeProgress;
  if (state.activeProgress !== undefined) {
    if (
      !isRecord(state.activeProgress) ||
      !isNonNegativeInteger(state.activeProgress.answered) ||
      !isNonNegativeInteger(state.activeProgress.total) ||
      state.activeProgress.answered > state.activeProgress.total
    ) {
      return null;
    }
    activeProgress = {
      answered: state.activeProgress.answered,
      total: state.activeProgress.total,
    };
  }

  return {
    view: state.view,
    activeSurveyId: state.activeSurveyId,
    activeActor: state.activeActor,
    activeProgress,
    agentBatchActive: state.agentBatchActive,
    agentBatchControllerReady: state.agentBatchControllerReady,
    totals: {
      completedBenchmarks: state.totals.completedBenchmarks,
      completedAgentRuns: state.totals.completedAgentRuns,
    },
    surveys,
  };
}

function postValidationMessage(message) {
  window.dispatchEvent(
    new CustomEvent(validationCommandEvent, {
      detail: {
        channel: validationBridge.channel,
        version: validationBridge.version,
        ...message,
      },
    }),
  );
}

function requestValidationState() {
  postValidationMessage({ type: 'request-state' });
}

function notifyPersonaValidationAgentBatchState(snapshot) {
  if (typeof window.updatePersonaValidationAgentBatchState !== 'function') {
    return;
  }
  window.updatePersonaValidationAgentBatchState({
    agentBatchActive: snapshot?.agentBatchActive === true,
    agentBatchControllerReady: snapshot?.agentBatchControllerReady === true,
  });
}

function requestValidationAgentBatch() {
  const snapshot = validationBridge.snapshot;
  if (
    !snapshot?.agentBatchControllerReady ||
    snapshot.agentBatchActive ||
    validationBridge.agentBatchRequestPending
  ) {
    return false;
  }
  validationBridge.agentBatchRequestPending = true;
  validationBridge.agentBatchAcknowledgementCheck = false;
  postValidationMessage({ type: 'run-agent-batch' });
  return true;
}

function requestValidationAgentBatchState() {
  validationBridge.agentBatchAcknowledgementCheck =
    validationBridge.agentBatchRequestPending;
  requestValidationState();
}

window.requestValidationAgentBatch = requestValidationAgentBatch;
window.requestValidationAgentBatchState = requestValidationAgentBatchState;

function validationHostViewport() {
  if (window.innerWidth <= 650) return 'compact';
  if (window.innerWidth <= 920) return 'medium';
  return 'wide';
}

function syncValidationHostLayout() {
  postValidationMessage({
    type: 'host-layout',
    viewport: validationHostViewport(),
  });
}

function reloadValidationForPersonaChange() {
  validationBridge.snapshot = null;
  validationBridge.agentBatchRequestPending = false;
  validationBridge.agentBatchAcknowledgementCheck = false;
  renderValidationSidebar(null);
  notifyPersonaValidationAgentBatchState(null);
  window.dispatchEvent(new Event(validationReloadEvent));
  if (typeof showToast === 'function') {
    showToast('Persona changed - its Validation history was loaded.');
  }
}

async function refreshValidationPersonaContext() {
  if (validationBridge.contextCheckInFlight) {
    return validationBridge.contextCheckInFlight;
  }
  const operation = chatFetchJson('/api/persona/context');
  validationBridge.contextCheckInFlight = operation;
  try {
    const context = await operation;
    const contextId = context.context_id;
    const previousContextId = validationBridge.contextId;
    if (
      typeof context.display_name === 'string' &&
      context.display_name.trim()
    ) {
      setPersonaIdentity(context.display_name);
      setDocumentTitle(viewFromHash());
    }
    if (typeof contextId === 'string' && contextId.trim()) {
      validationBridge.contextId = contextId;
      if (previousContextId && previousContextId !== contextId) {
        reloadValidationForPersonaChange();
      }
    }
    return context;
  } finally {
    if (validationBridge.contextCheckInFlight === operation) {
      validationBridge.contextCheckInFlight = null;
    }
  }
}

function checkValidationPersonaContext() {
  if (
    document.visibilityState !== 'visible' ||
    window.location.hash !== '#validation'
  ) {
    return;
  }
  refreshValidationPersonaContext().catch(() => {});
}

function navigateValidation(name, surveyId) {
  if (!['home', 'human', 'agent', 'history'].includes(name)) return;
  if (surveyId !== undefined && !validationSurveyIds.has(surveyId)) return;
  postValidationMessage({
    type: 'navigate',
    target: surveyId === undefined ? { name } : { name, surveyId },
  });
}

function createValidationNavItem({ title, active, complete, onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `nav-item validation-nav-item${active ? ' active' : ''}${complete ? ' complete' : ''}`;
  button.setAttribute('aria-current', active ? 'page' : 'false');
  button.addEventListener('click', onClick);

  const label = document.createElement('span');
  label.className = 'nav-label';
  label.textContent = title;

  button.append(label);
  return button;
}

function renderValidationNavigation(snapshot) {
  const activeSurveyId = snapshot?.activeSurveyId;
  const summaries = new Map(
    (snapshot?.surveys || []).map((summary) => [summary.id, summary]),
  );
  workspaceElements.validationSurveyNav.replaceChildren();

  workspaceElements.validationSurveyNav.append(
    createValidationNavItem({
      title: 'Results',
      active: !activeSurveyId,
      complete: false,
      onClick: () => navigateValidation('home'),
    }),
  );

  validationSurveyIdsInOrder.forEach((surveyId, index) => {
    const summary = summaries.get(surveyId);
    workspaceElements.validationSurveyNav.append(
      createValidationNavItem({
        title: `${index + 1}. ${summary?.title ?? 'Survey'}`,
        active: activeSurveyId === surveyId,
        complete: summary?.humanStatus === 'complete',
        onClick: () => navigateValidation('human', surveyId),
      }),
    );
  });
}

function renderValidationSidebar(snapshot) {
  renderValidationNavigation(snapshot);
}

function handleValidationMessage(event) {
  const snapshot = validationSnapshotFromMessage(event.detail);
  if (!snapshot) return;
  const wasActive = validationBridge.snapshot?.agentBatchActive === true;
  validationBridge.snapshot = snapshot;
  if (
    snapshot.agentBatchActive ||
    (wasActive && !snapshot.agentBatchActive) ||
    !snapshot.agentBatchControllerReady ||
    (validationBridge.agentBatchRequestPending &&
      validationBridge.agentBatchAcknowledgementCheck &&
      snapshot.agentBatchControllerReady &&
      !snapshot.agentBatchActive)
  ) {
    validationBridge.agentBatchRequestPending = false;
    validationBridge.agentBatchAcknowledgementCheck = false;
  }
  renderValidationSidebar(snapshot);
  notifyPersonaValidationAgentBatchState(snapshot);
  syncValidationHostLayout();
}

function personaDisplayLabel(name = chat.personaName) {
  return `Digital ${name}`;
}

function setPersonaIdentity(value) {
  const name =
    typeof value === 'string' && value.trim() ? value.trim() : 'Persona';
  chat.personaName = name;
  workspaceElements.brandName.textContent = `MatrAIx ${name}`;
  chatElements.surface.setAttribute('aria-label', `Conversation with ${name}`);
  chatElements.inputLabel.textContent = `Message ${name}`;
}

function setDocumentTitle(view) {
  const titles = {
    chat: `Chat - Digital ${chat.personaName}`,
    survey: `Update persona - Digital ${chat.personaName}`,
    validation: `Validation - Digital ${chat.personaName}`,
  };
  document.title = titles[view] || titles.chat;
}

function viewFromHash() {
  const requested = window.location.hash.slice(1).toLowerCase();
  return ['chat', 'survey', 'validation'].includes(requested)
    ? requested
    : 'chat';
}

function activateView(view, updateHash = true) {
  const selected = ['chat', 'survey', 'validation'].includes(view)
    ? view
    : 'chat';
  const chatSelected = selected === 'chat';
  const surveySelected = selected === 'survey';
  const validationSelected = selected === 'validation';
  const previousView = workspaceElements.tabs.find(
    (tab) => tab.getAttribute('aria-selected') === 'true',
  )?.dataset.view;

  if (previousView && previousView !== selected) {
    window.scrollTo({ top: 0 });
  }

  workspaceElements.sidebarBody.hidden = chatSelected;
  workspaceElements.surveySidebar.hidden = !surveySelected;
  workspaceElements.validationSidebar.hidden = !validationSelected;
  workspaceElements.chatView.hidden = !chatSelected;
  workspaceElements.surveyView.hidden = !surveySelected;
  workspaceElements.validationView.hidden = !validationSelected;

  workspaceElements.tabs.forEach((tab) => {
    const active = tab.dataset.view === selected;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });

  setDocumentTitle(selected);
  if (updateHash) history.replaceState(null, '', `#${selected}`);
  if (chatSelected && chat.available && !chat.pending && !chat.modelChanging) {
    chatElements.input.focus();
  } else if (
    surveySelected &&
    typeof window.refreshPersonaSurvey === 'function'
  ) {
    window.refreshPersonaSurvey(false).catch(() => {});
  } else if (validationSelected) {
    refreshValidationPersonaContext()
      .catch(() => {})
      .finally(requestValidationState);
  }
}

async function chatFetchJson(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(
      data.error || `Request failed with status ${response.status}`,
    );
    error.code = data.code || 'request_failed';
    throw error;
  }
  return data;
}

function setConnection(kind, text) {
  chatElements.connection.className = `connection-chip ${kind}`;
  chatElements.connection.querySelector('span:last-child').textContent =
    text.toLocaleLowerCase();
}

function setComposerState() {
  const enabled = chat.available && !chat.pending && !chat.modelChanging;
  chatElements.input.disabled = !enabled;
  chatElements.send.disabled = !enabled || !chatElements.input.value.trim();
  chatElements.reset.disabled =
    chat.pending || chat.modelChanging || chat.messages.length === 0;
  chatElements.model.disabled = !enabled || chat.models.length === 0;
  chatElements.input.placeholder = chat.available
    ? `Message ${chat.personaName}...`
    : 'Chat is unavailable until Codex is signed in with ChatGPT';
}

function messageElement(message) {
  const article = document.createElement('article');
  article.className = `chat-message ${message.role}`;

  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent =
    message.role === 'assistant' ? personaDisplayLabel() : 'You';

  const body = document.createElement('div');
  body.className = 'message-body';
  body.textContent = message.content;

  article.append(meta, body);
  return article;
}

function thinkingElement() {
  const article = document.createElement('article');
  article.className = 'chat-message assistant thinking-message';
  article.id = 'chat-thinking';

  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = personaDisplayLabel();

  const dots = document.createElement('div');
  dots.className = 'thinking-dots';
  dots.setAttribute('aria-label', 'thinking');
  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement('span');
    dot.setAttribute('aria-hidden', 'true');
    dots.append(dot);
  }

  article.append(meta, dots);
  return article;
}

function renderChat() {
  chatElements.messages.replaceChildren();
  if (chat.messages.length === 0) {
    chatElements.messages.append(chatElements.welcome);
  } else {
    chat.messages.forEach((message) =>
      chatElements.messages.append(messageElement(message)),
    );
  }
  if (chat.pending) chatElements.messages.append(thinkingElement());
  chatElements.messages.scrollTop = chatElements.messages.scrollHeight;
  setComposerState();
}

function shortModelLabel(item) {
  return item?.label?.split(' - ', 1)[0] || 'No models available';
}

function updateSelectedModelLabel(modelId = chatElements.model.value) {
  const selected = chat.models.find((item) => item.id === modelId);
  chatElements.modelSelected.textContent = shortModelLabel(selected);
}

function renderModelOptions(models, selectedModel) {
  chatElements.model.replaceChildren();
  const supported = Array.isArray(models)
    ? models.filter(
        (item) =>
          typeof item?.id === 'string' && typeof item?.label === 'string',
      )
    : [];
  chat.models = supported;
  chat.model = typeof selectedModel === 'string' ? selectedModel : '';

  if (supported.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No models available';
    chatElements.model.append(option);
    updateSelectedModelLabel('');
    return;
  }

  supported.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = shortModelLabel(item);
    chatElements.model.append(option);
  });
  chatElements.model.value = supported.some((item) => item.id === chat.model)
    ? chat.model
    : supported[0].id;
  updateSelectedModelLabel();
}

function applyChatState(state) {
  chat.available = Boolean(state.available);
  chat.messages = Array.isArray(state.messages) ? state.messages : [];
  setPersonaIdentity(state.persona?.name);
  setDocumentTitle(viewFromHash());
  renderModelOptions(state.models, state.model);

  if (chat.available) {
    setConnection('ready', 'Connected');
    chatElements.privacyNote.textContent =
      state.authentication === 'test mode'
        ? 'Local browser test mode. No model call is made.'
        : 'Messages are sent through your ChatGPT subscription.\nNo chat history is retained.';
  } else {
    setConnection('error', 'Codex chat unavailable');
    chatElements.privacyNote.textContent =
      state.error || 'Run codex login and restart this app.';
  }
  renderChat();
}

function showChatError(error) {
  if (typeof showToast === 'function') showToast(error.message, 7000);
  if (error.code === 'chat_unavailable') {
    chat.available = false;
    setConnection('error', 'Codex chat unavailable');
  } else {
    setConnection('error', 'Reply failed - try again');
  }
}

async function initializeChat() {
  try {
    const state = await chatFetchJson('/api/chat/state');
    applyChatState(state);
  } catch (error) {
    chat.available = false;
    setConnection('error', 'Could not connect to local chat');
    chatElements.privacyNote.textContent = error.message;
    renderChat();
  }
}

async function sendMessage(event) {
  event.preventDefault();
  const message = chatElements.input.value.trim();
  if (!message || !chat.available || chat.pending || chat.modelChanging) return;

  const previousMessages = [...chat.messages];
  chat.pending = true;
  chatElements.input.value = '';
  chat.messages = [...chat.messages, { role: 'user', content: message }];
  renderChat();
  setConnection('pending', 'thinking');

  try {
    if (typeof window.flushPersonaSurveySave === 'function') {
      await window.flushPersonaSurveySave();
    }
    const state = await chatFetchJson('/api/chat/message', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
    chat.pending = false;
    applyChatState(state);
  } catch (error) {
    chat.pending = false;
    chat.messages = previousMessages;
    showChatError(error);
    renderChat();
  }
}

async function resetConversation() {
  if (chat.pending || chat.modelChanging) return;
  chatElements.reset.disabled = true;
  try {
    const state = await chatFetchJson('/api/chat/reset', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    applyChatState(state);
    chatElements.input.focus();
  } catch (error) {
    showChatError(error);
    setComposerState();
  }
}

async function changeModel() {
  const requestedModel = chatElements.model.value;
  const previousModel = chat.model;
  updateSelectedModelLabel(requestedModel);
  if (
    !chat.available ||
    chat.pending ||
    chat.modelChanging ||
    !requestedModel ||
    requestedModel === previousModel
  )
    return;

  chat.modelChanging = true;
  setComposerState();
  setConnection('pending', 'Changing model');
  try {
    const state = await chatFetchJson('/api/chat/model', {
      method: 'POST',
      body: JSON.stringify({ model: requestedModel }),
    });
    chat.modelChanging = false;
    applyChatState(state);
  } catch (error) {
    chat.modelChanging = false;
    chatElements.model.value = previousModel;
    updateSelectedModelLabel(previousModel);
    if (typeof showToast === 'function') showToast(error.message, 7000);
    setConnection('error', 'Model change failed');
    setComposerState();
  }
}

function resizeComposer() {
  chatElements.input.style.height = 'auto';
  chatElements.input.style.height = `${Math.min(chatElements.input.scrollHeight, 150)}px`;
  setComposerState();
}

workspaceElements.tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const view = tab.dataset.view;
    if (view === 'validation' && tab.classList.contains('active')) {
      navigateValidation('home');
      return;
    }
    activateView(view);
  });
  tab.addEventListener('keydown', (event) => {
    const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    const directKeys = ['Home', 'End'];
    if (![...arrowKeys, ...directKeys].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = workspaceElements.tabs.indexOf(tab);
    let nextIndex;
    if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = workspaceElements.tabs.length - 1;
    } else {
      const backwards = ['ArrowUp', 'ArrowLeft'].includes(event.key);
      const direction = backwards ? -1 : 1;
      nextIndex =
        (currentIndex + direction + workspaceElements.tabs.length) %
        workspaceElements.tabs.length;
    }
    workspaceElements.tabs[nextIndex].focus();
    activateView(workspaceElements.tabs[nextIndex].dataset.view);
  });
});

chatElements.form.addEventListener('submit', sendMessage);
chatElements.reset.addEventListener('click', resetConversation);
chatElements.model.addEventListener('change', changeModel);
chatElements.input.addEventListener('input', resizeComposer);
chatElements.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    chatElements.form.requestSubmit();
  }
});

window.addEventListener('hashchange', () => {
  const selected = viewFromHash();
  activateView(selected, window.location.hash !== `#${selected}`);
});

window.addEventListener('active-persona-changed', (event) => {
  const name = event.detail?.name;
  const contextId = event.detail?.contextId;
  if (typeof name === 'string' && name.trim()) {
    setPersonaIdentity(name);
    setDocumentTitle(viewFromHash());
  }
  if (typeof contextId === 'string' && contextId.trim()) {
    const previousContextId = validationBridge.contextId;
    validationBridge.contextId = contextId;
    if (previousContextId && previousContextId !== contextId) {
      reloadValidationForPersonaChange();
    }
  }
});

window.addEventListener('resize', syncValidationHostLayout);
window.addEventListener(validationStateEvent, handleValidationMessage);
renderValidationSidebar(null);
syncValidationHostLayout();
requestValidationState();

const initialView = viewFromHash();
activateView(initialView, window.location.hash !== `#${initialView}`);
void initializeChat();
setInterval(checkValidationPersonaContext, 2500);
