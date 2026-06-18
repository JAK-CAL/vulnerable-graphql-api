# Evaluation Report

이 문서는 현재 코드 기준 evaluation 결과를 리포트에 바로 옮길 수 있도록 정리한 최신본이다. 핵심은 단순히 “Graph-GA가 이겼다/졌다”가 아니라, 어떤 서버에서 어떤 주장을 할 수 있고 어떤 주장은 하면 안 되는지를 분리하는 것이다.

## 1. Evaluation Scope

평가는 owned local GraphQL lab server에 대해서만 수행한다.

공통 원칙:

- execution 중 ground truth를 사용하지 않는다.
- GraphQL endpoint는 localhost로 제한한다.
- runtime oracle은 suspected finding만 만든다.
- ground truth는 실행 후 TP/FP/FN 계산에만 사용한다.
- 같은 endpoint, 같은 actor setup, 같은 request budget으로 method를 비교한다.
- request budget은 GraphQL HTTP request 수 기준이다.

비교 method:

| Method | Meaning |
| --- | --- |
| `graph-ga` | dependency graph + attack template + runtime feedback + archive + stateful-objective batch quota |
| `random-sequence-gene` | 같은 AttackGene/sequence 후보를 random order로 실행 |
| `template-only` | template lowering 결과를 안정적으로 실행 |
| `ga-without-fsm` | Graph-GA에서 attack-readiness/FSM guidance를 약화한 ablation |
| `dependency-only` | dependency graph 중심, security objective guidance 약함 |
| `pure-random-schema` | schema operation에 가까운 random exploration |

## 2. Ground Truth Summary

| Target | Vulnerable GT | Secure/Decoy GT | Sequence-like vulnerable entries | Primary purpose |
| --- | ---: | ---: | ---: | --- |
| Server 1 | 26 | 29 | 8 | Graph-GA limited-budget advantage benchmark |
| Server 2 | 47 | 37 | 20 | Cross-domain robustness and overfitting check |

Sequence-like subset은 다음 attack type을 포함한다.

```text
BOLA_READ
BOLA_UPDATE_DELETE
STALE_OBJECT_ACCESS
```

Surface-like subset은 주로 다음을 포함한다.

```text
BFLA_ADMIN_LIKE_OP
BOPLA_SENSITIVE_FIELD_READ
```

이 분리가 중요하다. Graph-GA의 본질적 강점은 “민감 필드 이름을 빨리 고르는 것”보다 “actor/object/lifecycle transition을 가진 authorization sequence를 구성하는 것”에 있기 때문이다.

## 3. Server 1: Current Results

Target:

```text
01-test-target-graphql-server
http://127.0.0.1:3000/graphql
```

서버 성격:

- `Post`, `Comment` 중심의 original benchmark.
- owner object 생성, attacker foreign object read/update/delete, stale object access가 잘 정의되어 있다.
- Graph-GA의 limited-budget prioritization 효과를 보여주기 좋은 구조다.

### 3.1 Full Ground Truth Results

3 seeds 평균 결과:

| Budget | Method | Mean TP | Mean FP | Mean FN | Mean F1 | Mean First |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 40 | graph-ga | 7.33 | 0.00 | 18.67 | 0.44 | 5.00 |
| 40 | random-sequence-gene | 4.67 | 0.00 | 21.33 | 0.31 | 13.33 |
| 40 | template-only | 2.00 | 0.00 | 24.00 | 0.15 | 5.00 |
| 40 | ga-without-fsm | 6.00 | 0.00 | 20.00 | 0.37 | 5.00 |
| 80 | graph-ga | 15.33 | 0.00 | 10.67 | 0.74 | 5.00 |
| 80 | random-sequence-gene | 10.67 | 0.00 | 15.33 | 0.58 | 13.33 |
| 80 | template-only | 6.00 | 0.00 | 20.00 | 0.37 | 5.00 |
| 80 | ga-without-fsm | 13.00 | 0.00 | 13.00 | 0.67 | 5.00 |
| 120 | graph-ga | 19.33 | 0.00 | 6.67 | 0.85 | 5.00 |
| 120 | random-sequence-gene | 17.67 | 0.00 | 8.33 | 0.81 | 13.33 |
| 120 | template-only | 14.00 | 0.00 | 12.00 | 0.70 | 5.00 |
| 120 | ga-without-fsm | 18.67 | 0.00 | 7.33 | 0.84 | 5.00 |
| 160 | graph-ga | 24.67 | 1.00 | 1.33 | 0.95 | 5.00 |
| 160 | random-sequence-gene | 24.00 | 0.00 | 2.00 | 0.96 | 13.33 |
| 160 | template-only | 22.00 | 0.00 | 4.00 | 0.92 | 5.00 |
| 160 | ga-without-fsm | 23.00 | 0.00 | 3.00 | 0.94 | 5.00 |
| 200 | graph-ga | 26.00 | 1.33 | 0.00 | 0.97 | 5.00 |
| 200 | random-sequence-gene | 26.00 | 0.00 | 0.00 | 1.00 | 13.33 |
| 200 | template-only | 25.00 | 0.00 | 1.00 | 0.98 | 5.00 |
| 200 | ga-without-fsm | 26.00 | 0.00 | 0.00 | 1.00 | 5.00 |

해석:

- budget 40/80에서 Graph-GA가 random/template보다 높은 TP/F1을 보인다.
- budget 120 이후에는 random/ablation도 따라오며, high budget에서는 방법 간 차이가 줄어든다.
- budget 160/200에서 Graph-GA FP가 생긴다. 이는 성능 실패라기보다 stale-object oracle이 secure/history resolver를 과하게 잡는 refinement point다.
- 따라서 Server 1의 가장 좋은 주장 구간은 budget 40-120이다.

### 3.2 Sequence-like Subset

Sequence-like vulnerable GT는 8개다.

| Budget | graph-ga | random-sequence-gene | template-only | ga-without-fsm |
| ---: | ---: | ---: | ---: | ---: |
| 40 | 5.33 | 1.00 | 2.00 | 5.00 |
| 80 | 8.00 | 2.67 | 6.00 | 6.00 |
| 120 | 8.00 | 6.33 | 8.00 | 8.00 |
| 160 | 8.00 | 8.00 | 8.00 | 8.00 |
| 200 | 8.00 | 8.00 | 8.00 | 8.00 |

해석:

- Server 1에서 Graph-GA가 잘 나온 가장 직접적인 이유는 sequence-like 취약점 회수가 빠르기 때문이다.
- budget 80에서 Graph-GA는 sequence-like 8/8을 회수하지만 random은 평균 2.67개에 그친다.
- 이 결과는 “Graph-GA가 시퀀스가 필요한 authorization bug를 제한된 budget 안에서 먼저 찾는다”는 주장을 뒷받침한다.

## 4. Server 2: Current Results

Target:

```text
02-test-target-graphql-server
http://127.0.0.1:3100/graphql
```

서버 성격:

- DVGA-inspired in-memory GraphQL benchmark.
- `Paste`, `AuditLog`, `Workspace` domain을 사용한다.
- redacted safe view type과 secure resolver가 더 많다.
- neutral resolver names와 broadened sensitive fields를 사용한다.
- Server 1의 Post/Comment 구조와 hard-coded sensitive field 이름에 과적합했는지 확인하는 robustness benchmark다.

### 4.1 Full Ground Truth Results

3 seeds 평균 결과:

| Budget | Method | Mean TP | Mean FP | Mean FN | Mean F1 | Mean First |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 40 | graph-ga | 7.00 | 0.00 | 40.00 | 0.26 | 9.00 |
| 40 | random-sequence-gene | 10.67 | 0.00 | 36.33 | 0.37 | 4.00 |
| 40 | template-only | 6.00 | 0.00 | 41.00 | 0.23 | 9.00 |
| 40 | ga-without-fsm | 6.00 | 0.00 | 41.00 | 0.23 | 9.00 |
| 80 | graph-ga | 16.00 | 0.00 | 31.00 | 0.51 | 9.00 |
| 80 | random-sequence-gene | 20.33 | 0.00 | 26.67 | 0.60 | 4.00 |
| 80 | template-only | 13.00 | 0.00 | 34.00 | 0.44 | 9.00 |
| 80 | ga-without-fsm | 15.00 | 0.00 | 32.00 | 0.48 | 9.00 |
| 120 | graph-ga | 24.67 | 0.00 | 22.33 | 0.68 | 9.00 |
| 120 | random-sequence-gene | 28.67 | 0.00 | 18.33 | 0.76 | 4.00 |
| 120 | template-only | 21.00 | 0.00 | 26.00 | 0.62 | 9.00 |
| 120 | ga-without-fsm | 28.00 | 0.00 | 19.00 | 0.75 | 9.00 |
| 160 | graph-ga | 29.00 | 0.00 | 18.00 | 0.77 | 9.00 |
| 160 | random-sequence-gene | 36.00 | 0.00 | 11.00 | 0.87 | 4.00 |
| 160 | template-only | 30.00 | 0.00 | 17.00 | 0.78 | 9.00 |
| 160 | ga-without-fsm | 28.67 | 0.00 | 18.33 | 0.76 | 9.00 |
| 200 | graph-ga | 36.67 | 0.00 | 10.33 | 0.88 | 9.00 |
| 200 | random-sequence-gene | 39.67 | 0.00 | 7.33 | 0.91 | 4.00 |
| 200 | template-only | 35.67 | 0.00 | 11.33 | 0.86 | 9.00 |
| 200 | ga-without-fsm | 36.67 | 0.00 | 10.33 | 0.88 | 9.00 |

냉정한 해석:

- 전체 GT 기준으로는 Server 2에서 random-sequence-gene이 모든 budget에서 Graph-GA보다 높다.
- 따라서 Server 2를 “Graph-GA 전체 성능 우위 증명”으로 사용하면 안 된다.
- 다만 Graph-GA는 FP 0을 유지하고, broadened target에서도 200 budget 기준 36.67/47을 회수한다.
- 이 결과는 Server 2가 Graph-GA를 좋게 보이도록 만든 target이 아니라는 점을 보여준다.

### 4.2 Sequence-like Subset

Sequence-like vulnerable GT는 20개다.

| Budget | graph-ga | random-sequence-gene | template-only | ga-without-fsm |
| ---: | ---: | ---: | ---: | ---: |
| 40 | 5.00 | 2.67 | 6.00 | 5.00 |
| 80 | 11.33 | 5.67 | 13.00 | 12.00 |
| 120 | 16.00 | 9.33 | 17.00 | 13.00 |
| 160 | 19.00 | 12.00 | 17.00 | 13.00 |
| 200 | 19.00 | 15.00 | 17.00 | 13.00 |

해석:

- Server 2의 전체 결과는 random이 강하지만, sequence-like subset에서는 Graph-GA가 random보다 일관되게 높다.
- budget 160/200에서 Graph-GA는 sequence-like 19/20까지 회수한다.
- 이 subset이 Server 2의 핵심 의미다. Server 2는 “Graph-GA가 만능이다”가 아니라 “도메인이 바뀌어도 stateful authorization sequence에서는 여전히 강점이 남는다”를 확인한다.
- 단 budget 40/80/120에서는 template-only가 Graph-GA보다 높거나 비슷하다. 이는 현재 Graph-GA가 low-budget sequence prioritization에서 항상 압도적이지 않다는 한계다.

## 5. Generation Depth Validation

“앞단 template 처리 때문에 GA가 깊게 돌지 않았다”는 우려를 확인하기 위해 `generation_log.json`을 점검했다.

Server 1 `graph-ga` generation summary:

| Budget | Total candidates | Seed | Mutated | Crossover | Max rank |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 40 | 33 | 32 | 1 | 0 | 11 |
| 80 | 72 | 35 | 35 | 2 | 24 |
| 120 | 105 | 35 | 68 | 2 | 35 |
| 160 | 146 | 35 | 109 | 2 | 50 |
| 200 | 189 | 35 | 152 | 2 | 64 |

Server 2 `graph-ga` generation summary:

| Budget | Total candidates | Seed | Mutated | Crossover | Max rank |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 40 | 30 | 24 | 6 | 0 | 10 |
| 80 | 65 | 32 | 28 | 5 | 22 |
| 120 | 102 | 32 | 64 | 6 | 34 |
| 160 | 136 | 32 | 98 | 6 | 46 |
| 200 | 192 | 32 | 154 | 6 | 64 |

해석:

- budget 40은 여전히 seed-heavy다. 이 구간은 template ordering 영향이 크다.
- budget 80부터는 mutation 후보가 충분히 생긴다.
- crossover는 낮고 mutation이 주요 evolutionary operator다.
- 따라서 현재 Graph-GA는 “템플릿만 정렬한 것”은 아니지만, crossover 기반 진화보다는 seed + mutation + archive scheduling 중심에 가깝다.

## 6. Why Server 1 Looks Better Than Server 2

Server 1이 잘 나온 이유는 방법론과 서버 구조가 잘 맞기 때문이다.

- sequence-like 취약점 수가 적고 구조가 명확하다.
- owner object 생성 후 attacker가 foreign id를 쓰는 흐름이 잘 드러난다.
- `Post`, `Comment` lifecycle이 create/read/update/delete로 깔끔하다.
- limited budget에서 random은 이 흐름을 늦게 밟지만 Graph-GA는 dependency와 stateful objective를 먼저 실행한다.

Server 2가 더 어렵게 보이는 이유:

- 전체 GT에 BOPLA/BFLA surface-like 취약점이 많다.
- surface-like 취약점은 random/template도 빨리 찾을 수 있다.
- neutral resolver와 redacted view type이 섞여 있어 schema 이름만으로는 prioritization이 어려워졌다.
- `Workspace`를 추가하면서 sequence-like cross-domain 검증은 좋아졌지만, 전체 결과에서는 random baseline이 여전히 강하다.

## 7. Safe Final Interpretation

리포트에서 가장 방어력 있는 결론:

```text
Server 1 demonstrates the original strength of Graph-GA: under limited request budgets, dependency-aware and stateful sequence prioritization recovers authorization bugs faster than random or template-only baselines. Server 2 is intentionally broader and less aligned with the original Post/Comment target. On Server 2, Graph-GA does not dominate the full benchmark; random-sequence-gene has higher overall TP. However, on the sequence-like authorization subset, Graph-GA consistently recovers more issues than random, showing that its useful contribution is specific to stateful authorization paths rather than general GraphQL vulnerability discovery.
```

피해야 할 주장:

- “Server 2에서도 Graph-GA가 전체적으로 최고다.”
- “Graph-GA가 모든 GraphQL 취약점 유형에 범용적으로 우수하다.”
- “FSM, runtime feedback, archive, mutation 각각의 독립 효과를 완전히 분리 증명했다.”

가능한 주장:

- “Server 1은 성능 주장용 benchmark다.”
- “Server 2는 robustness/overfitting 점검용 benchmark다.”
- “Graph-GA의 강점은 surface-only 취약점이 아니라 sequence-like authorization 취약점에서 가장 명확하다.”
- “현재 결과는 방법론의 장점과 한계를 동시에 보여준다.”