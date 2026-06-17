# Result-Aware GraphQL Testing Report

작성일: 2026-06-04

## 1. 실행 목적

`graphql_testing_guide_result_aware.md`의 기준에 맞춰 테스트를 다시 실행했다. 핵심은 full budget 결과와 limited budget 결과를 같은 의미로 해석하지 않는 것이다.

- Full budget 160: harness가 end-to-end로 동작하고, attack-aware 후보군과 oracle이 ground truth를 충분히 회수하는지 확인한다.
- Limited budget 20/40/50: 후보가 budget보다 많은 상황에서 baseline별 ordering/prioritization이 finding 효율에 어떤 차이를 만드는지 평가한다.

따라서 이 리포트의 주장은 다음 범위로 제한한다.

> Local owned GraphQL lab에서 black-box request execution으로 authorization-related finding을 탐지하고, known ground truth로 TP/FP/FN을 평가했다.

## 2. 실행 환경

- 대상 서버: local vulnerable GraphQL lab
- Endpoint: `http://127.0.0.1:3000/graphql`
- Schema source: endpoint introspection
- 평가 방식: black-box execution + ground-truth based evaluation
- Vulnerable ground truth: 26개
- Secure/public/decoy ground truth: 17개

주의: 원본 가이드에는 secure/decoy ground truth가 2개라고 되어 있지만, 현재 서버는 이후 리디자인을 거치며 secure/public/decoy resolver가 17개로 늘어났다. 따라서 이번 결과는 최신 `ground_truth.json` 기준으로 해석한다.

## 3. 실행 명령

컴파일 확인:

```bash
npm run tsc
```

서버 실행:

```bash
./run.sh
```

Full-budget sanity check:

```bash
npm run security:fuzz -- --budget 160 --endpoint http://127.0.0.1:3000/graphql --out 02-independent-testing-program/03-execution-results/security-results-guide-full160
```

Limited-budget multi-seed budget curve:

```bash
npm run security:fuzz -- --profile course --endpoint http://127.0.0.1:3000/graphql --out 02-independent-testing-program/03-execution-results/security-results-guide-budget-curve
```

`course` profile은 다음 조건을 사용한다.

- Methods: `pure-random-schema`, `dependency-only`, `template-only`, `random-attack-gene`, `ga-without-fsm`, `ours`
- Seeds: `1, 2, 3`
- Budgets: `20, 40, 50`

## 4. Full Budget 160 결과

Full budget에서는 후보군 대부분을 실행할 수 있으므로, 이 결과는 prioritization 우수성보다 framework completeness를 확인하는 용도다.

| Method | Budget | Runs | Mean TP | Mean FP | Mean FN | Precision | Recall | F1 | Mean First |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| pure-random-schema | 160 | 1 | 0 | 0 | 26 | n/a | 0.0% | n/a | n/a |
| dependency-only | 160 | 1 | 0 | 0 | 26 | n/a | 0.0% | n/a | n/a |
| template-only | 160 | 1 | 26 | 0 | 0 | 100.0% | 100.0% | 100.0% | 5 |
| random-attack-gene | 160 | 1 | 26 | 0 | 0 | 100.0% | 100.0% | 100.0% | 9 |
| ga-without-fsm | 160 | 1 | 26 | 0 | 0 | 100.0% | 100.0% | 100.0% | 5 |
| ours | 160 | 1 | 26 | 0 | 0 | 100.0% | 100.0% | 100.0% | 3 |

해석:

- Attack-aware method인 `template-only`, `random-attack-gene`, `ga-without-fsm`, `ours`는 모두 TP 26, FP 0, FN 0을 기록했다.
- `pure-random-schema`와 `dependency-only`는 TP 0, FN 26이다. 단순 schema/random 또는 dependency 중심 실행만으로는 authorization finding에 도달하기 어렵다는 신호다.
- `ours`는 first finding 평균이 3 requests로 가장 빠르지만, full budget 결과만으로 “ours가 항상 우월하다”고 주장하면 안 된다.
- Full budget의 핵심 결론은 “attack-aware candidate pool과 authorization oracle이 필요하며, 현재 harness가 end-to-end로 정상 동작한다”이다.

## 5. Limited Budget Multi-Seed 결과

Limited budget에서는 전체 후보군을 모두 실행할 수 없으므로, 어떤 후보를 먼저 실행하는지가 실제 성능 차이를 만든다.

| Budget | Best Method | Mean TP | Mean FP | Mean FN | F1 | Mean First |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 20 | ours | 4.67 | 0 | 21.33 | 0.31 | 2.67 |
| 40 | ours | 13.33 | 0 | 12.67 | 0.68 | 2.67 |
| 50 | ours | 16.33 | 0 | 9.67 | 0.77 | 2.67 |

전체 baseline 평균:

| Method | Budget | Runs | Mean TP | Mean FP | Mean FN | Precision | Recall | F1 | Mean First |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| pure-random-schema | 20 | 3 | 0 | 0 | 26 | n/a | 0.0% | n/a | n/a |
| dependency-only | 20 | 3 | 0 | 0 | 26 | n/a | 0.0% | n/a | n/a |
| template-only | 20 | 3 | 2 | 0 | 24 | 100.0% | 8.0% | 15.0% | 5 |
| random-attack-gene | 20 | 3 | 3.67 | 0 | 22.33 | 100.0% | 14.0% | 25.0% | 5.67 |
| ga-without-fsm | 20 | 3 | 3 | 0 | 23 | 100.0% | 12.0% | 21.0% | 5 |
| ours | 20 | 3 | 4.67 | 0 | 21.33 | 100.0% | 18.0% | 31.0% | 2.67 |
| pure-random-schema | 40 | 3 | 0 | 0 | 26 | n/a | 0.0% | n/a | n/a |
| dependency-only | 40 | 3 | 0 | 0 | 26 | n/a | 0.0% | n/a | n/a |
| template-only | 40 | 3 | 4 | 0 | 22 | 100.0% | 15.0% | 26.0% | 5 |
| random-attack-gene | 40 | 3 | 7 | 0 | 19 | 100.0% | 27.0% | 43.0% | 5.67 |
| ga-without-fsm | 40 | 3 | 6 | 0 | 20 | 100.0% | 23.0% | 37.0% | 5 |
| ours | 40 | 3 | 13.33 | 0 | 12.67 | 100.0% | 51.0% | 68.0% | 2.67 |
| pure-random-schema | 50 | 3 | 0 | 0 | 26 | n/a | 0.0% | n/a | n/a |
| dependency-only | 50 | 3 | 0 | 0 | 26 | n/a | 0.0% | n/a | n/a |
| template-only | 50 | 3 | 5 | 0 | 21 | 100.0% | 19.0% | 32.0% | 5 |
| random-attack-gene | 50 | 3 | 9.33 | 0 | 16.67 | 100.0% | 36.0% | 53.0% | 5.67 |
| ga-without-fsm | 50 | 3 | 6 | 0 | 20 | 100.0% | 23.0% | 37.0% | 5 |
| ours | 50 | 3 | 16.33 | 0 | 9.67 | 100.0% | 63.0% | 77.0% | 2.67 |

## 6. 결과 해석

이번 결과에서 가장 의미 있는 부분은 limited budget curve다.

- Budget 20에서도 `ours`는 평균 TP 4.67로 가장 높고, first finding도 평균 2.67 requests로 가장 빠르다.
- Budget 40에서는 `ours`가 평균 TP 13.33, F1 0.68을 기록했다. 같은 budget의 `random-attack-gene`은 TP 7, `ga-without-fsm`은 TP 6, `template-only`는 TP 4다.
- Budget 50에서는 `ours`가 평균 TP 16.33, F1 0.77을 기록했다. 이는 같은 후보군을 단순 템플릿 순서나 random ordering으로 실행하는 것보다 request budget을 더 효율적으로 썼다는 근거가 된다.
- 모든 evaluated budget에서 FP는 0이다. 현재 서버에는 secure/public/decoy ground truth가 17개 섞여 있으므로, 이 값은 oracle이 secure resolver를 finding으로 과대보고하지 않았다는 중요한 신호다.

다만 이 결과는 다음처럼 조심해서 표현해야 한다.

> 이 프로젝트는 후보가 많고 budget이 제한된 local lab 조건에서 FSM-like state guidance와 GA-style prioritization이 더 빠른 finding discovery를 도울 수 있음을 보였다.

다음처럼 표현하면 과장이다.

> FSM-guided GA가 모든 GraphQL 서버에서 항상 가장 좋다.

## 7. Baseline별 의미

- `pure-random-schema`: schema operation만 보고 요청을 만든다. Authorization-specific sequence나 object ownership 의미를 거의 쓰지 않는다.
- `dependency-only`: input/output dependency와 object pool을 사용하지만 OWASP authorization template은 사용하지 않는다.
- `template-only`: predefined authorization scenario를 고정 순서로 실행한다.
- `random-attack-gene`: 같은 AttackGene 후보군을 random ordering으로 실행한다.
- `ga-without-fsm`: GA-style prioritization은 쓰지만 FSM-like state guidance는 제거한 비교군이다.
- `ours`: AttackGene 후보군, object pool/session state, FSM-like readiness, GA-style prioritization을 함께 사용한다.

## 8. 최종 결론

현재 프로젝트는 수업 프로젝트 관점에서 다음 세 가지를 보여줄 수 있다.

1. 단순 schema/random 기반 GraphQL testing만으로는 authorization finding에 도달하기 어렵다.
2. Attack-aware scenario generation과 authorization oracle을 사용하면 full budget에서 known vulnerable ground truth를 모두 회수할 수 있다.
3. 후보가 많고 budget이 제한된 조건에서는 `ours`가 평균 TP, F1, first finding 측면에서 baseline보다 좋은 prioritization 결과를 보였다.

가장 안전한 발표용 한 문장:

> We built a local, independent GraphQL authorization testing harness and evaluated it on an owned lab server using black-box execution and ground-truth based scoring; under limited budgets, our FSM-like state-aware GA ordering found more true authorization findings earlier than random, dependency-only, template-only, and GA-without-FSM baselines.

## 9. 산출물 위치

- Full budget report: `02-independent-testing-program/03-execution-results/security-results-guide-full160/run_report.md`
- Full budget ground truth comparison: `02-independent-testing-program/03-execution-results/security-results-guide-full160/ground_truth_comparison.json`
- Limited budget report: `02-independent-testing-program/03-execution-results/security-results-guide-budget-curve/run_report.md`
- Limited budget curve: `02-independent-testing-program/03-execution-results/security-results-guide-budget-curve/budget_curve.json`
- Limited budget feedback: `02-independent-testing-program/03-execution-results/security-results-guide-budget-curve/feedback.md`
- Ground truth: `01-test-target-graphql-server/02-ground-truth/ground_truth.json`
