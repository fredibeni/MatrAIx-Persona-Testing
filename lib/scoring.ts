import {
  axisMeta,
  categoryMeta,
  dialLabels,
  sillyTypeMeta,
  type CategoryKey,
  type SurveyDefinition,
  type SurveyQuestion,
} from './surveys.ts';

export type Answers = Record<string, string>;

export interface CategoryResult {
  kind: 'categorical';
  title: string;
  description: string;
  leaders: CategoryKey[];
  scores: Partial<Record<CategoryKey, number>>;
}

export interface DialResult {
  kind: 'scale';
  title: string;
  values: Array<{
    id: string;
    dimension: string;
    value: number;
    label: string;
  }>;
}

export interface SillyResult {
  kind: 'silly';
  title: string;
  description: string;
  code: string;
  raw: number[];
  scores: number[];
}

export type SurveyResult = CategoryResult | DialResult | SillyResult;

export interface Difference {
  question: SurveyQuestion;
  humanAnswer: string;
  personaAnswer: string;
  distance?: number;
}

export interface ComparisonResult {
  similarity: number;
  exactMatches: number;
  withinOne?: number;
  profileSimilarity?: number;
  differences: Difference[];
}

function selectedOption(question: SurveyQuestion, answerId: string) {
  return question.options.find((option) => option.id === answerId);
}

export function answerLabel(question: SurveyQuestion, answerId: string) {
  return selectedOption(question, answerId)?.label ?? 'No answer';
}

function scoreCategories(
  survey: SurveyDefinition,
  answers: Answers,
): CategoryResult {
  const categories = Array.from(
    new Set(
      survey.questions.flatMap((question) =>
        question.options.map((option) => option.category).filter(Boolean),
      ),
    ),
  ) as CategoryKey[];
  const scores: Partial<Record<CategoryKey, number>> = Object.fromEntries(
    categories.map((category) => [category, 0]),
  );

  survey.questions.forEach((question) => {
    const category = selectedOption(question, answers[question.id])?.category;
    if (category) scores[category] = (scores[category] ?? 0) + 1;
  });

  const highest = Math.max(
    ...categories.map((category) => scores[category] ?? 0),
  );
  const leaders = categories.filter((category) => scores[category] === highest);
  if (leaders.length >= 3) {
    return {
      kind: 'categorical',
      title: 'Balanced mix',
      description:
        'Your choices spread across several styles, with no single default taking over.',
      leaders,
      scores,
    };
  }
  if (leaders.length === 2) {
    return {
      kind: 'categorical',
      title: `${categoryMeta[leaders[0]].name} + ${categoryMeta[leaders[1]].name} blend`,
      description: `${categoryMeta[leaders[0]].description} ${categoryMeta[leaders[1]].description}`,
      leaders,
      scores,
    };
  }
  return {
    kind: 'categorical',
    title: categoryMeta[leaders[0]].name,
    description: categoryMeta[leaders[0]].description,
    leaders,
    scores,
  };
}

function scoreDials(survey: SurveyDefinition, answers: Answers): DialResult {
  const values = survey.questions.map((question) => {
    const value = Number(
      selectedOption(question, answers[question.id])?.value ?? 3,
    );
    return {
      id: question.id,
      dimension: question.dimension ?? question.id,
      value,
      label: dialLabels[question.id][value - 1],
    };
  });
  const furthest = Math.max(...values.map((item) => Math.abs(item.value - 3)));
  if (furthest === 0)
    return { kind: 'scale', title: 'Balanced settings', values };
  const headlineMap: Record<string, [string, string]> = {
    structure: ['Go-with-the-flow', 'Plan-first'],
    'social-recharge': ['Solo recharge', 'People-powered'],
    novelty: ['Favorite keeper', 'Adventure-first'],
    'decision-speed': ['Think-it-through', 'Quick-decider'],
    expressiveness: ['Private processor', 'Open book'],
  };
  const titles = values
    .filter((item) => Math.abs(item.value - 3) === furthest)
    .slice(0, 2)
    .map((item) => headlineMap[item.id][item.value < 3 ? 0 : 1]);
  return { kind: 'scale', title: titles.join(' + '), values };
}

function scoreSilly(survey: SurveyDefinition, answers: Answers): SillyResult {
  const raw = [0, 0, 0, 0];
  survey.questions.forEach((question) => {
    const weights = selectedOption(question, answers[question.id])?.weights ?? [
      0, 0, 0, 0,
    ];
    weights.forEach((weight, index) => {
      raw[index] += weight;
    });
  });
  const maxPerAxis = survey.questions.length * 3;
  const scores = raw.map(
    (value) =>
      Math.round(
        Math.max(
          0,
          Math.min(100, ((value + maxPerAxis) / (2 * maxPerAxis)) * 100),
        ) * 10,
      ) / 10,
  );
  const code = scores
    .map((score, index) =>
      score >= 50 ? axisMeta[index].highLetter : axisMeta[index].lowLetter,
    )
    .join('');
  const meta = sillyTypeMeta[code];
  return {
    kind: 'silly',
    title: meta.name,
    description: meta.description,
    code,
    raw,
    scores,
  };
}

export function scoreSurvey(
  survey: SurveyDefinition,
  answers: Answers,
): SurveyResult {
  if (survey.kind === 'categorical') return scoreCategories(survey, answers);
  if (survey.kind === 'scale') return scoreDials(survey, answers);
  return scoreSilly(survey, answers);
}

function categoricalProfileSimilarity(
  human: CategoryResult,
  persona: CategoryResult,
) {
  const categories = Array.from(
    new Set([...Object.keys(human.scores), ...Object.keys(persona.scores)]),
  ) as CategoryKey[];
  const distance = categories.reduce(
    (sum, category) =>
      sum +
      Math.abs((human.scores[category] ?? 0) - (persona.scores[category] ?? 0)),
    0,
  );
  return 1 - distance / 10;
}

export function compareSurvey(
  survey: SurveyDefinition,
  human: Answers,
  persona: Answers,
): ComparisonResult {
  let exactMatches = 0;
  let withinOne = 0;
  const differences: Difference[] = [];
  let similarityTotal = 0;

  survey.questions.forEach((question) => {
    const humanId = human[question.id];
    const personaId = persona[question.id];
    const exact = humanId === personaId;
    if (exact) exactMatches += 1;

    if (survey.kind === 'scale') {
      const humanValue = selectedOption(question, humanId)?.value ?? 0;
      const personaValue = selectedOption(question, personaId)?.value ?? 0;
      const distance = Math.abs(humanValue - personaValue);
      similarityTotal += 1 - distance / 4;
      if (distance <= 1) withinOne += 1;
      if (!exact) {
        differences.push({
          question,
          humanAnswer: `${humanValue} - ${answerLabel(question, humanId)}`,
          personaAnswer: `${personaValue} - ${answerLabel(question, personaId)}`,
          distance,
        });
      }
    } else {
      similarityTotal += exact ? 1 : 0;
      if (!exact) {
        differences.push({
          question,
          humanAnswer: answerLabel(question, humanId),
          personaAnswer: answerLabel(question, personaId),
        });
      }
    }
  });

  let profileSimilarity: number | undefined;
  if (survey.kind === 'categorical') {
    profileSimilarity = categoricalProfileSimilarity(
      scoreSurvey(survey, human) as CategoryResult,
      scoreSurvey(survey, persona) as CategoryResult,
    );
  }
  if (survey.kind === 'silly') {
    const humanResult = scoreSurvey(survey, human) as SillyResult;
    const personaResult = scoreSurvey(survey, persona) as SillyResult;
    profileSimilarity =
      humanResult.scores.reduce(
        (sum, score, index) =>
          sum + (1 - Math.abs(score - personaResult.scores[index]) / 100),
        0,
      ) / humanResult.scores.length;
  }

  return {
    similarity: similarityTotal / survey.questions.length,
    exactMatches,
    withinOne: survey.kind === 'scale' ? withinOne : undefined,
    profileSimilarity,
    differences,
  };
}

export function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}
