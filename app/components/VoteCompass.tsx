"use client";

import { useMemo, useState } from "react";

const questions = [
  { id: "health", topic: "Manx Care", text: "Major health-service reform should take priority even if it disrupts current structures." },
  { id: "wind", topic: "Energy", text: "The Island should move quickly on offshore wind, provided community and environmental safeguards are enforceable." },
  { id: "housing", topic: "Housing", text: "Government should intervene more directly to increase affordable housing supply." },
  { id: "tax", topic: "Public finances", text: "Protecting essential services matters more than avoiding every increase in taxation." },
  { id: "reform", topic: "Government", text: "Clear named accountability and measurable delivery targets should be required across government." },
] as const;

const choices = [
  { value: 1, label: "Strongly disagree" },
  { value: 2, label: "Disagree" },
  { value: 3, label: "Unsure" },
  { value: 4, label: "Agree" },
  { value: 5, label: "Strongly agree" },
] as const;

export function VoteCompass() {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [current, setCurrent] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const answered = Object.keys(answers).length;
  const question = questions[current];
  const progress = Math.round((answered / questions.length) * 100);

  const result = useMemo(() => {
    const ranked = questions
      .map((item) => ({ topic: item.topic, score: answers[item.id] ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    return ranked;
  }, [answers]);

  function choose(value: number) {
    setAnswers((previous) => ({ ...previous, [question.id]: value }));
  }

  function next() {
    if (!answers[question.id]) return;
    if (current === questions.length - 1) {
      setShowResult(true);
      return;
    }
    setCurrent((value) => value + 1);
  }

  function reset() {
    setAnswers({});
    setCurrent(0);
    setShowResult(false);
  }

  if (showResult) {
    return (
      <section className="shell compass-result" aria-live="polite">
        <div className="result-card">
          <p className="eyebrow eyebrow-dark">Your priority signal</p>
          <h2>{result.map((item) => item.topic).join(" + ")}</h2>
          <p>
            These are the topics on which you expressed the strongest preference.
            Candidate matching will activate only when the reviewed manifesto and
            interview evidence is sufficiently complete and comparable.
          </p>
          <div className="result-bars">
            {questions.map((item) => (
              <div key={item.id}>
                <span>{item.topic}</span>
                <i><b style={{ width: `${((answers[item.id] ?? 0) / 5) * 100}%` }} /></i>
              </div>
            ))}
          </div>
          <button className="button button-ink" onClick={reset} type="button">Clear my answers</button>
        </div>
        <aside className="result-explainer">
          <span aria-hidden="true">✓</span>
          <h3>No candidate recommendation yet</h3>
          <p>
            Publishing a match against incomplete positions would create false
            certainty. The production compass will show evidence coverage and
            explain every scoring contribution.
          </p>
        </aside>
      </section>
    );
  }

  return (
    <section className="shell compass-workspace">
      <div className="compass-progress" aria-label={`${progress}% complete`}>
        <div><span>Question {current + 1} of {questions.length}</span><strong>{progress}%</strong></div>
        <i><b style={{ width: `${progress}%` }} /></i>
      </div>
      <div className="question-card">
        <span className="question-topic">{question.topic}</span>
        <h2>{question.text}</h2>
        <div className="choice-grid" role="radiogroup" aria-label="Choose your response">
          {choices.map((choice) => (
            <button
              aria-checked={answers[question.id] === choice.value}
              className={answers[question.id] === choice.value ? "is-selected" : ""}
              key={choice.value}
              onClick={() => choose(choice.value)}
              role="radio"
              type="button"
            >
              <span>{choice.value}</span>
              {choice.label}
            </button>
          ))}
        </div>
        <div className="question-actions">
          <button
            className="back-button"
            disabled={current === 0}
            onClick={() => setCurrent((value) => Math.max(0, value - 1))}
            type="button"
          >
            ← Previous
          </button>
          <button className="button button-coral" disabled={!answers[question.id]} onClick={next} type="button">
            {current === questions.length - 1 ? "See my priorities" : "Next question"} →
          </button>
        </div>
      </div>
      <p className="compass-method-note">
        This preview measures topic preference only. It does not yet compare you
        with candidates and does not store answers between visits.
      </p>
    </section>
  );
}
