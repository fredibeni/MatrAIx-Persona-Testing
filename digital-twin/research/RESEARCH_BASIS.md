# Research basis and limits

This evidence review focuses on person-specific behavioral prediction, memory,
persona prompting, evaluation, and privacy. Results from population simulation,
fictional role-play, or memory question answering are useful design evidence,
but they are not proof that a model can predict one real person in arbitrary
scenarios.

## Main findings

The strongest direct evidence in this review is the preprint
[LLM Agents Grounded in Self-Reports Enable General-Purpose Simulation of Individuals](https://arxiv.org/abs/2411.10109),
which reports a 1,052-person self-report simulation study.
On held-out General Social Survey items, the combined
interview-and-survey agent reached 86% of each participant's own two-week
test-retest consistency. Interview-only reached 83%, survey-only 82%, and a
demographics-only baseline 74%. These are reliability-normalized scores, not a
claim of 86% raw choice accuracy, and the tasks were controlled surveys and
experiments rather than arbitrary real-world decisions.

| Evidence | Finding | Product implication |
| --- | --- | --- |
| [LLM Agents Grounded in Self-Reports Enable General-Purpose Simulation of Individuals](https://arxiv.org/abs/2411.10109) | In this 1,052-participant preprint, the roughly two-hour interview plus structured surveys was strongest on held-out General Social Survey items. It was not strongest on every outcome: interview-only was higher on Big Five and economic-game results, and the economic-game differences between agent types were not significant. Removing 80% of the interview reduced normalized General Social Survey accuracy from 0.83 to 0.79, so two hours was not established as optimal. | Use a substantial adaptive interview plus behavioral measures, report raw and retest-normalized results, and measure the setup-time versus accuracy curve rather than assuming one fixed duration. |
| [Generative Agents](https://doi.org/10.1145/3586183.3606763) | Observation and memory, higher-level reflection, and planning each contributed to believable simulated behavior in ablations. Retrieval was part of the architecture but was not independently isolated by that ablation. | Separate episodes, consolidated claims, retrieval, and decision planning, but test each component directly. Believability is not the fidelity metric. |
| [LoCoMo](https://aclanthology.org/2024.acl-long.747/) | Long-context and retrieval systems improved very-long-conversation memory but still lagged people on temporal and causal reasoning. | Store dates, causal links, and state changes explicitly. Do not rely on one large transcript window. |
| [LongMemEval](https://arxiv.org/abs/2410.10813) | Long-term memory systems struggle with cross-session reasoning, updates, time, and abstention. | Give every record source, time, validity, and supersession fields, and support unknown and abstain outcomes. |
| [PersonaMem](https://arxiv.org/abs/2504.14225) | On curated, simulated user histories, dynamic preference tracking across sessions remained difficult for leading models. This does not by itself establish performance on real longitudinal user histories. | Keep current state and an append-only change history instead of flattening all history into a static profile, then validate on consented real-user data. |
| [Quantifying the Persona Effect](https://aclanthology.org/2024.acl-long.554/) | Demographic, social, and behavioral persona variables explained less than 10% of annotation variance in the studied datasets, and prompt gains depended on relevance to the target. | Do not assume that more dimensions create a better twin. Keep fields only when they help a relevant held-out task. |
| [TRAIT](https://aclanthology.org/2025.findings-naacl.469/) | Model personality depends partly on training and alignment, and prompting has limited control over some traits. | Record model/version and validate scenario choices rather than trusting model self-description or trait labels alone. |
| [PersonaGym](https://aclanthology.org/2025.findings-emnlp.368/) | Ten leading models across 200 assigned personas and 10,000 questions showed substantial room for improvement, and model scale alone did not ensure better persona fidelity. Assigned-persona adherence is not the same as predicting a real person. | Architecture and evaluation matter more than assuming a stronger model will solve persona fidelity, but real-person evaluation remains necessary. |
| [Beyond Raw Transcripts](https://arxiv.org/abs/2608.20344) | In this recent preprint, a fixed Background-Decision procedure-Evaluation structure improved a homogeneous benchmark by 1.91 percentage points over raw transcripts on 50 paired personas, but the same fixed structure did not transfer across heterogeneous tasks. Task-specific structures recovered gains using 30 evaluation personas per eligible sub-study. | Keep the canonical evidence portable, then compile task-specific views. Treat the reported gains as promising but preliminary, and do not lock the product into one universal flat profile. |
| [PersonaBench](https://aclanthology.org/2025.findings-acl.49/) | Personal RAG systems struggled even when given the full set of synthetic private user documents. The benchmark uses synthetic profiles and documents rather than real private histories. | Access to history is not sufficient. Ingestion, entity resolution, temporal normalization, retrieval tests, and regression tests are core product work, followed by consented real-user validation. |
| [Unveiling Privacy Risks in LLM Agent Memory](https://aclanthology.org/2025.acl-long.1227/) | Black-box attacks extracted private information from representative agent-memory systems. | Minimize runtime disclosure, mediate retrieval, redact, log access, and support export and deletion. |
| [Centaur](https://www.nature.com/articles/s41586-025-09215-4) | A model trained on more than 10 million human choices across more than 60,000 participants generalized across many experimental tasks. | A broad behavioral prior can help, but person-specific predictions still require person-specific evidence. |

## ChatGPT product fit

[OpenAI's Projects documentation](https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt)
states that a project can share chats, files, instructions, and connected sources
across its chats. It also states that a ChatGPT Project does not automatically
read an arbitrary local folder, so the owner must upload or connect the sources
they want ChatGPT to use.

[OpenAI's personalization documentation](https://learn.chatgpt.com/docs/personalize)
distinguishes durable instructions from memory. Stable mandatory behavior belongs
in project instructions, while memory can retain useful context from prior work.

[OpenAI's evaluation guidance](https://developers.openai.com/blog/eval-skills)
recommends defining measurable success first, then combining deterministic
checks with rubric-based evaluation and recording regressions. Choiceprint
applies that pattern to personal choice prediction.

## What the research does not justify

The evidence does not justify these claims:

- That a twin is the person.
- That high self-consistency means high human fidelity.
- That Big Five or demographic labels are a decision engine.
- That a long raw chat archive guarantees correct retrieval or prediction.
- That one aggregate validation score generalizes across domains.
- That model-reported confidence is calibrated.
- That a prediction authorizes an external action.

The research supports a narrower product: a testable, evidence-linked predictor
that improves within measured domains and can clearly say when it does not know.
Several supporting benchmarks use synthetic data or assigned personas, so their
architectural lessons need confirmation on consented, longitudinal real-person
data before they support a reliability claim.
