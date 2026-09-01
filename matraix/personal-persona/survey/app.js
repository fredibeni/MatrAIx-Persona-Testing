'use strict';

const app = {
  definition: null,
  state: null,
  currentIndex: 0,
  currentQuestionIndex: 0,
  saveTimer: null,
  saveInFlight: null,
  refreshInFlight: null,
  toastTimer: null,
  advanceTimer: null,
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
  questions: document.getElementById('questions'),
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
    return Array.isArray(answer) && answer.some(Boolean);
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
    if (!Array.isArray(answer)) return 0;
    return Math.min(question.max_rank, new Set(answer.filter(Boolean)).size);
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
        if (Array.isArray(answer)) {
          answer
            .filter(Boolean)
            .slice(0, question.max_rank)
            .forEach((dimId) => completed.add(dimId));
          if (answer.some(Boolean) && question.derived_dimension_id) {
            completed.add(question.derived_dimension_id);
          }
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
  elements.dimensionsAnswered.textContent = String(coverage.answered);
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

function renderRanking(question) {
  const values = Array.isArray(app.state.answers[question.id])
    ? app.state.answers[question.id].filter(Boolean).slice(0, question.max_rank)
    : [];
  const selectedLabels = new Map(
    question.entries.map((entry) => [entry.dimension_id, entry.label]),
  );
  const slots = Array.from({ length: question.max_rank }, (_, rankIndex) => {
    const value = values[rankIndex];
    return `
      <span class="rank-slot${value ? ' filled' : ''}">
        <strong>${rankIndex + 1}</strong>
        ${escapeHtml(value ? selectedLabels.get(value) || value : 'Select a value')}
      </span>
    `;
  }).join('');
  const choices = question.entries
    .map((entry) => {
      const rank = values.indexOf(entry.dimension_id) + 1;
      return `
        <button
          class="rank-choice-button"
          type="button"
          data-rank-value="${escapeHtml(entry.dimension_id)}"
          aria-pressed="${rank > 0 ? 'true' : 'false'}"
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
        <p class="ranking-help">Choose values in order. Select a chosen value again to remove it.</p>
        <div class="ranking-slots" aria-live="polite">${slots}</div>
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
  const selected = values.filter(Boolean).slice(0, question.max_rank);
  const labels = new Map(
    question.entries.map((entry) => [entry.dimension_id, entry.label]),
  );
  const slots = Array.from({ length: question.max_rank }, (_, rankIndex) => {
    const value = selected[rankIndex];
    return `
      <span class="rank-slot${value ? ' filled' : ''}">
        <strong>${rankIndex + 1}</strong>
        ${escapeHtml(value ? labels.get(value) || value : 'Select a value')}
      </span>
    `;
  }).join('');
  const slotContainer = card.querySelector('.ranking-slots');
  if (slotContainer) slotContainer.innerHTML = slots;
  card.querySelectorAll('[data-rank-value]').forEach((button) => {
    const rank = selected.indexOf(button.dataset.rankValue) + 1;
    button.setAttribute('aria-pressed', String(rank > 0));
    const badge = button.querySelector('.rank-choice-position');
    if (badge) badge.textContent = rank ? String(rank) : '';
  });
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
    card.querySelectorAll('[data-rank-value]').forEach((button) => {
      button.addEventListener('click', () => {
        const question = currentQuestionPage()?.question;
        if (!question || question.type !== 'rank_dimensions') return;
        const values = Array.isArray(app.state.answers[questionId])
          ? app.state.answers[questionId]
              .filter(Boolean)
              .slice(0, question.max_rank)
          : [];
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

function renderCurrentModule() {
  const allPages = app.definition.modules.length ? allQuestionPages() : [];
  if (!app.definition.modules.length || !allPages.length) {
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
  const flatIndex = allPages.findIndex(
    (page) =>
      page.moduleIndex === app.currentIndex &&
      page.questionIndex === app.currentQuestionIndex,
  );
  const hasPrevious =
    flatIndex > 0 ||
    (flatIndex < 0 &&
      allPages.some((page) => page.moduleIndex < app.currentIndex));
  const hasNext =
    (flatIndex >= 0 && flatIndex < allPages.length - 1) ||
    (flatIndex < 0 &&
      allPages.some((page) => page.moduleIndex > app.currentIndex));
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
  window.requestAnimationFrame(() => {
    const card = elements.questions.querySelector('.question-card');
    if (!card) return;
    card.setAttribute('tabindex', '-1');
    card.focus({ preventScroll: true });
  });
}

function navigateQuestion(direction, options = {}) {
  if (!options.fromAutoAdvance) clearAutoAdvance();
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

function applySurveySnapshot(snapshot) {
  const previousContextId = app.state?.context_id;
  const previousModuleId = app.definition?.modules?.[app.currentIndex]?.id;
  const previousPageId = currentQuestionPage()?.id;
  clearAutoAdvance();
  app.definition = snapshot.definition;
  app.state = snapshot.state;
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
