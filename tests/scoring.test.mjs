import assert from 'node:assert/strict';
import { compareSurvey, scoreSurvey } from '../lib/scoring.ts';
import { surveyById, surveys } from '../lib/surveys.ts';

function answersFor(survey, optionIndex) {
  return Object.fromEntries(
    survey.questions.map((question) => [question.id, question.options[optionIndex].id]),
  );
}

assert.deepEqual(
  surveys.map((survey) => survey.questions.length),
  [5, 5, 5, 28],
  'the four surveys must remain independent and complete',
);

const everyday = surveyById.everyday;
const everydayA = answersFor(everyday, 0);
const everydayB = answersFor(everyday, 1);
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
assert.equal(dialComparison.differences.every((item) => item.distance === 4), true);

const silly = surveyById['internet-creature'];
const sillyA = answersFor(silly, 0);
const sillyB = answersFor(silly, 1);
const sillyResult = scoreSurvey(silly, sillyA);
assert.equal(sillyResult.kind, 'silly');
assert.equal(sillyResult.code.length, 4);
assert.equal(sillyResult.scores.length, 4);
assert.equal(sillyResult.scores.every((score) => score >= 0 && score <= 100), true);

const sillyComparison = compareSurvey(silly, sillyA, sillyB);
assert.equal(sillyComparison.similarity, 0);
assert.equal(sillyComparison.differences.length, 28);
assert.equal(typeof sillyComparison.profileSimilarity, 'number');

console.log('Survey scoring fixtures passed.');
