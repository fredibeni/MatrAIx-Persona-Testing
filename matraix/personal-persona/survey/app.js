'use strict';

const app = {
  definition: null,
  state: null,
  personaDimensionCount: null,
  currentIndex: 0,
  currentQuestionIndex: 0,
  viewMode: 'question',
  saveTimer: null,
  saveInFlight: null,
  refreshInFlight: null,
  toastTimer: null,
  advanceTimer: null,
  agentBatchActive: false,
  agentBatchControllerReady: false,
  agentBatchRequestPending: false,
  agentBatchAcknowledgementTimer: null,
  agentBatchAcknowledgementCheck: false,
};

const elements = {
  nav: document.getElementById('module-nav'),
  overallPercent: document.getElementById('overall-percent'),
  overallBar: document.getElementById('overall-bar'),
  overallDetail: document.getElementById('overall-detail'),
  remainingTime: document.getElementById('remaining-time'),
  dimensionsAnswered: document.getElementById('dimensions-answered'),
  dimensionsTotal: document.getElementById('dimensions-total'),
  moduleKicker: document.getElementById('module-kicker'),
  moduleTitle: document.getElementById('module-title'),
  moduleSummary: document.getElementById('module-summary'),
  surveyView: document.getElementById('survey-view'),
  questions: document.getElementById('questions'),
  footer: document.getElementById('survey-footer'),
  previous: document.getElementById('previous-button'),
  next: document.getElementById('next-button'),
  saveDot: document.getElementById('save-dot'),
  saveStatus: document.getElementById('save-status'),
  toast: document.getElementById('toast'),
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function fetchJson(url, options = {}) {
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

function setSaveStatus(kind, text) {
  elements.saveDot.className = `save-dot ${kind || ''}`;
  elements.saveStatus.textContent = String(text).toLocaleLowerCase();
}

function showToast(message, duration = 4400) {
  clearTimeout(app.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  app.toastTimer = setTimeout(
    () => elements.toast.classList.remove('show'),
    duration,
  );
}

function isAnswered(question) {
  const answer = app.state.answers[question.id];
  if (question.type === 'dimension_grid') {
    return Boolean(
      answer && typeof answer === 'object' && Object.keys(answer).length,
    );
  }
  if (question.type === 'rank_dimensions') {
    return normaliseQuestionRankingValues(question, answer).length > 0;
  }
  if (question.type === 'free_text') {
    return typeof answer === 'string' && answer.trim().length > 0;
  }
  return answer !== undefined && answer !== null && answer !== '';
}

function visibleGridEntries(question) {
  return question.entries.filter((entry) => !entry.current_high_confidence);
}

function isQuestionFullyHidden(question) {
  if (question.type === 'dimension_grid')
    return visibleGridEntries(question).length === 0;
  return Boolean(question.current_high_confidence);
}

function questionPagesForModule(module) {
  const pages = [];
  module.questions.forEach((question) => {
    if (question.type === 'dimension_grid') {
      visibleGridEntries(question).forEach((entry) => {
        pages.push({
          id: `${question.id}:${entry.dimension_id}`,
          question,
          entry,
        });
      });
      return;
    }
    if (!isQuestionFullyHidden(question)) {
      pages.push({ id: question.id, question, entry: null });
    }
  });
  return pages;
}

function allQuestionPages() {
  return app.definition.modules.flatMap((module, moduleIndex) =>
    questionPagesForModule(module).map((page, questionIndex) => ({
      ...page,
      moduleIndex,
      questionIndex,
    })),
  );
}

function isQuestionPageAnswered(page) {
  if (!page.entry) {
    if (page.question.type === 'rank_dimensions') {
      return (
        questionAnsweredUnits(page.question) ===
        questionTotalUnits(page.question)
      );
    }
    return isAnswered(page.question);
  }
  const answer = app.state.answers[page.question.id];
  const value = answer?.[page.entry.dimension_id];
  return value !== undefined && value !== null && value !== '';
}

function firstUnansweredQuestionIndex(module) {
  const pages = questionPagesForModule(module);
  const firstUnanswered = pages.findIndex(
    (page) => !isQuestionPageAnswered(page),
  );
  return firstUnanswered >= 0 ? firstUnanswered : 0;
}

function questionDefinedUnits(question) {
  if (question.type === 'dimension_grid') return question.entries.length;
  if (question.type === 'rank_dimensions') return question.max_rank;
  return 1;
}

function questionTotalUnits(question) {
  if (question.type === 'dimension_grid')
    return visibleGridEntries(question).length;
  if (question.current_high_confidence) return 0;
  if (question.type === 'rank_dimensions') return question.max_rank;
  return 1;
}

function questionAnsweredUnits(question) {
  if (question.current_high_confidence) return 0;
  const answer = app.state.answers[question.id];
  if (question.type === 'dimension_grid') {
    if (!answer || typeof answer !== 'object') return 0;
    return visibleGridEntries(question).filter((entry) => {
      const value = answer[entry.dimension_id];
      return value !== undefined && value !== null && value !== '';
    }).length;
  }
  if (question.type === 'rank_dimensions') {
    return normaliseQuestionRankingValues(question, answer).length;
  }
  return isAnswered(question) ? 1 : 0;
}

function moduleProgress(module) {
  const definedTotal = module.questions.reduce(
    (sum, question) => sum + questionDefinedUnits(question),
    0,
  );
  const total = module.questions.reduce(
    (sum, question) => sum + questionTotalUnits(question),
    0,
  );
  const answered = module.questions.reduce(
    (sum, question) => sum + questionAnsweredUnits(question),
    0,
  );
  return {
    definedTotal,
    total,
    answered,
    complete: total === 0 || answered === total,
  };
}

function formatMinutes(minutes) {
  if (minutes <= 0.001) return 'Complete';
  const rounded = Math.ceil(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function moduleRemainingMinutes(module, progress) {
  if (!progress.definedTotal) return 0;
  return (
    module.estimated_minutes *
    ((progress.total - progress.answered) / progress.definedTotal)
  );
}

function dimensionCoverage() {
  const completed = new Set(
    app.definition.coverage?.preanswered_dimensions || [],
  );
  const likertByDimension = new Map();

  app.definition.modules.forEach((module) => {
    module.questions.forEach((question) => {
      if (question.type === 'dimension_select' && isAnswered(question)) {
        completed.add(question.dimension_id);
      } else if (question.type === 'dimension_grid') {
        const answer = app.state.answers[question.id];
        if (answer && typeof answer === 'object') {
          question.entries.forEach((entry) => {
            const value = answer[entry.dimension_id];
            if (value !== undefined && value !== null && value !== '') {
              completed.add(entry.dimension_id);
            }
          });
        }
      } else if (question.type === 'likert') {
        if (!likertByDimension.has(question.dimension_id)) {
          likertByDimension.set(question.dimension_id, []);
        }
        likertByDimension.get(question.dimension_id).push(question);
      } else if (question.type === 'rank_dimensions') {
        const answer = app.state.answers[question.id];
        const selected = normaliseQuestionRankingValues(question, answer);
        selected.forEach((dimId) => completed.add(dimId));
        if (selected.length && question.derived_dimension_id) {
          completed.add(question.derived_dimension_id);
        }
      }
    });
  });

  likertByDimension.forEach((questions, dimId) => {
    if (questions.every(isAnswered)) completed.add(dimId);
  });

  return {
    answered: completed.size,
    total: Number(app.definition.coverage?.total_dimensions || 0),
  };
}

function renderSurveyMetrics(coverage, minutesRemaining) {
  elements.remainingTime.textContent = formatMinutes(minutesRemaining);
  const activeDimensionCount = Number.isInteger(app.personaDimensionCount)
    ? app.personaDimensionCount
    : coverage.answered;
  elements.dimensionsAnswered.textContent = String(activeDimensionCount);
  elements.dimensionsTotal.textContent = String(coverage.total);
}

function renderProgress() {
  const modules = app.definition.modules;
  const progressByModule = modules.map(moduleProgress);
  const coverage = dimensionCoverage();
  const percent = coverage.total
    ? Math.round((coverage.answered / coverage.total) * 100)
    : 0;
  const completedModules = progressByModule.filter(
    (progress) => progress.complete,
  ).length;
  const minutesRemaining = modules.reduce(
    (sum, surveyModule, index) =>
      sum + moduleRemainingMinutes(surveyModule, progressByModule[index]),
    0,
  );
  elements.overallPercent.textContent = `${percent}%`;
  elements.overallBar.style.width = `${percent}%`;
  elements.overallDetail.textContent = `${completedModules} of ${modules.length} sections complete`;
  renderSurveyMetrics(coverage, minutesRemaining);
}

function renderNav() {
  elements.nav.innerHTML = '';
  app.definition.modules.forEach((module, index) => {
    const progress = moduleProgress(module);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `nav-item${index === app.currentIndex ? ' active' : ''}${progress.complete ? ' complete' : ''}`;
    button.innerHTML = `
      <span class="nav-label">${index + 1}. ${escapeHtml(module.title)}</span>
    `;
    button.addEventListener('click', () => navigateTo(index));
    elements.nav.appendChild(button);
  });
}

function confidenceLabel(value) {
  const label = String(value ?? '')
    .replaceAll('_', ' ')
    .trim();
  return !label || label.toLowerCase() === 'unknown' ? '' : label;
}

function questionHeading(question) {
  const meta = [];
  const hasCurrentValue =
    question.current_value !== null &&
    question.current_value !== undefined &&
    String(question.current_value).trim() !== '';
  if (hasCurrentValue) {
    const confidence = confidenceLabel(question.current_confidence);
    meta.push(
      `current: ${question.current_value}${confidence ? ` (${confidence})` : ''}`,
    );
  }
  return `
    <div class="question-heading">
      <div>
        <div class="question-title">${escapeHtml(question.prompt)}</div>
        ${meta.length ? `<div class="question-meta">${escapeHtml(meta.join(' - '))}</div>` : ''}
      </div>
    </div>
  `;
}

function renderDimensionSelect(question) {
  const answer = app.state.answers[question.id] ?? '';
  const options = [...question.options];
  if (question.current_value) {
    options.sort((left, right) => {
      if (left.value === question.current_value) return -1;
      if (right.value === question.current_value) return 1;
      return 0;
    });
  }
  const visibleOptions = options.map((option) => ({
    value: option.value,
    label:
      option.label +
      (option.value === question.current_value ? ' - confirm current' : ''),
  }));
  if (question.allow_unknown) {
    visibleOptions.push({
      value: '__unknown__',
      label: 'Unknown - remove any current guess',
    });
  }
  if (question.allow_private) {
    visibleOptions.push({
      value: '__private__',
      label: 'Private - keep out of the runtime persona',
    });
  }
  const choices = visibleOptions
    .map((option, optionIndex) => {
      const inputId = `${question.id}_option_${optionIndex}`;
      return `
        <label class="choice-option" for="${escapeHtml(inputId)}">
          <input type="radio" id="${escapeHtml(inputId)}" name="${escapeHtml(question.id)}" value="${escapeHtml(option.value)}" ${answer === option.value ? 'checked' : ''}>
          <span>${escapeHtml(option.label)}</span>
        </label>
      `;
    })
    .join('');
  return `
    <article class="question-card" data-question-id="${escapeHtml(question.id)}">
      ${questionHeading(question)}
      <div class="choice-list" data-answer-type="dimension_select">${choices}</div>
      ${answer ? '<button class="clear-answer-button" type="button" data-clear-answer>Clear answer</button>' : ''}
    </article>
  `;
}

function renderFreeText(question) {
  const answer = app.state.answers[question.id] ?? '';
  return `
    <article class="question-card" data-question-id="${escapeHtml(question.id)}">
      ${questionHeading(question)}
      <textarea class="field-textarea" data-answer-type="free_text" placeholder="Write as much or as little as is useful...">${escapeHtml(answer)}</textarea>
    </article>
  `;
}

function renderLikert(question) {
  const answer = app.state.answers[question.id];
  const choices = question.scale.map((option) => {
    const inputId = `${question.id}_${option.value}`;
    return `
      <div class="likert-option">
        <input type="radio" id="${escapeHtml(inputId)}" name="${escapeHtml(question.id)}" value="${option.value}" ${Number(answer) === Number(option.value) ? 'checked' : ''}>
        <label for="${escapeHtml(inputId)}">
          <strong>${option.value}</strong>
          <span class="likert-option-label">${escapeHtml(option.label)}</span>
        </label>
      </div>
    `;
  });
  return `
    <article class="question-card" data-question-id="${escapeHtml(question.id)}">
      ${questionHeading(question)}
      <div class="likert" style="--columns: ${question.scale.length}" data-answer-type="likert">${choices.join('')}</div>
    </article>
  `;
}

function renderSingleChoice(question) {
  const answer = app.state.answers[question.id];
  const choices = question.options.map((option) => {
    const inputId = `${question.id}_${option.value}`;
    return `
      <label class="choice-option" for="${escapeHtml(inputId)}">
        <input type="radio" id="${escapeHtml(inputId)}" name="${escapeHtml(question.id)}" value="${escapeHtml(option.value)}" ${answer === option.value ? 'checked' : ''}>
        <span>${escapeHtml(option.label)}</span>
      </label>
    `;
  });
  return `
    <article class="question-card" data-question-id="${escapeHtml(question.id)}">
      ${questionHeading(question)}
      <div class="choice-list" data-answer-type="single_choice">${choices.join('')}</div>
    </article>
  `;
}

function normaliseRankingValues(values, maxRank, allowedValues = null) {
  if (!Array.isArray(values) || !Number.isInteger(maxRank) || maxRank < 1)
    return [];
  const seen = new Set();
  const selected = [];
  for (const value of values) {
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      seen.has(value) ||
      (allowedValues && !allowedValues.has(value))
    )
      continue;
    seen.add(value);
    selected.push(value);
    if (selected.length === maxRank) break;
  }
  return selected;
}

function normaliseQuestionRankingValues(question, values) {
  return normaliseRankingValues(
    values,
    question.max_rank,
    new Set(question.entries.map((entry) => entry.dimension_id)),
  );
}

function moveRankingValue(values, fromIndex, toIndex, maxRank) {
  const selected = normaliseRankingValues(values, maxRank);
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= selected.length ||
    toIndex >= selected.length ||
    fromIndex === toIndex
  ) {
    return selected;
  }
  const reordered = [...selected];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  return reordered;
}

function rankingSlotsMarkup(question, values) {
  const selected = normaliseQuestionRankingValues(question, values);
  const labels = new Map(
    question.entries.map((entry) => [entry.dimension_id, entry.label]),
  );
  return Array.from({ length: question.max_rank }, (_, rankIndex) => {
    const value = selected[rankIndex];
    if (!value) {
      return `
        <li class="rank-slot" data-rank-slot-index="${rankIndex}" role="presentation" aria-hidden="true">
          <strong>${rankIndex + 1}</strong>
          <span class="rank-slot-label">Select a value</span>
        </li>
      `;
    }
    const label = labels.get(value) || value;
    return `
      <li
        class="rank-slot filled"
        data-rank-slot-index="${rankIndex}"
        data-rank-slot-value="${escapeHtml(value)}"
        data-rank-draggable
        tabindex="0"
        aria-label="${escapeHtml(`${label}, rank ${rankIndex + 1} of ${question.max_rank}. ${selected.length} values selected. Drag to reorder or use the arrow keys.`)}"
      >
        <strong aria-hidden="true">${rankIndex + 1}</strong>
        <span class="rank-slot-label">${escapeHtml(label)}</span>
      </li>
    `;
  }).join('');
}

function renderRanking(question) {
  const values = normaliseQuestionRankingValues(
    question,
    app.state.answers[question.id],
  );
  const slots = rankingSlotsMarkup(question, values);
  const choices = question.entries
    .map((entry) => {
      const rank = values.indexOf(entry.dimension_id) + 1;
      return `
        <button
          class="rank-choice-button"
          type="button"
          data-rank-value="${escapeHtml(entry.dimension_id)}"
          aria-pressed="${rank > 0 ? 'true' : 'false'}"
          aria-label="${escapeHtml(rank > 0 ? `${entry.label}, selected at rank ${rank}` : entry.label)}"
        >
          <span class="rank-choice-position">${rank || ''}</span>
          <span>${escapeHtml(entry.label)}</span>
        </button>
      `;
    })
    .join('');
  return `
    <article class="question-card" data-question-id="${escapeHtml(question.id)}">
      ${questionHeading(question)}
      <div class="ranking" data-answer-type="rank_dimensions" data-max-rank="${question.max_rank}">
        <p class="ranking-help">Choose values in order. Drag a selected value to reorder it, or focus it and use the arrow keys. Select a chosen value again to remove it.</p>
        <ol class="ranking-slots" aria-label="Selected values in rank order">${slots}</ol>
        <p class="sr-only" data-rank-status role="status" aria-live="polite" aria-atomic="true"></p>
        <div class="rank-choice-list">${choices}</div>
      </div>
    </article>
  `;
}

function renderGridEntry(question, entry) {
  const answers = app.state.answers[question.id] || {};
  const visibleEntries = visibleGridEntries(question);
  const selected = answers[entry.dimension_id] || '';
  const canSetAllToNone =
    visibleEntries.length > 0 &&
    visibleEntries.every((entry) => entry.options.includes('None'));
  const entryQuestion = {
    ...question,
    prompt: entry.label,
    current_value: entry.current_value,
    current_confidence: entry.current_confidence,
  };
  const choices = entry.options
    .map(
      (value) => `
        <button
          class="grid-choice-button"
          type="button"
          data-grid-dimension="${escapeHtml(entry.dimension_id)}"
          data-grid-value="${escapeHtml(value)}"
          aria-pressed="${selected === value ? 'true' : 'false'}"
        >${escapeHtml(value)}</button>
      `,
    )
    .join('');
  return `
    <article class="question-card" data-question-id="${escapeHtml(question.id)}">
      <p class="grid-page-context">${escapeHtml(question.prompt)}</p>
      ${questionHeading(entryQuestion)}
      <div class="grid-tools">
        ${
          canSetAllToNone
            ? '<button class="secondary-button grid-set-none" type="button" data-set-grid-none>Set all to None</button>'
            : ''
        }
        <span class="grid-count">${canSetAllToNone ? 'Set the baseline, then change exceptions.' : 'Use Next to leave this unanswered.'}</span>
      </div>
      <div class="grid-choice-group grid-page-choices" role="group" aria-label="${escapeHtml(entry.label)}">${choices}</div>
    </article>
  `;
}

function renderQuestion(question) {
  switch (question.type) {
    case 'dimension_select':
      return renderDimensionSelect(question);
    case 'free_text':
      return renderFreeText(question);
    case 'likert':
      return renderLikert(question);
    case 'single_choice':
      return renderSingleChoice(question);
    case 'rank_dimensions':
      return renderRanking(question);
    default:
      return `<article class="question-card">Unsupported question type: ${escapeHtml(question.type)}</article>`;
  }
}

function renderQuestionPage(page) {
  if (page.entry) return renderGridEntry(page.question, page.entry);
  return renderQuestion(page.question);
}

function currentQuestionPage() {
  if (!app.definition?.modules?.length) return null;
  const surveyModule = app.definition.modules[app.currentIndex];
  if (!surveyModule) return null;
  return questionPagesForModule(surveyModule)[app.currentQuestionIndex] || null;
}

function clearAutoAdvance() {
  clearTimeout(app.advanceTimer);
  app.advanceTimer = null;
}

function scheduleAutoAdvance(pageId) {
  clearAutoAdvance();
  app.advanceTimer = setTimeout(() => {
    app.advanceTimer = null;
    if (currentQuestionPage()?.id === pageId) {
      navigateQuestion(1, { fromAutoAdvance: true });
    }
  }, 150);
}

function gridControlsForDimension(card, dimensionId) {
  return Array.from(card.querySelectorAll('[data-grid-dimension]')).filter(
    (control) => control.dataset.gridDimension === dimensionId,
  );
}

function syncGridControlValue(card, dimensionId, value) {
  gridControlsForDimension(card, dimensionId).forEach((control) => {
    control.setAttribute(
      'aria-pressed',
      String(control.dataset.gridValue === value),
    );
  });
}

function syncRankingControls(card, question, values) {
  const selected = normaliseQuestionRankingValues(question, values);
  const slotContainer = card.querySelector('.ranking-slots');
  if (slotContainer)
    slotContainer.innerHTML = rankingSlotsMarkup(question, selected);
  card.querySelectorAll('[data-rank-value]').forEach((button) => {
    const rank = selected.indexOf(button.dataset.rankValue) + 1;
    button.setAttribute('aria-pressed', String(rank > 0));
    const entry = question.entries.find(
      (candidate) => candidate.dimension_id === button.dataset.rankValue,
    );
    const label = entry?.label || button.dataset.rankValue;
    button.setAttribute(
      'aria-label',
      rank > 0 ? `${label}, selected at rank ${rank}` : label,
    );
    const badge = button.querySelector('.rank-choice-position');
    if (badge) badge.textContent = rank ? String(rank) : '';
  });
}

function applyRankingReorder(
  card,
  question,
  questionId,
  movedValue,
  toIndex,
  restoreFocus = false,
) {
  const selected = normaliseQuestionRankingValues(
    question,
    app.state.answers[questionId],
  );
  const fromIndex = selected.indexOf(movedValue);
  const reordered = moveRankingValue(
    selected,
    fromIndex,
    toIndex,
    question.max_rank,
  );
  if (
    selected.length === reordered.length &&
    selected.every((value, index) => reordered[index] === value)
  )
    return false;
  const movedLabel =
    question.entries.find((entry) => entry.dimension_id === movedValue)
      ?.label || movedValue;
  syncRankingControls(card, question, reordered);
  setAnswer(questionId, reordered);
  const status = card.querySelector('[data-rank-status]');
  if (status)
    status.textContent = `Moved ${movedLabel} to rank ${toIndex + 1} of ${question.max_rank}.`;
  if (restoreFocus) {
    window.requestAnimationFrame(() => {
      card
        .querySelector(`.rank-slot.filled[data-rank-slot-index="${toIndex}"]`)
        ?.focus({ preventScroll: true });
    });
  }
  return true;
}

function bindRankingReorderEvents(card, question, questionId) {
  const slotContainer = card.querySelector('.ranking-slots');
  if (!slotContainer) return;
  let pointerDrag = null;

  const selectedValues = () =>
    normaliseQuestionRankingValues(question, app.state.answers[questionId]);
  const slotForValue = (value) =>
    Array.from(
      slotContainer.querySelectorAll('.rank-slot.filled[data-rank-slot-value]'),
    ).find((slot) => slot.dataset.rankSlotValue === value);
  const dropIndexForTarget = (target) => {
    const slot = target?.closest?.('[data-rank-slot-index]');
    const selectedCount = selectedValues().length;
    if (!slot || !selectedCount) return -1;
    const rawIndex = Number(slot.dataset.rankSlotIndex);
    if (!Number.isInteger(rawIndex) || rawIndex < 0) return -1;
    return Math.min(rawIndex, selectedCount - 1);
  };
  const clearDragStyles = () => {
    slotContainer
      .querySelectorAll('.dragging, .drop-target')
      .forEach((slot) => slot.classList.remove('dragging', 'drop-target'));
  };
  const markDropTarget = (targetIndex) => {
    slotContainer
      .querySelectorAll('.drop-target')
      .forEach((slot) => slot.classList.remove('drop-target'));
    slotContainer
      .querySelector(`[data-rank-slot-index="${targetIndex}"]`)
      ?.classList.add('drop-target');
  };
  slotContainer.addEventListener('keydown', (event) => {
    const slot = event.target?.closest?.('.rank-slot.filled');
    if (!slot) return;
    const movedValue = slot.dataset.rankSlotValue;
    const fromIndex = selectedValues().indexOf(movedValue);
    const direction =
      event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? -1
        : event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : 0;
    if (fromIndex < 0 || !direction) return;
    event.preventDefault();
    applyRankingReorder(
      card,
      question,
      questionId,
      movedValue,
      fromIndex + direction,
      true,
    );
  });

  slotContainer.addEventListener('pointerdown', (event) => {
    if (pointerDrag || (event.pointerType === 'mouse' && event.button !== 0))
      return;
    const slot = event.target?.closest?.('.rank-slot.filled');
    if (!slot) return;
    const movedValue = slot.dataset.rankSlotValue;
    if (!movedValue) return;
    const restoreFocus =
      event.pointerType === 'mouse' || document.activeElement === slot;
    if (event.pointerType === 'mouse') slot.focus({ preventScroll: true });
    const rect = slot.getBoundingClientRect();
    pointerDrag = {
      pointerId: event.pointerId,
      movedValue,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      ghost: null,
      restoreFocus,
      active: false,
    };
    slot.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  slotContainer.addEventListener('pointermove', (event) => {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    if (!pointerDrag.active) {
      const distance = Math.hypot(
        event.clientX - pointerDrag.startX,
        event.clientY - pointerDrag.startY,
      );
      if (distance < 6) return;
      pointerDrag.active = true;
      slotForValue(pointerDrag.movedValue)?.classList.add('dragging');
      const ghost = slotForValue(pointerDrag.movedValue)?.cloneNode(true);
      if (ghost) {
        ghost.classList.remove('dragging', 'drop-target');
        ghost.classList.add('rank-drag-ghost');
        ghost.removeAttribute('tabindex');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.style.width = `${pointerDrag.width}px`;
        document.body.appendChild(ghost);
        pointerDrag.ghost = ghost;
      }
    }
    if (pointerDrag.ghost) {
      pointerDrag.ghost.style.transform = `translate3d(${event.clientX - pointerDrag.offsetX}px, ${event.clientY - pointerDrag.offsetY}px, 0)`;
    }
    const target = document.elementFromPoint?.(event.clientX, event.clientY);
    const targetIndex = dropIndexForTarget(target);
    if (targetIndex < 0) {
      markDropTarget(-1);
      return;
    }
    markDropTarget(targetIndex);
    event.preventDefault();
  });
  const finishPointerDrag = (event, cancelled = false) => {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    const targetIndex = cancelled
      ? -1
      : dropIndexForTarget(
          document.elementFromPoint?.(event.clientX, event.clientY),
        );
    const { movedValue, active, restoreFocus } = pointerDrag;
    pointerDrag.ghost?.remove();
    pointerDrag = null;
    clearDragStyles();
    if (active && targetIndex >= 0)
      applyRankingReorder(
        card,
        question,
        questionId,
        movedValue,
        targetIndex,
        restoreFocus,
      );
  };
  slotContainer.addEventListener('pointerup', (event) =>
    finishPointerDrag(event),
  );
  slotContainer.addEventListener('pointercancel', (event) =>
    finishPointerDrag(event, true),
  );
  slotContainer.addEventListener('lostpointercapture', (event) =>
    finishPointerDrag(event, true),
  );
}

function bindToggleableRadioInputs(
  card,
  selector,
  questionId,
  pageId,
  parseValue = (value) => value,
) {
  card.querySelectorAll(selector).forEach((input) => {
    input.addEventListener('click', () => {
      const value = parseValue(input.value);
      const current = app.state.answers[questionId];
      const wasSelected =
        typeof value === 'number'
          ? Number(current) === value
          : current === value;
      if (wasSelected) {
        input.checked = false;
        card.querySelector('[data-clear-answer]')?.remove();
        clearAutoAdvance();
        setAnswer(questionId, '');
        return;
      }
      setAnswer(questionId, value);
      scheduleAutoAdvance(pageId);
    });
  });
}

function bindQuestionEvents() {
  elements.questions.querySelectorAll('[data-question-id]').forEach((card) => {
    const questionId = card.dataset.questionId;
    const page = currentQuestionPage();
    const pageId = page?.id;
    bindToggleableRadioInputs(
      card,
      '[data-answer-type="dimension_select"] input',
      questionId,
      pageId,
    );
    const clearAnswer = card.querySelector('[data-clear-answer]');
    if (clearAnswer) {
      clearAnswer.addEventListener('click', () => {
        clearAutoAdvance();
        card.querySelectorAll('input[type="radio"]').forEach((input) => {
          input.checked = false;
        });
        clearAnswer.remove();
        setAnswer(questionId, '');
      });
    }
    const textarea = card.querySelector('[data-answer-type="free_text"]');
    if (textarea) {
      textarea.addEventListener('input', () =>
        setAnswer(questionId, textarea.value),
      );
    }
    bindToggleableRadioInputs(
      card,
      '[data-answer-type="likert"] input',
      questionId,
      pageId,
      Number,
    );
    bindToggleableRadioInputs(
      card,
      '[data-answer-type="single_choice"] input',
      questionId,
      pageId,
    );
    const rankingQuestion = currentQuestionPage()?.question;
    if (rankingQuestion?.type === 'rank_dimensions') {
      bindRankingReorderEvents(card, rankingQuestion, questionId);
    }
    card.querySelectorAll('[data-rank-value]').forEach((button) => {
      button.addEventListener('click', () => {
        const question = currentQuestionPage()?.question;
        if (!question || question.type !== 'rank_dimensions') return;
        const values = normaliseQuestionRankingValues(
          question,
          app.state.answers[questionId],
        );
        const value = button.dataset.rankValue;
        const existingIndex = values.indexOf(value);
        if (existingIndex >= 0) values.splice(existingIndex, 1);
        else if (values.length < question.max_rank) values.push(value);
        else {
          showToast(
            `Choose up to ${question.max_rank} values. Remove one before adding another.`,
          );
          return;
        }
        syncRankingControls(card, question, values);
        setAnswer(questionId, values);
      });
    });
    card.querySelectorAll('button[data-grid-value]').forEach((button) => {
      button.addEventListener('click', () => {
        const values = { ...app.state.answers[questionId] };
        const dimId = button.dataset.gridDimension;
        const wasSelected = button.getAttribute('aria-pressed') === 'true';
        const value = wasSelected ? '' : button.dataset.gridValue;
        if (value) values[dimId] = value;
        else delete values[dimId];
        syncGridControlValue(card, dimId, value);
        setAnswer(questionId, values);
        if (wasSelected) clearAutoAdvance();
        else scheduleAutoAdvance(pageId);
      });
    });
    const setGridNone = card.querySelector('[data-set-grid-none]');
    if (setGridNone) {
      setGridNone.addEventListener('click', () => {
        clearAutoAdvance();
        const values = { ...app.state.answers[questionId] };
        const question = currentQuestionPage()?.question;
        if (!question || question.type !== 'dimension_grid') return;
        let updated = 0;
        visibleGridEntries(question).forEach((entry) => {
          if (!entry.options.includes('None')) return;
          values[entry.dimension_id] = 'None';
          syncGridControlValue(card, entry.dimension_id, 'None');
          updated += 1;
        });
        setAnswer(questionId, values);
        showToast(
          `${updated} dimensions set to None. Change any exceptions in the list.`,
        );
      });
    }
  });
}

function setAnswer(questionId, value) {
  const currentQuestion = currentQuestionPage()?.question;
  const previousAnsweredUnits =
    currentQuestion?.id === questionId
      ? questionAnsweredUnits(currentQuestion)
      : null;
  if (value === '') delete app.state.answers[questionId];
  else app.state.answers[questionId] = value;
  const answeredUnits =
    currentQuestion?.id === questionId
      ? questionAnsweredUnits(currentQuestion)
      : null;
  if (
    previousAnsweredUnits === null ||
    answeredUnits === null ||
    previousAnsweredUnits !== answeredUnits
  ) {
    renderModuleSummary(app.definition.modules[app.currentIndex]);
    renderNav();
    renderProgress();
  }
  queueSave();
}

function renderModuleSummary(module) {
  const progress = moduleProgress(module);
  const questionPages = questionPagesForModule(module);
  const questionIndex = Math.min(
    app.currentQuestionIndex,
    Math.max(0, questionPages.length - 1),
  );
  const questionPercent = questionPages.length
    ? ((questionIndex + 1) / questionPages.length) * 100
    : 100;
  const hidden = progress.definedTotal - progress.total;
  elements.moduleKicker.textContent = `Section ${module.priority}`;
  const hiddenStatus = hidden
    ? `${hidden} established ${hidden === 1 ? 'field' : 'fields'} hidden`
    : '';
  elements.moduleSummary.innerHTML = `
    <div class="summary-row">
      ${module.optional ? '<span class="pill optional">Optional</span>' : ''}
      ${hiddenStatus ? `<span class="question-meta">${hiddenStatus}</span>` : ''}
    </div>
    ${
      questionPages.length
        ? `
          <div class="question-progress-copy">
            <strong>Question ${questionIndex + 1} of ${questionPages.length}</strong>
          </div>
          <div
            class="question-progress-track"
            role="progressbar"
            aria-label="Question progress in this section"
            aria-valuemin="1"
            aria-valuemax="${questionPages.length}"
            aria-valuenow="${questionIndex + 1}"
          >
            <div class="question-progress-bar" style="width: ${questionPercent}%"></div>
          </div>
        `
        : ''
    }
  `;
}

function setSectionFinishedLayout(isFinished) {
  if (isFinished) elements.surveyView.classList.add('section-finished-mode');
  else elements.surveyView.classList.remove('section-finished-mode');
  elements.footer.hidden = isFinished;
}

function nextReviewableModuleIndex() {
  for (
    let index = app.currentIndex + 1;
    index < app.definition.modules.length;
    index += 1
  ) {
    if (questionPagesForModule(app.definition.modules[index]).length) {
      return index;
    }
  }
  return -1;
}

function focusRenderedSurveyContent() {
  window.requestAnimationFrame(() => {
    const target = elements.questions.querySelector(
      '.question-card, .section-finished-title',
    );
    if (!target) return;
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
}

function returnToLastQuestion() {
  if (app.viewMode !== 'module-complete') return;
  clearAutoAdvance();
  app.viewMode = 'question';
  renderCurrentModule();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  focusRenderedSurveyContent();
}

function navigateToNextSurvey() {
  const nextIndex = nextReviewableModuleIndex();
  if (nextIndex < 0) return;
  navigateTo(nextIndex);
}

function validationBatchControlDisabled() {
  return (
    !app.agentBatchControllerReady ||
    app.agentBatchActive ||
    app.agentBatchRequestPending
  );
}

function syncSectionFinishedValidationControl() {
  const button = elements.questions.querySelector('[data-finished-validation]');
  if (!button) return;
  button.disabled = validationBatchControlDisabled();
  button.setAttribute(
    'aria-busy',
    String(app.agentBatchActive || app.agentBatchRequestPending),
  );
}

function clearValidationBatchRequestPending() {
  clearTimeout(app.agentBatchAcknowledgementTimer);
  app.agentBatchAcknowledgementTimer = null;
  app.agentBatchAcknowledgementCheck = false;
  app.agentBatchRequestPending = false;
}

function checkPendingValidationBatchAcknowledgement() {
  clearTimeout(app.agentBatchAcknowledgementTimer);
  app.agentBatchAcknowledgementTimer = null;
  if (!app.agentBatchRequestPending || app.agentBatchActive) return;
  app.agentBatchAcknowledgementCheck = true;
  if (typeof window.requestValidationAgentBatchState === 'function') {
    window.requestValidationAgentBatchState();
    return;
  }
  clearValidationBatchRequestPending();
  syncSectionFinishedValidationControl();
}

function scheduleValidationBatchAcknowledgementCheck() {
  clearTimeout(app.agentBatchAcknowledgementTimer);
  app.agentBatchAcknowledgementCheck = false;
  app.agentBatchAcknowledgementTimer = setTimeout(
    checkPendingValidationBatchAcknowledgement,
    5_000,
  );
}

function updatePersonaValidationAgentBatchState(state) {
  if (
    !state ||
    typeof state.agentBatchActive !== 'boolean' ||
    typeof state.agentBatchControllerReady !== 'boolean'
  ) {
    return;
  }
  const wasActive = app.agentBatchActive;
  app.agentBatchActive = state.agentBatchActive;
  app.agentBatchControllerReady = state.agentBatchControllerReady;
  const rejectedStartConfirmed =
    app.agentBatchRequestPending &&
    app.agentBatchAcknowledgementCheck &&
    app.agentBatchControllerReady &&
    !app.agentBatchActive;
  if (
    app.agentBatchActive ||
    (wasActive && !app.agentBatchActive) ||
    rejectedStartConfirmed ||
    !app.agentBatchControllerReady
  ) {
    clearValidationBatchRequestPending();
  }
  syncSectionFinishedValidationControl();
}

async function runValidationInBackground() {
  if (validationBatchControlDisabled()) return;
  app.agentBatchRequestPending = true;
  syncSectionFinishedValidationControl();

  try {
    await flushPersonaSurveySave();
    if (
      typeof window.requestValidationAgentBatch !== 'function' ||
      window.requestValidationAgentBatch() !== true
    ) {
      clearValidationBatchRequestPending();
      syncSectionFinishedValidationControl();
      showToast('Validation is not ready yet. Try again in a moment.');
      return;
    }
    scheduleValidationBatchAcknowledgementCheck();
  } catch (error) {
    clearValidationBatchRequestPending();
    syncSectionFinishedValidationControl();
    showToast(`Could not start validation: ${error.message}`);
  }
}

function renderSectionFinished() {
  const nextIndex = nextReviewableModuleIndex();
  setSectionFinishedLayout(true);
  elements.questions.innerHTML = `
    <section class="section-finished" aria-labelledby="section-finished-title">
      <h2 id="section-finished-title" class="section-finished-title" tabindex="-1">Finished</h2>
      <div class="section-finished-actions">
        <button class="secondary-button" type="button" data-finished-back>Back</button>
        <button class="secondary-button section-finished-validation" type="button" data-finished-validation>
          <span class="section-finished-validation-title">Run validation in background</span>
          <span class="section-finished-validation-subtitle">(recommended)</span>
        </button>
        <button class="primary-button" type="button" data-finished-next ${nextIndex < 0 ? 'disabled' : ''}>Next</button>
      </div>
    </section>
  `;
  elements.questions
    .querySelector('[data-finished-back]')
    ?.addEventListener('click', returnToLastQuestion);
  elements.questions
    .querySelector('[data-finished-next]')
    ?.addEventListener('click', navigateToNextSurvey);
  elements.questions
    .querySelector('[data-finished-validation]')
    ?.addEventListener('click', () => void runValidationInBackground());
  syncSectionFinishedValidationControl();
  elements.previous.disabled = true;
  elements.next.disabled = true;
  renderNav();
  renderProgress();
}

function renderCurrentModule() {
  const allPages = app.definition.modules.length ? allQuestionPages() : [];
  if (!app.definition.modules.length || !allPages.length) {
    app.viewMode = 'question';
    setSectionFinishedLayout(false);
    elements.nav.innerHTML = '';
    elements.moduleKicker.textContent = 'Persona complete';
    elements.moduleTitle.textContent = 'No missing traits to fill in';
    elements.moduleSummary.innerHTML =
      '<p>Every schema dimension is already filled or intentionally marked unknown or private in the active persona YAML.</p>';
    elements.questions.innerHTML = '';
    elements.previous.disabled = true;
    elements.next.disabled = true;
    renderProgress();
    return;
  }
  const surveyModule = app.definition.modules[app.currentIndex];
  const questionPages = questionPagesForModule(surveyModule);
  app.currentQuestionIndex = Math.min(
    app.currentQuestionIndex,
    Math.max(0, questionPages.length - 1),
  );
  elements.moduleTitle.textContent = surveyModule.title;
  renderModuleSummary(surveyModule);
  if (app.viewMode === 'module-complete' && questionPages.length) {
    renderSectionFinished();
    return;
  }
  app.viewMode = 'question';
  setSectionFinishedLayout(false);
  elements.questions.innerHTML = questionPages.length
    ? renderQuestionPage(questionPages[app.currentQuestionIndex])
    : `
      <article class="question-card empty-section">
        <div class="empty-section-mark">&#10003;</div>
        <div>
          <div class="question-title">Nothing to review in this section</div>
          <p>Every mapped field here already has runtime evidence above best-guess confidence.</p>
        </div>
      </article>
    `;
  bindQuestionEvents();
  const hasPrevious = questionPages.length > 0 && app.currentQuestionIndex > 0;
  const hasNext =
    questionPages.length > 0 ||
    allPages.some((page) => page.moduleIndex > app.currentIndex);
  elements.previous.disabled = !hasPrevious;
  elements.next.disabled = !hasNext;
  elements.previous.textContent = 'Previous';
  elements.next.textContent = 'Next';
  renderNav();
  renderProgress();
}

function navigateTo(index, questionIndex = null, options = {}) {
  if (index < 0 || index >= app.definition.modules.length) return;
  if (!options.fromAutoAdvance) clearAutoAdvance();
  app.viewMode = 'question';
  app.currentIndex = index;
  const surveyModule = app.definition.modules[index];
  const pages = questionPagesForModule(surveyModule);
  app.currentQuestionIndex =
    questionIndex === null
      ? firstUnansweredQuestionIndex(surveyModule)
      : Math.min(Math.max(0, questionIndex), Math.max(0, pages.length - 1));
  const moduleId = app.definition.modules[index].id;
  if (!app.state.visited_modules.includes(moduleId)) {
    app.state.visited_modules.push(moduleId);
    queueSave();
  }
  renderCurrentModule();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  focusRenderedSurveyContent();
}

function navigateQuestion(direction, options = {}) {
  if (!options.fromAutoAdvance) clearAutoAdvance();
  if (app.viewMode === 'module-complete') {
    if (direction < 0) returnToLastQuestion();
    else if (direction > 0) navigateToNextSurvey();
    return;
  }
  if (direction < 0 && app.currentQuestionIndex === 0) return;
  const modulePages = questionPagesForModule(
    app.definition.modules[app.currentIndex],
  );
  if (
    direction > 0 &&
    modulePages.length > 0 &&
    app.currentQuestionIndex >= modulePages.length - 1
  ) {
    app.viewMode = 'module-complete';
    renderCurrentModule();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    focusRenderedSurveyContent();
    return;
  }
  const pages = allQuestionPages();
  if (!pages.length) return;
  const currentIndex = pages.findIndex(
    (page) =>
      page.moduleIndex === app.currentIndex &&
      page.questionIndex === app.currentQuestionIndex,
  );
  let target;
  if (currentIndex >= 0) {
    target = pages[currentIndex + direction];
  } else if (direction > 0) {
    target = pages.find((page) => page.moduleIndex > app.currentIndex);
  } else {
    target = pages
      .slice()
      .reverse()
      .find((page) => page.moduleIndex < app.currentIndex);
  }
  if (!target) return;
  navigateTo(target.moduleIndex, target.questionIndex, options);
}

function queueSave() {
  clearTimeout(app.saveTimer);
  setSaveStatus('saving', 'unsaved changes');
  app.saveTimer = setTimeout(() => void saveState(), 420);
}

async function saveState() {
  clearTimeout(app.saveTimer);
  app.saveTimer = null;
  if (app.saveInFlight) await Promise.resolve(app.saveInFlight);
  setSaveStatus('saving', 'saving locally');
  const payload = {
    answers: app.state.answers,
    visited_modules: app.state.visited_modules,
    context_id: app.state.context_id,
    persona_id: app.state.persona_id,
    baseline_sha256: app.state.baseline_sha256,
    definition_sha256: app.state.definition_sha256,
    save_revision: app.state.save_revision,
  };
  const operation = fetchJson('/api/save', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  app.saveInFlight = operation;
  try {
    const result = await operation;
    app.state.saved_at = result.saved_at;
    app.state.save_revision = result.save_revision;
    app.state.context_id = result.context_id;
    app.state.persona_id = result.persona_id;
    app.state.baseline_sha256 = result.baseline_sha256;
    app.state.definition_sha256 = result.definition_sha256;
    app.state.persona_revision = result.persona_revision;
    if (Number.isInteger(result.persona_dimension_count)) {
      app.personaDimensionCount = result.persona_dimension_count;
    }
    const time = new Date(result.saved_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    setSaveStatus('saved', `saved and persona updated at ${time}`);
  } catch (error) {
    if (error.code === 'persona_changed' || error.code === 'stale_survey') {
      await refreshPersonaSurvey(true);
      return;
    }
    setSaveStatus('error', 'save failed');
    showToast(`Could not save responses: ${error.message}`);
    throw error;
  } finally {
    if (app.saveInFlight === operation) app.saveInFlight = null;
  }
}

async function flushPersonaSurveySave() {
  if (app.saveTimer) {
    await saveState();
    return;
  }
  if (app.saveInFlight) await Promise.resolve(app.saveInFlight);
}

window.flushPersonaSurveySave = flushPersonaSurveySave;
window.updatePersonaValidationAgentBatchState =
  updatePersonaValidationAgentBatchState;

function applySurveySnapshot(snapshot) {
  const previousContextId = app.state?.context_id;
  const previousModuleId = app.definition?.modules?.[app.currentIndex]?.id;
  const previousPageId = currentQuestionPage()?.id;
  const previousViewMode = app.viewMode;
  clearAutoAdvance();
  app.definition = snapshot.definition;
  app.state = snapshot.state;
  app.personaDimensionCount = Number.isInteger(snapshot.persona_dimension_count)
    ? snapshot.persona_dimension_count
    : null;
  app.state.answers = app.state.answers || {};
  app.state.visited_modules = app.state.visited_modules || [];
  const modules = app.definition.modules || [];
  const previousIndex = previousModuleId
    ? modules.findIndex((module) => module.id === previousModuleId)
    : -1;
  const pages = modules.length ? allQuestionPages() : [];
  const contextChanged =
    Boolean(previousContextId) && previousContextId !== app.state.context_id;
  const preservedPage =
    !contextChanged && previousPageId
      ? pages.find((page) => page.id === previousPageId)
      : null;
  const preservedPageIsModuleEnd =
    preservedPage &&
    preservedPage.questionIndex ===
      questionPagesForModule(modules[preservedPage.moduleIndex]).length - 1;
  const firstUnansweredPage = pages.find(
    (page) => !isQuestionPageAnswered(page),
  );
  const firstPageInPreviousModule =
    previousIndex >= 0
      ? pages.find((page) => page.moduleIndex === previousIndex)
      : null;
  const targetPage =
    preservedPage ||
    firstUnansweredPage ||
    firstPageInPreviousModule ||
    pages[0];
  app.viewMode =
    previousViewMode === 'module-complete' &&
    !contextChanged &&
    preservedPage &&
    targetPage?.id === preservedPage.id &&
    preservedPageIsModuleEnd
      ? 'module-complete'
      : 'question';
  app.currentIndex = targetPage?.moduleIndex ?? Math.max(0, previousIndex);
  app.currentQuestionIndex = targetPage?.questionIndex ?? 0;
  if (modules.length) {
    const currentId = modules[app.currentIndex].id;
    if (!app.state.visited_modules.includes(currentId))
      app.state.visited_modules.push(currentId);
  }
  renderCurrentModule();
  const personaName = app.definition.persona?.display_name;
  if (personaName) {
    window.dispatchEvent(
      new CustomEvent('active-persona-changed', {
        detail: {
          name: personaName,
          contextId: app.state.context_id,
          personaId: app.state.persona_id,
        },
      }),
    );
  }
  if (app.state.saved_at) {
    const time = new Date(app.state.saved_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    setSaveStatus('saved', `saved and persona updated at ${time}`);
  } else {
    setSaveStatus('saved', 'ready - autosave updates your persona');
  }
}

async function refreshPersonaSurvey(notifyOnChange = false) {
  if (app.refreshInFlight) return app.refreshInFlight;
  const previousContextId = app.state?.context_id;
  const operation = fetchJson('/api/survey');
  app.refreshInFlight = operation;
  try {
    const snapshot = await operation;
    applySurveySnapshot(snapshot);
    if (
      notifyOnChange &&
      previousContextId &&
      previousContextId !== snapshot.state.context_id
    ) {
      showToast(
        'The persona YAML changed. The unanswered trait survey has been refreshed.',
      );
    }
    return snapshot;
  } catch (error) {
    elements.moduleTitle.textContent = 'Survey could not start';
    elements.questions.innerHTML = `<article class="question-card"><div class="question-title">${escapeHtml(error.message)}</div></article>`;
    setSaveStatus('error', 'startup failed');
    throw error;
  } finally {
    if (app.refreshInFlight === operation) app.refreshInFlight = null;
  }
}

window.refreshPersonaSurvey = refreshPersonaSurvey;

async function checkForPersonaReplacement() {
  if (
    document.visibilityState !== 'visible' ||
    window.location.hash !== '#survey'
  )
    return;
  if (!app.state || app.saveTimer || app.saveInFlight || app.refreshInFlight)
    return;
  try {
    const context = await fetchJson('/api/persona/context');
    if (context.context_id !== app.state.context_id) {
      await refreshPersonaSurvey(true);
    }
  } catch {
    setSaveStatus('error', 'could not check the active persona');
  }
}

async function init() {
  try {
    await refreshPersonaSurvey(false);
  } catch {
    // refreshPersonaSurvey already renders the startup error.
  }
}

elements.previous.addEventListener('click', () => navigateQuestion(-1));
elements.next.addEventListener('click', () => navigateQuestion(1));

window.addEventListener('beforeunload', () => {
  if (app.saveTimer) void saveState();
});

void init();
setInterval(() => void checkForPersonaReplacement(), 2500);
