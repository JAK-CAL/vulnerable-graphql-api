# 별도 GA 전략 비교 리포트

작성일: 2026-06-03  
대상 서버: 현재 프로젝트의 로컬 vulnerable GraphQL API  
대상 GA 구현: `GA/cs453-graphql-fuzzer`의 `origin/TUNA/fsm` 기반 코드

## 1. 비교 목적

이번 비교의 목적은 우리가 기존에 만든 authorization regression harness와, `GA` 폴더에 따로 추가된 FSM-GA 기반 GraphQL fuzzer를 같은 로컬 서버에 대해 실행해 보고 어떤 전략이 팀 프로젝트 목표에 더 잘 맞는지 확인하는 것이다.

우리 프로젝트의 핵심 목표는 일반적인 GraphQL fuzzing이 아니라, 수업 프로젝트용 자동화 테스트 관점에서 다음을 확인하는 것이다.

- 두 개의 로컬 dummy user session을 사용한다.
- 로컬에서 생성한 object pool을 유지한다.
- BOLA, BFLA, BOPLA, stale object access 같은 authorization regression scenario를 실행한다.
- 기대한 authorization check가 빠졌는지 ground truth 기반으로 판단한다.
- random, template, GA-prioritized ordering을 같은 기준으로 비교한다.

따라서 단순히 finding 개수가 많은 도구가 항상 더 좋은 것은 아니다. finding이 실제 authorization regression ground truth에 맞는지, FP/FN을 계산할 수 있는지, 같은 budget에서 얼마나 빨리 의미 있는 finding을 찾는지가 더 중요하다.

## 2. 실행한 별도 GA 구현

별도 GA 구현은 다음 위치에 있다.

```text
GA/cs453-graphql-fuzzer
```

초기에는 README만 있는 브랜치가 체크아웃되어 있었고, 실제 FSM-GA 구현은 원격 브랜치에 있었다. 이번 비교에서는 다음 브랜치를 기준으로 실행했다.

```text
origin/TUNA/fsm
```

로컬에서는 다음 브랜치를 만들어 실행했다.

```text
codex/fsm-run
```

주요 구성은 다음과 같다.

- `fuzzer/cli.py`: CLI entry point
- `fuzzer/runners/fsm_ga.py`: FSM-GA runner
- `fuzzer/runners/random_graphql.py`: random GraphQL baseline
- `fuzzer/runners/random_sequence.py`: random sequence baseline
- `fuzzer/runners/auth_mutation_only.py`: auth-only baseline
- `fuzzer/runners/query_shape_only.py`: query-shape-only baseline
- `fuzzer/ga/`: chromosome, fitness, selection, mutation, crossover
- `fuzzer/fsm/`: security state machine, planner, oracle

## 3. 추가한 실행 설정

비교를 위해 별도 GA 프로젝트 안에 로컬 서버용 config를 추가했다.

```text
GA/cs453-graphql-fuzzer/configs/codex_compare_fsm_ga.yaml
GA/cs453-graphql-fuzzer/configs/codex_compare_random_graphql.yaml
GA/cs453-graphql-fuzzer/configs/codex_compare_random_sequence.yaml
GA/cs453-graphql-fuzzer/configs/codex_compare_auth_only.yaml
GA/cs453-graphql-fuzzer/configs/codex_compare_query_shape_only.yaml
```

공통 실행 조건은 다음과 같다.

- Endpoint: `http://127.0.0.1:3000/graphql`
- Server reset hook: 사용하지 않음
- Random seed: `1337`
- Request delay: `10ms`
- Max sequence length: `6`
- FSM-GA population size: `8`
- FSM-GA generations: `3`
- FSM-GA request budget: `90`
- Baseline iterations: `24`

주의할 점은 별도 GA 구현의 runner별 budget 단위가 완전히 같지 않다는 것이다. FSM-GA는 `request_budget` 중심이고, baseline들은 `iterations` 중심으로 동작한다. 그래서 이 결과는 “정밀한 동일 budget 논문식 비교”라기보다, 같은 로컬 서버에서 별도 구현의 현재 동작 특성을 확인하는 실험으로 해석해야 한다.

## 4. 별도 GA 구현 실행 결과

결과 디렉터리는 다음과 같다.

```text
GA/cs453-graphql-fuzzer/results/codex_compare_fsm_ga
GA/cs453-graphql-fuzzer/results/codex_compare_random_graphql
GA/cs453-graphql-fuzzer/results/codex_compare_random_sequence
GA/cs453-graphql-fuzzer/results/codex_compare_auth_only
GA/cs453-graphql-fuzzer/results/codex_compare_query_shape_only
```

요약 결과는 다음과 같다.

| Runner | Total findings | Unique findings | Auth findings | Cost findings | State coverage | Transition coverage | Operation coverage | Final recorded requests |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| FSM-GA | 2 | 2 | 2 | 0 | 10 | 6 | 5 | 8 |
| Random GraphQL | 7 | 7 | 6 | 1 | 10 | 14 | 13 | 37 |
| Random Sequence | 30 | 30 | 27 | 3 | 10 | 21 | 22 | 136 |
| Auth Mutation Only | 116 | 116 | 110 | 6 | 10 | 1 | 22 | 132 |
| Query Shape Only | 11 | 10 | 8 | 3 | 10 | 1 | 22 | 76 |

`Final recorded requests`는 결과 파일에 남아 있는 최종 sequence 기준 요청 수다. FSM-GA의 surface probing이나 중간 generation에서 사용된 요청 전체를 정확히 나타내는 값은 아니므로, 실제 요청 budget과 동일하게 해석하면 안 된다.

## 5. FSM-GA 내부 generation 변화

FSM-GA의 generation summary는 다음과 같았다.

| Generation | Best fitness | Avg fitness | Total findings | Auth findings | State coverage | Transition coverage |
|---:|---:|---:|---:|---:|---:|---:|
| 0 | 60.5 | 23.9375 | 4 | 4 | 10 | 11 |
| 1 | 61.5 | 48.3125 | 12 | 12 | 10 | 6 |
| 2 | 61.5 | 15.6875 | 2 | 2 | 10 | 6 |

여기서 중요한 관찰은 best fitness가 0세대에서 1세대로 증가했다는 점이다. 즉 GA 선택과 fitness 계산 자체는 동작한다. 하지만 최종 결과 기준 finding 수는 2개로 줄었다. 이는 현재 구현이 “실험 전체에서 발견된 best-ever finding archive”를 유지하기보다, 마지막 population 또는 마지막 평가 결과 중심으로 결과를 남기는 구조일 가능성이 크다.

수업 프로젝트 리포트 관점에서는 이 부분이 매우 중요하다. GA가 중간에 좋은 후보를 만들었더라도 최종 결과 저장 방식이 그것을 보존하지 못하면, regression testing harness로서는 유용성이 떨어진다.

## 6. 별도 GA의 finding 의미

별도 GA 구현은 finding을 주로 다음과 같은 넓은 범주로 기록한다.

- `AUTH_BYPASS_CANDIDATE`
- `DOS_COST_ANOMALY`

이 방식은 일반적인 security fuzzing에는 유용할 수 있지만, 우리 프로젝트의 authorization regression 목표와는 기준이 다르다. 우리 harness는 다음과 같이 더 구체적인 ground truth label을 사용한다.

- `BOLA_READ`
- `BOLA_UPDATE_DELETE`
- `STALE_OBJECT_ACCESS`
- `BFLA_ADMIN_LIKE_OP`
- `BOPLA_SENSITIVE_FIELD_READ`

따라서 별도 GA의 unique finding 수를 우리 harness의 TP와 직접 비교하면 안 된다. 별도 GA는 “수상한 응답 후보”를 많이 세는 쪽이고, 우리 harness는 “정해진 authorization regression oracle에 맞는 실제 TP/FP/FN”을 계산하는 쪽이다.

## 7. 기존 우리 harness와 비교

기존 우리 harness의 course comparison 결과는 다음 위치에 있다.

```text
security-results-course-graphqler-compare/run_report.md
```

대표 결과는 budget 50, seed 1/2/3 평균 기준 다음과 같다.

| Strategy | Mean TP | Mean FP | Mean FN | Mean recall | Mean F1 | Mean first finding |
|---|---:|---:|---:|---:|---:|---:|
| ours | 18.33 | 0 | 7.67 | 0.71 | 0.83 | 2.67 |
| random-attack-gene | 15.67 | 0 | 10.33 | 0.60 | 0.75 | 6.67 |
| ga-without-fsm | 14.00 | 0 | 12.00 | 0.54 | 0.70 | 10.67 |
| template-only | 11.00 | 0 | 15.00 | 0.42 | 0.59 | 5.00 |

이 결과는 우리 harness가 수업 프로젝트 목표에 더 직접적으로 맞는다는 것을 보여준다.

- 같은 authorization regression ground truth를 사용한다.
- TP, FP, FN을 계산할 수 있다.
- budget curve와 multi-seed 평균을 낼 수 있다.
- FSM-guided prioritization이 random/template/GA-without-FSM 대비 더 나은 recall과 F1을 보인다.
- first finding도 빠르게 나온다.

반면 별도 GA 구현은 흥미로운 fuzzing framework이지만, 현재 상태 그대로는 우리 프로젝트의 최종 평가 지표에 바로 넣기 어렵다.

## 8. 별도 GA 구현의 장점

별도 GA 구현에서 참고할 만한 부분도 분명히 있다.

첫째, active surface probing이 있다. 실행 초기에 endpoint의 operation surface를 탐색해서 가능한 operation pool을 구성하려는 구조는 좋다.

둘째, FSM state와 transition coverage를 명시적으로 기록한다. 우리 프로젝트도 FSM-guided prioritization이라고 설명하기 때문에, coverage 관찰값을 리포트에 포함하는 아이디어는 유용하다.

셋째, GA loop가 별도 runner로 분리되어 있다. population, selection, mutation, crossover, fitness 계산이 비교적 명확한 모듈로 나뉘어 있어 구조적으로 참고할 수 있다.

넷째, 여러 baseline runner가 같은 CLI 안에 있다. random GraphQL, random sequence, auth-only, query-shape-only 같은 baseline을 나란히 실행할 수 있는 구성은 실험 설계 측면에서 좋다.

## 9. 별도 GA 구현의 한계

현재 우리 프로젝트에 그대로 가져오기 어려운 이유는 다음과 같다.

첫째, oracle이 너무 넓다. `AUTH_BYPASS_CANDIDATE`는 실제 취약점이라기보다 후보 신호에 가깝다. 우리 프로젝트처럼 정답 label이 있는 regression testing에서는 FP/FN 계산이 어렵다.

둘째, 최종 결과가 best-ever archive를 보존하지 못하는 것으로 보인다. 이번 실행에서 1세대에는 total findings가 12였지만 최종 결과는 2개였다. Regression testing harness라면 중간에 찾은 finding을 잃으면 안 된다.

셋째, baseline과 FSM-GA의 budget 단위가 다르다. FSM-GA는 request budget 중심이고 baseline은 iterations 중심이라, 같은 시간과 자원 대비 비교를 하려면 runner들의 accounting을 맞춰야 한다.

넷째, finding 수가 많아도 ground truth 기반 TP인지 알 수 없다. 예를 들어 auth-only baseline은 116 unique findings를 냈지만, 이것이 실제로 116개의 독립적인 authorization regression TP라는 뜻은 아니다.

다섯째, 우리 서버와 우리 test scenario에 맞춘 object pool/session semantics가 부족하다. 우리 harness는 두 local user와 locally created object를 중심으로 authorization scenario를 만들지만, 별도 GA는 더 일반적인 GraphQL fuzzing에 가깝다.

## 10. 결론

이번 비교의 결론은 다음과 같다.

별도 GA 구현은 실행 가능한 GraphQL fuzzing framework이고, FSM/GA/baseline runner 구조는 참고할 가치가 있다. 하지만 현재 상태 그대로는 우리 수업 프로젝트의 핵심 목표인 authorization regression testing에는 우리 기존 harness보다 적합하지 않다.

현재 프로젝트에서 가장 설득력 있는 방향은 다음이다.

1. 최종 결과는 기존 우리 harness를 중심으로 유지한다.
2. 별도 GA 구현은 “상한 baseline” 또는 “외부 참고 baseline”으로만 사용한다.
3. 별도 GA의 좋은 아이디어 중 surface probing, transition coverage logging, best-ever archive 개념만 우리 harness에 선별적으로 반영한다.
4. 별도 GA의 broad oracle은 그대로 쓰지 않고, 우리 ground truth authorization oracle을 유지한다.

발표에서는 다음처럼 설명하는 것이 안전하다.

```text
We compared our authorization-regression-oriented FSM-guided prioritization harness against a separate general-purpose FSM-GA GraphQL fuzzer. The external GA framework was able to explore the API and produce candidate findings, but its oracle and budget accounting were not aligned with our regression-testing objective. Our harness produced measurable TP/FP/FN results under a fixed budget and was therefore more suitable for the course project.
```

## 11. 추천 반영 사항

너무 복잡하게 확장하지 않고 프로젝트 품질을 올리려면 다음 정도만 반영하는 것이 좋다.

- `best-ever finding archive`를 명시적으로 유지한다.
- budget report에 `executedRequests`, `firstFindingAt`, `uniqueFindingsAtBudget`을 계속 남긴다.
- FSM transition coverage를 리포트에 한 줄 더 추가한다.
- 별도 GA의 runner 전체를 병합하지 않는다.
- broad `AUTH_BYPASS_CANDIDATE` oracle을 우리 최종 지표에 섞지 않는다.

즉, 별도 GA 코드는 “아이디어와 비교 대상”으로는 의미가 있지만, 최종 제출용 주 구현은 지금의 authorization regression harness가 더 적합하다.
