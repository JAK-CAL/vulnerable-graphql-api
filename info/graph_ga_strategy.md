# Graph-GA Strategy

이 문서는 현재 코드 기준 Graph-GA 전략을 정리한 최신본이다. 특히 “서버1은 왜 잘 나왔는가”, “서버2에서는 왜 전체 기준 random이 강한가”, “GA가 템플릿 정렬에 머물지 않았는가”를 리포트에서 방어할 수 있도록 정리한다.

## 1. Core Idea

Graph-GA는 GraphQL operation sequence를 하나의 후보로 보고, dependency graph, vulnerability template, per-target archive, rare semantic path scheduling, runtime feedback을 이용해 제한된 request budget 안에서 authorization-relevant sequence를 우선 실행한다.

핵심 문제:

```text
GraphQL schema에는 많은 operation이 있다.
모든 operation이 취약하지는 않다.
safe/public/decoy resolver도 섞여 있다.
request budget은 제한되어 있다.
따라서 어떤 sequence를 먼저 실행할지 결정하는 것이 중요하다.
```

Graph-GA가 노리는 지점:

```text
surface-only field probing이 아니라,
actor/object/lifecycle transition이 필요한 authorization path를 빠르게 실행한다.
```

## 2. From AttackGene to SequenceChromosome

현재 코드에서 `AttackGene`은 완성된 최종 test라기보다 seed와 oracle expectation에 가깝다.

```text
AttackGene
  attack type
  setup resolver
  target resolver
  object type
  sensitive field
  selection set
```

`sequence_planner.ts`는 이 gene을 실제 executable sequence로 lower한다.

```text
AttackGene -> SequenceStep[]
```

예:

```text
BOLA_UPDATE_DELETE / Workspace
  setup: createWorkspace
  target: updateWorkspace
  verify: workspace

lowered sequence:
  owner.login
  owner.createWorkspace
  attacker.login
  attacker.updateWorkspace(id = owner.workspace.id)
  owner.workspace(id = owner.workspace.id)
```

Graph-GA는 이렇게 만들어진 sequence 후보를 평가하고, mutation/repair/archive를 통해 우선순위를 조정한다.

## 3. Dependency Graph

Dependency graph는 producer-consumer 관계를 표현한다.

예:

```text
createPost returns Post.id
post(id) consumes Post.id
updatePost(id) consumes Post.id
deletePost(id) consumes Post.id

createPaste returns Paste.id
paste(id) consumes Paste.id
updatePaste(id) consumes Paste.id
deletePaste(id) consumes Paste.id

createWorkspace returns Workspace.id
workspace(id) consumes Workspace.id
updateWorkspace(id) consumes Workspace.id
deleteWorkspace(id) consumes Workspace.id
```

Graph-GA에서 dependency graph는 세 가지 역할을 한다.

1. 실행 가능한 seed sequence를 만든다.
2. object type에 맞는 compatible operation을 찾는다.
3. mutation/crossover 이후 깨진 sequence를 repair한다.

이 dependency graph가 없으면 random schema probing은 id가 필요한 update/delete/read operation을 제대로 연결하지 못한다. 실제 결과에서도 `dependency-only`나 `pure-random-schema`는 authorization finding 회수력이 거의 없거나 매우 낮다.

## 4. Objective Archive

Graph-GA는 target별 objective archive를 사용한다.

Objective key는 대략 다음 정보를 포함한다.

```text
attack type
object type
setup resolver
target resolver
delete resolver
verify resolver
sensitive field
```

Archive가 저장하는 정보:

- target별 실행 횟수
- finding 발견 여부
- best fitness
- sequence length
- target coverage

목적:

- 이미 잘 나오는 target만 반복하지 않는다.
- 아직 덮지 않은 resolver/object type/sensitive field를 탐색한다.
- finding이 나오지 않아도 valid execution, object capture, attack-ready progress를 다음 선택에 반영한다.

## 5. Runtime Feedback Fitness

Graph-GA는 정적 schema score만으로 fitness를 계산하지 않는다. 실제 GraphQL HTTP request 실행 결과를 feedback으로 사용한다.

주요 signal:

| Signal | Meaning |
| --- | --- |
| valid GraphQL execution | validation/runtime error 없이 실행되었는가 |
| dependency satisfied | object pool에서 capture한 id가 다음 request에 연결되었는가 |
| captured objects | object id/evidence를 얻었는가 |
| attack-ready progress | oracle 평가 가능한 상태까지 갔는가 |
| response data | 의미 있는 data가 반환되었는가 |
| auth error | authorization boundary가 관찰되었는가 |
| sensitive field returned | sensitive field가 실제 응답에 있었는가 |
| side effect verified | mutation 결과가 확인되었는가 |
| finding produced | oracle이 finding을 냈는가 |
| novelty | 새 resolver/object type/template을 덮었는가 |

Finding만 보상하지 않는 것이 중요하다. 아직 finding이 없어도 valid execution, dependency satisfaction, object capture, novelty는 다음 세대의 좋은 sequence로 이어질 수 있다.

## 6. Current Balanced Strategy

이전 문제:

```text
BOPLA/BFLA surface가 많은 target에서는 짧은 template 후보가 너무 많이 생긴다.
그 결과 GA가 sequence-like 자손을 충분히 만들기 전에 surface 후보를 먼저 소비할 수 있다.
```

현재 적용한 조정:

```text
stateful objective:
  BOLA_READ
  BOLA_UPDATE_DELETE
  STALE_OBJECT_ACCESS

batch selection:
  batchSize의 최대 약 45%를 stateful objective 후보에 우선 배정
```

의미:

- BOPLA/BFLA smoke test를 버리지 않는다.
- 대신 sequence-like authorization path가 surface-only 후보에 밀려 사라지지 않도록 보장한다.
- 이 조정은 GA가 서버2에서 “전체 승리”하도록 맞춘 것이 아니라, 프로젝트 본질인 stateful sequence testing을 평가 안에서 살아 있게 하기 위한 것이다.

## 7. Mutation and Repair

현재 mutation 방향:

- 같은 object type 안에서 target resolver 변경
- read/update/delete/admin/sensitive-field 후보 변경
- actor owner/attacker 변경
- selection set 조정
- sequence 일부 교체

Repair의 목적:

- id가 없는 update/delete를 줄인다.
- return type과 argument type이 맞는 operation으로 보정한다.
- selection set이 schema에 맞게 유지되도록 한다.
- create/read/update/delete 연결이 깨지지 않게 한다.

## 8. Generation Depth Validation

“앞단에서 template 처리가 너무 강해서 GA가 깊게 돌지 않는다”는 우려가 있었다. 현재 generation log 기준으로 보면, budget 40은 seed-heavy지만 budget 80부터 mutation이 충분히 발생한다.

Server 1 `graph-ga`:

| Budget | Total candidates | Seed | Mutated | Crossover | Max rank |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 40 | 33 | 32 | 1 | 0 | 11 |
| 80 | 72 | 35 | 35 | 2 | 24 |
| 120 | 105 | 35 | 68 | 2 | 35 |
| 160 | 146 | 35 | 109 | 2 | 50 |
| 200 | 189 | 35 | 152 | 2 | 64 |

Server 2 `graph-ga`:

| Budget | Total candidates | Seed | Mutated | Crossover | Max rank |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 40 | 30 | 24 | 6 | 0 | 10 |
| 80 | 65 | 32 | 28 | 5 | 22 |
| 120 | 102 | 32 | 64 | 6 | 34 |
| 160 | 136 | 32 | 98 | 6 | 46 |
| 200 | 192 | 32 | 154 | 6 | 64 |

해석:

- low budget에서는 template seed의 영향이 크다.
- budget 80 이상에서는 mutation 후보가 충분히 생성된다.
- crossover는 낮다. 현재 구현의 evolutionary core는 crossover보다 mutation/archive/runtime feedback에 가깝다.
- 따라서 “템플릿만 정렬했다”는 평가는 과하지만, “deep crossover-driven GA”라고 강하게 주장하는 것도 과하다.

정확한 표현:

```text
The current implementation is a feedback-guided evolutionary scheduler over GraphQL attack sequences, with mutation as the dominant genetic operator and limited crossover.
```

## 9. Why Server 1 Was Strong

Server 1은 Graph-GA의 강점과 target 구조가 잘 맞는다.

- `Post`, `Comment` create/read/update/delete lifecycle이 명확하다.
- owner object 생성 후 attacker가 foreign id를 쓰는 BOLA/BOLA update-delete 흐름이 잘 정의되어 있다.
- stale object access도 delete 후 read로 자연스럽게 구성된다.
- sequence-like vulnerable GT가 8개로 작지만 중요하고, Graph-GA가 budget 80에서 모두 회수한다.

Server 1 sequence-like result:

| Budget | graph-ga | random-sequence-gene | template-only |
| ---: | ---: | ---: | ---: |
| 40 | 5.33 | 1.00 | 2.00 |
| 80 | 8.00 | 2.67 | 6.00 |
| 120 | 8.00 | 6.33 | 8.00 |

따라서 Server 1에서 Graph-GA가 잘 나온 이유는 단순히 취약점 이름을 잘 맞췄기 때문이 아니라, sequence-like authorization path를 먼저 실행했기 때문이다.

## 10. Why Server 2 Is Harder

Server 2는 Server 1보다 다음 면에서 더 어렵다.

- `Paste`, `AuditLog`, `Workspace`로 domain이 바뀌었다.
- redacted safe return type이 많아졌다.
- secure resolver와 decoy가 늘었다.
- neutral resolver names를 사용한다.
- broader sensitive fields가 들어갔다.
- 전체 GT에서 BOPLA/BFLA surface-like 취약점 비중이 높다.

전체 GT 기준 Server 2 결과:

| Budget | graph-ga TP | random TP | template TP |
| ---: | ---: | ---: | ---: |
| 40 | 7.00 | 10.67 | 6.00 |
| 80 | 16.00 | 20.33 | 13.00 |
| 120 | 24.67 | 28.67 | 21.00 |
| 160 | 29.00 | 36.00 | 30.00 |
| 200 | 36.67 | 39.67 | 35.67 |

냉정한 결론:

```text
Server 2 full benchmark에서는 random-sequence-gene이 Graph-GA보다 높다.
```

이는 GA나 서버가 무조건 실패했다는 뜻은 아니다. Server 2 전체 GT에는 short surface 취약점이 많고, 이런 취약점은 random/template도 빠르게 발견할 수 있다.

## 11. Server 2에서 살아남는 Graph-GA의 의미

Server 2 sequence-like subset:

| Budget | graph-ga | random-sequence-gene | template-only |
| ---: | ---: | ---: | ---: |
| 40 | 5.00 | 2.67 | 6.00 |
| 80 | 11.33 | 5.67 | 13.00 |
| 120 | 16.00 | 9.33 | 17.00 |
| 160 | 19.00 | 12.00 | 17.00 |
| 200 | 19.00 | 15.00 | 17.00 |

의미:

- Graph-GA는 Server 2에서도 sequence-like authorization subset에서는 random보다 강하다.
- template-only는 low/mid budget에서 여전히 강하다.
- 따라서 Graph-GA의 주장은 “모든 취약점에서 최고”가 아니라 “stateful authorization sequence에 특화된 search guidance”로 잡아야 한다.

## 12. Related Research Framing

리포트에서 연결 가능한 연구적 배경:

- MIO-style many-objective testing: 테스트 목표가 많고 budget이 제한되어 있을 때 per-target archive와 feedback-directed sampling이 유효하다. 참고: https://arxiv.org/abs/1901.01541
- GraphQL fuzzing 연구: GraphQL API testing에서는 evolutionary search가 도움이 될 수 있지만, black-box/random 계열도 조건에 따라 경쟁력이 있다. 참고: https://arxiv.org/abs/2209.05833
- Sequence/system-behavior guided API testing: API testing에서는 단일 request보다 sequence와 system state를 heuristic으로 쓰는 것이 중요하다. 참고: https://arxiv.org/abs/2412.03420

이 연구 배경은 현재 결과와 잘 맞는다.

```text
Graph-GA는 general random을 항상 이기는 silver bullet이 아니라,
many-objective authorization sequence testing에서 feedback-guided prioritization을 적용한 접근이다.
```

## 13. Accurate Claim

현재 코드 기준으로 정확한 claim:

```text
Graph-GA prioritizes dependency-aware GraphQL authorization sequences using runtime feedback, objective archive, semantic path rarity, and stateful attack-readiness guidance. It shows clear limited-budget benefits on the original Post/Comment target and retains an advantage over random on sequence-like authorization vulnerabilities in the broader second target.
```

추가로 말할 수 있는 것:

- Server 1에서는 limited budget에서 Graph-GA의 우위가 강하게 나타났다.
- Server 2에서는 전체 benchmark에서 random이 더 높지만, sequence-like subset에서는 Graph-GA가 random보다 높다.
- Server 2는 overfitting 반박과 한계 분석에 필요하다.

피해야 할 것:

- 모든 benchmark에서 Graph-GA가 항상 template-only/random보다 높다고 말하기.
- 현재 구현을 deep crossover-heavy GA라고 말하기.
- runtime feedback/repair/FSM/archive 각각의 독립 효과를 완전히 분리 증명했다고 말하기.
- 실제 외부 GraphQL API 공격 성능을 주장하기.

## 14. Recommended Report Framing

가장 안전한 문장:

```text
The result suggests that the value of Graph-GA is not broad vulnerability enumeration, but prioritizing stateful authorization sequences under a limited request budget. Server 1 demonstrates this effect strongly. Server 2 shows that the approach is not universally dominant on a broader DVGA-inspired target, but still preserves an advantage over random on sequence-like authorization vulnerabilities.
```