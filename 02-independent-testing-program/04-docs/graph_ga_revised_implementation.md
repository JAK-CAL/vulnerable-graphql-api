# Revised Graph-GA Implementation Summary

이 문서는 새 가이드라인의 방향성을 기준으로 현재 테스트 프로그램이 어떤 구조로 다시 정리되었는지 설명한다.

## 핵심 방향

기존 구현은 주로 `AttackGene` 후보를 만들고, 그 후보를 어떤 순서로 실행할지 비교하는 구조였다.

새 구현의 목표는 다르다.

`AttackGene`은 여전히 필요하지만, 최종 contribution은 아니다. 이제 `AttackGene`은 Graph-GA가 시작할 수 있는 seed 역할을 한다. 실제 GA가 다루는 대상은 여러 GraphQL operation으로 이루어진 `SequenceChromosome`이다.

즉 비교 대상은 단순히 “후보 정렬”이 아니라, 제한된 request budget 안에서 어떤 operation sequence를 먼저 완성하고 실행할지에 대한 search strategy다.

## 참고한 대표 아이디어

이 구현은 최신 연구 전체를 재현하는 것이 아니라, 자동 테스트 생성과 fuzzing에서 널리 쓰이는 대표 아이디어를 GraphQL authorization regression에 맞게 축소 적용한다.

| Source idea | 우리 프로젝트 적용 |
| --- | --- |
| MIO / EvoMaster의 per-target archive | 각 vulnerability target을 독립 objective로 보고, target별 실행 횟수, finding 여부, best fitness를 archive에 저장한다. |
| MOSA / DynaMOSA의 active objective prioritization | 이미 finding이 난 target보다 아직 uncovered인 target을 우선한다. |
| AFLFast류 rare-path seed scheduling | 자주 실행되지 않은 semantic path와 target에 rarity bonus를 준다. |
| Search-based system testing의 budget-aware optimization | 긴 sequence보다 같은 의미를 더 적은 request로 실행하는 sequence에 cost bonus를 준다. |

여기서 path는 binary coverage edge가 아니라 GraphQL operation sequence다.

```text
actor.operation > actor.operation > actor.operation
```

예를 들어 다음 sequence는 하나의 semantic path로 본다.

```text
USER_A.CreateOwnedPost > USER_B.ModifyForeignPost > USER_A.VerifyModifiedPost
```

## 전체 흐름

```text
Schema / operation catalog
        |
        v
Dependency graph 생성
        |
        v
Vulnerability template 기반 seed sequence 생성
        |
        v
Sequence chromosome population 생성
        |
        v
Graph-GA 실행
  - execute
  - runtime feedback 수집
  - fitness 계산
  - parent selection
  - crossover / mutation
  - dependency repair
        |
        v
JSON report + ground-truth evaluation
```

## 코드 구성

### 1. Dependency Graph

파일:

- `02-independent-testing-program/01-test-program/lib/security-testing/dependency_graph.ts`

역할:

- operation catalog에서 producer/consumer 관계를 만든다.
- 예를 들어 `createPost`가 `Post.id`를 만들고 `post(id)`가 `Post.id`를 소비하면 두 operation 사이에 dependency edge를 둔다.
- mutation/crossover 이후 깨진 sequence를 다시 실행 가능한 형태로 고칠 때 사용한다.

현재 edge는 크게 두 정보를 본다.

- 반환 타입과 반환 필드에 `id`가 있는가
- 다른 operation이 `id` argument를 받는가

이 덕분에 Graph-GA는 무작위 operation 나열이 아니라, object pool을 사용할 수 있는 sequence를 우선적으로 만든다.

### 2. Sequence Chromosome

파일:

- `02-independent-testing-program/01-test-program/lib/security-testing/types.ts`

추가된 핵심 타입:

- `OperationStepGene`
- `SequenceChromosome`
- `RuntimeFeedback`
- `DependencyEdge`

의미:

- `OperationStepGene`은 한 GraphQL operation 호출을 gene 단위로 표현한다.
- `SequenceChromosome`은 여러 operation gene이 이어진 하나의 테스트 sequence다.
- `RuntimeFeedback`은 실행 후 fitness 계산에 들어가는 관찰값이다.

이 구조 때문에 GA가 더 이상 단일 resolver 후보만 정렬하지 않고, setup, attack, verify가 포함된 sequence 자체를 다룰 수 있다.

### 3. Graph-GA Runner

파일:

- `02-independent-testing-program/01-test-program/lib/security-testing/graph_ga.ts`

역할:

- template 기반 `AttackGene`을 초기 `SequenceChromosome` population으로 변환한다.
- 각 chromosome을 실제 localhost GraphQL server에 실행한다.
- 실행 결과를 보고 feedback을 계산한다.
- fitness가 높은 sequence를 선택하고 다음 세대를 만든다.

현재 fitness는 다음 신호를 사용한다.

| Signal | 의미 |
| --- | --- |
| valid GraphQL | 요청이 schema/runtime 에러 없이 실행되었는가 |
| dependency satisfied | setup에서 만든 object id를 attack step에서 사용했는가 |
| attack-ready progress | sequence가 목표 상태까지 도달했는가 |
| response data | 응답에 의미 있는 data가 있었는가 |
| sensitive field returned | 민감 필드가 실제 응답에 포함되었는가 |
| side-effect verified | update/delete 후 검증이 되었는가 |
| finding produced | oracle이 authorization regression finding을 냈는가 |
| coverage novelty | 새 resolver/type/template을 실행했는가 |

즉 Graph-GA는 단순히 finding을 낸 sequence만 보상하지 않는다. 아직 finding이 없어도 실행 가능하고, dependency가 맞고, coverage를 넓히는 sequence는 다음 세대로 살아남을 수 있다.

추가로 현재 Graph-GA는 `ObjectiveArchive`를 유지한다.

archive key는 다음 정보를 합친다.

```text
attack type + object type + setup resolver + target resolver + verify/delete resolver + sensitive field
```

archive는 target마다 다음 정보를 저장한다.

- 실행 횟수
- finding 발견 여부
- best fitness
- best sequence length
- 마지막으로 갱신된 generation

실행 후보는 단순 fitness 순서가 아니라 다음 점수로 고른다.

```text
active objective score =
  uncovered objective bonus
+ target rarity bonus
+ semantic path rarity bonus
+ template risk/progress bonus
+ resolver semantic risk
+ short sequence cost bonus
+ previous runtime fitness
```

이 구조가 프로젝트의 path compression 핵심이다. 같은 budget이면 모든 후보를 훑는 것이 아니라, 아직 덮지 않은 중요 target과 짧고 실행 가능한 sequence를 먼저 실행한다.

### 4. Mutation

파일:

- `02-independent-testing-program/01-test-program/lib/security-testing/graph_ga.ts`

현재 mutation은 다음 방향으로 동작한다.

- 같은 object type에서 다른 read/update/delete operation으로 target 변경
- admin-like resolver 후보 변경
- sensitive field 후보 변경
- actor swap
- selection set repair

mutation은 operation catalog와 dependency graph를 참조한다. 그래서 완전히 임의의 깨진 요청을 만드는 대신, 현재 schema에서 실행 가능성이 높은 후보로 바꾼다.

mutation/crossover 이후에는 dependency repair를 수행한다.

- setup resolver가 object id를 만들 수 있는지 본다.
- target resolver가 그 id를 받을 수 있는지 본다.
- 관계가 깨졌으면 같은 object type과 template tag를 만족하는 resolver로 보정한다.

이 repair는 GraphQL schema에서 얻은 producer/consumer edge를 사용한다.

### 5. Crossover

파일:

- `02-independent-testing-program/01-test-program/lib/security-testing/graph_ga.ts`

현재 crossover는 같은 vulnerability class 또는 같은 object type을 공유하는 parent sequence 사이에서 target resolver, verify resolver, sensitive field, selection set 일부를 섞는다.

섞은 뒤에는 다시 `repairGene`을 통해 sequence로 낮춘다. 이 repair 단계가 dependency graph 방향성과 맞물린다.

### 6. Baseline 비교

파일:

- `02-independent-testing-program/01-test-program/lib/security-testing/experiment.ts`
- `02-independent-testing-program/01-test-program/lib/security-testing/cli.ts`
- `02-independent-testing-program/01-test-program/lib/security-testing/reporter.ts`

현재 기본 비교군은 다음과 같다.

| Method | 의미 |
| --- | --- |
| `pure-random-schema` | schema operation만 보고 raw request 생성 |
| `dependency-only` | dependency와 object pool만 사용 |
| `template-only` | template seed sequence를 고정 순서로 실행 |
| `random-sequence-gene` | seed sequence 공간을 random order로 실행 |
| `ga-without-fsm` | FSM progress 보상 없이 GA-style ordering 적용 |
| `graph-ga` | dependency graph + FSM progress + runtime feedback 기반 sequence GA |

이 비교는 “Graph-GA가 항상 모든 random을 압도한다”는 주장을 하기 위한 것이 아니다.

더 안전한 프로젝트 claim은 다음이다.

> owned local lab에서 black-box request execution을 수행하고, known ground truth로 TP/FP/FN을 평가했다. 제한된 budget에서는 Graph-GA가 dependency, FSM progress, runtime feedback을 사용해 security-relevant executable sequence를 우선 실행하도록 설계되었다.

## 현재 구현의 성격

현재 구현은 완전한 연구용 Graph-GA 엔진의 모든 변형을 넣은 버전은 아니다. 팀 프로젝트 범위에 맞춘 MVP다.

하지만 핵심 방향은 문서와 맞다.

- schema에서 dependency graph를 만든다.
- template은 seed와 oracle expectation을 제공한다.
- FSM/template objective는 sequence가 공격 목표 상태에 가까워지는지 평가한다.
- GA는 sequence chromosome을 실행하고 feedback/archive 기반으로 진화시킨다.
- per-target archive와 rare-path scheduling으로 request budget을 압축한다.
- execution은 localhost black-box request로 수행한다.
- evaluation은 owned lab ground truth로 TP/FP/FN을 계산한다.

남은 한계도 명확하다.

- 실제 코드 coverage를 보는 greybox fuzzer는 아니다.
- `OperationStepGene[]` 자체를 완전히 자유롭게 조합하는 연구급 엔진은 아니다.
- GraphQL schema만으로 authorization 의미를 완벽히 알 수 없으므로 hints/test accounts/ground truth가 필요하다.

## 발표 때 강조할 점

가장 중요한 문장:

> Our contribution is not just ordering predefined attacks. We build executable GraphQL operation sequences from schema-derived dependencies, guide them with vulnerability FSM progress, and prioritize them with runtime-feedback-based Graph-GA under a limited request budget.

피해야 할 표현:

- “실제 서비스에 자동 공격 가능”
- “schema만 있으면 authorization 의미를 완전히 알 수 있음”
- “GA가 random보다 항상 우월”
- “finding 수를 늘리기 위해 취약점을 많이 심었다”

더 정확한 표현:

- “minimal config/test account 기반 regression testing”
- “schema-derived candidate generation”
- “dependency graph repair”
- “FSM-guided sequence prioritization”
- “ground-truth based evaluation in an owned local lab”
