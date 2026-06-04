# 현재 코드에 적용된 GA 전략 분석

작성일: 2026-06-04

## 1. 한 줄 요약

현재 프로젝트의 `ours` 전략은 전통적인 유전 알고리즘처럼 세대별 crossover/mutation을 반복하는 구조가 아니다. 실제 구현은 GraphQL authorization attack 후보인 `AttackGene`들을 만들고, target archive와 FSM-like progress score를 사용해 제한된 request budget 안에서 실행 순서를 정하는 **MIO-lite style GA/FSM prioritization**이다.

가장 정확한 표현:

```text
FSM-aware MIO-lite archive prioritization over predefined GraphQL authorization AttackGenes
```

즉, GA는 새로운 공격을 무한히 만들어내는 엔진이 아니라, 이미 생성된 attack candidate pool에서 어떤 후보를 먼저 실행할지 결정하는 prioritizer다.

## 2. 관련 코드 위치

| 파일 | 역할 |
| --- | --- |
| `02-independent-testing-program/01-test-program/lib/security-testing/attack_registry.ts` | AttackGene 후보군 생성 |
| `02-independent-testing-program/01-test-program/lib/security-testing/ga_prioritizer.ts` | GA/FSM ordering 전략 구현 |
| `02-independent-testing-program/01-test-program/lib/security-testing/sequence_planner.ts` | AttackGene을 실제 GraphQL sequence로 변환 |
| `02-independent-testing-program/01-test-program/lib/security-testing/oracle.ts` | 실행 결과가 finding인지 판정 |
| `02-independent-testing-program/01-test-program/lib/security-testing/evaluation.ts` | baseline별 metric 계산 |
| `02-independent-testing-program/01-test-program/lib/security-testing/experiment.ts` | baseline method, seed, budget 설정 |

## 3. 전체 실행 흐름에서 GA가 들어가는 위치

전체 흐름은 다음과 같다.

```text
1. GraphQL endpoint introspection
2. operation catalog 생성
3. schema-derived operation classification
4. AttackGene population 생성
5. baseline별 ordering 적용
6. AttackGene -> concrete GraphQL sequence lowering
7. request budget 안에서 sequence 실행
8. oracle로 finding 판정
9. ground truth와 비교해 TP/FP/FN 계산
```

GA 전략은 5번 단계에서 사용된다. 즉, GA는 GraphQL request를 직접 실행하지 않고, request 실행 순서를 결정한다.

## 4. AttackGene이란 무엇인가

`AttackGene`은 하나의 authorization test candidate를 나타내는 구조다.

주요 필드:

| Field | 의미 |
| --- | --- |
| `id` | 후보 ID |
| `type` | attack category |
| `owner` | object owner actor |
| `attacker` | attacker actor |
| `objectType` | 대상 GraphQL object type |
| `setupResolver` | object를 만들 resolver |
| `targetResolver` | 공격 대상 resolver |
| `deleteResolver` | stale object setup에서 사용할 delete resolver |
| `verifyResolver` | side-effect 확인용 read resolver |
| `selectionSet` | GraphQL selection set |
| `sensitiveField` | BOPLA에서 확인할 sensitive field |
| `fitness` | prioritization score |
| `fsmState` | 현재 ordering/baseline 상태 label |
| `capabilities` | 이 후보가 만족하는 capability checkpoint |

AttackGene은 `attack_registry.ts`에서 schema catalog를 기반으로 생성된다.

예를 들어:

- `createPost` + `post(id)` -> `BOLA_READ` candidate
- `createPost` + `updatePost(id)` -> `BOLA_UPDATE_DELETE` candidate
- `createPost` + `deletePost(id)` + `post(id)` -> `STALE_OBJECT_ACCESS` candidate
- `adminUsers` -> `BFLA_ADMIN_LIKE_OP` candidate
- `user.resetToken`, `post.internalNote`, `comment.moderationNote` -> `BOPLA_SENSITIVE_FIELD_READ` candidate

## 5. 비교하는 baseline method

현재 `experiment.ts`의 기본 비교군은 다음 6개다.

| Method | 실제 코드 동작 |
| --- | --- |
| `pure-random-schema` | schema operation 중 random으로 하나를 골라 raw request 생성 |
| `dependency-only` | create operation과 id consumer를 dependency 기준으로 연결 |
| `template-only` | AttackGene 후보군을 생성된 순서 그대로 실행 |
| `random-attack-gene` | 같은 AttackGene 후보군을 seed 기반 deterministic random order로 실행 |
| `ga-without-fsm` | novelty/executable/capability score로 정렬하되 FSM progress는 제외 |
| `ours` | MIO-lite target archive + FSM progress + novelty + oracle proxy + semantic risk hint 사용 |

중요한 점:

```text
template-only, random-attack-gene, ga-without-fsm, ours는 같은 AttackGene 후보군을 사용한다.
차이는 후보를 어떤 순서로 실행하느냐다.
```

이 구조 덕분에 `ours`가 더 좋은 결과를 내면 “후보 자체를 더 많이 알고 있어서”가 아니라 “같은 후보군을 더 효율적으로 배치해서”라고 설명할 수 있다.

## 6. `ours` 전략의 핵심 구조

`ours`는 `ga_prioritizer.ts`의 `mioLiteOrder()`로 구현된다.

핵심 단계:

```text
1. 각 AttackGene을 targetId 기준으로 archive에 넣는다.
2. 각 target archive 안에서 FSM progress가 높은 후보를 앞에 둔다.
3. archive별 상위 3개 후보만 유지한다.
4. 아직 실행하지 않은 target 중 priority가 높은 target을 고른다.
5. 선택된 target의 best gene을 실행 순서에 추가한다.
6. seen resolver/type/template 정보를 갱신한다.
7. 모든 후보가 emit될 때까지 반복한다.
```

이 방식은 MIO(Many Independent Objective)식 아이디어를 단순화한 것이다. 각 target을 독립적인 목표로 보고, 아직 덮지 않은 target을 우선적으로 탐색한다.

## 7. targetId 설계

`targetId()`는 archive의 key를 만든다.

구성:

```text
attack type
+ target resolver
+ object type
+ sensitive field / delete resolver / setup resolver
```

예시:

```text
BOLA_READ:post:Post:createPost
BOLA_UPDATE_DELETE:updatePost:Post:createPost
BOPLA_SENSITIVE_FIELD_READ:user:User:resetToken
BFLA_ADMIN_LIKE_OP:adminUsers:User:action
```

의미:

- 같은 resolver만 보는 것이 아니라 attack type, object type, sensitive field까지 나눠서 archive target을 만든다.
- 따라서 `post(id)` read와 `post.internalNote` exposure는 서로 다른 testing objective가 될 수 있다.
- limited budget에서 다양한 security surface를 더 넓게 덮도록 유도한다.

## 8. FSM progress score

`fsmProgress()`는 AttackGene이 attack-ready에 얼마나 가까운지 추정한다.

현재 점수:

| Attack type | 높은 점수 조건 | Score |
| --- | --- | ---: |
| `BOLA_READ` | `setupResolver`와 `targetResolver`가 있음 | 0.8 |
| `BOLA_UPDATE_DELETE` | `setupResolver`, `targetResolver`, `verifyResolver`가 있음 | 0.85 |
| `STALE_OBJECT_ACCESS` | `setupResolver`, `deleteResolver`, `targetResolver`가 있음 | 0.85 |
| `BFLA_ADMIN_LIKE_OP` | `targetResolver`가 있음 | 0.75 |
| `BOPLA_SENSITIVE_FIELD_READ` | `targetResolver`와 `sensitiveField`가 있음 | 0.75 |

이 점수는 실제 runtime FSM state transition이 아니다. 후보가 필요한 capability를 얼마나 갖추고 있는지 보는 static readiness score다.

정확한 표현:

```text
FSM progress is used as a fitness signal, not as a full runtime transition engine.
```

## 9. Fitness 구성 요소

`ours`의 개별 gene fitness는 `scoreWithFsm()`로 계산된다.

```text
scoreWithFsm =
  0.35 * fsmProgress
+ 0.20 * securitySurfaceNovelty
+ 0.20 * executableScore
+ 0.10 * oracleSignalProxy
+ 0.15 * semanticRiskHint
```

각 요소의 의미:

| 요소 | 의미 |
| --- | --- |
| `fsmProgress` | AttackGene이 attack-ready에 가까운지 |
| `securitySurfaceNovelty` | 아직 테스트하지 않은 resolver/type/template인지 |
| `executableScore` | 실행 가능한 target resolver가 있는지 |
| `oracleSignalProxy` | finding으로 판정될 가능성이 큰 attack type인지 |
| `semanticRiskHint` | resolver 이름이 security-relevant한지 |

## 10. securitySurfaceNovelty

`securitySurfaceNovelty()`는 이미 본 resolver/type/template을 피하고 새로운 surface를 우선한다.

가산점:

| 조건 | Score |
| --- | ---: |
| 새로운 target resolver | +0.35 |
| 새로운 object type | +0.25 |
| 새로운 attack template | +0.25 |
| sensitive field 포함 | +0.15 |

최대값은 1로 제한된다.

의미:

- 같은 resolver만 반복하는 것을 줄인다.
- `Post`, `Comment`, `User`, `InternalStats` 등 여러 object type을 넓게 커버한다.
- BOLA/BOPLA/BFLA/STALE 등 여러 template이 budget 안에 들어오게 한다.

## 11. semanticRiskHint

`semanticRiskHint()`는 resolver 이름 기반 risk heuristic이다.

현재 규칙:

| Resolver name hint | Score |
| --- | ---: |
| `secure`, `safe`, `sanitized`, `public`, `health`, `echo`, `time`, `feed` 포함 | 0.15 |
| `admin`, `super`, `secret`, `private`, `internal`, `password`, `reset` 포함 | 0.95 |
| `update`, `delete`, `comment`, `post`, `user`, `search` 포함 | 0.75 |
| 그 외 | 0.5 |

이 heuristic은 GraphQL schema만으로 authorization semantics를 완전히 이해할 수 없다는 한계를 보완하기 위한 약한 semantic signal이다.

주의:

```text
semanticRiskHint는 oracle이 아니다.
이름이 위험해 보여도 실제 finding 여부는 oracle과 ground truth comparison으로 판단한다.
```

## 12. target selection priority

`mioLiteOrder()`에서 다음 실행 target을 고를 때 쓰는 priority는 다음과 같다.

```text
priority =
  uncovered
+ 1.0 * (1 - fsmProgress(best))
+ 0.7 * securitySurfaceNovelty(best)
+ 0.5 * oracleSignalProxy(best)
+ 0.4 * semanticRiskHint(best)
+ tiny seed noise
```

여기서 `uncovered`는 아직 해당 targetId가 실행되지 않았으면 `2.0`, 이미 실행된 target이면 `0`이다.

해석:

- 가장 큰 힘은 아직 안 덮은 target을 우선하는 archive coverage다.
- 그 다음 novelty, oracle signal, semantic risk hint를 섞는다.
- `1 - fsmProgress`를 넣어 같은 target 안에서 너무 쉬운 후보만 반복하지 않도록 약간의 exploration 압력을 준다.
- `rng() * 0.001`은 같은 점수일 때 seed별 deterministic tie-breaker 역할을 한다.

## 13. 15% exploration

`ours`는 항상 최고 priority target만 고르지 않는다.

```ts
const selectedTarget =
    rng() < 0.15
        ? random target among scored targets
        : highest priority target
```

의미:

- 85%는 exploitation: 가장 좋아 보이는 target 선택
- 15%는 exploration: seed 기반으로 다른 target 선택

이 덕분에 여러 seed 실험에서 ordering이 완전히 고정되지 않고, budget curve 평균을 낼 수 있다.

## 14. ga-without-fsm과 ours의 차이

`ga-without-fsm`은 `noveltyGaOrder()`로 구현된다.

점수:

```text
scoreWithoutFsm =
  0.45 * securitySurfaceNovelty
+ 0.35 * executableScore
+ 0.20 * capabilityCount / 5
```

차이:

| 항목 | ga-without-fsm | ours |
| --- | --- | --- |
| FSM progress | 사용 안 함 | 사용 |
| target archive | 없음 | 있음 |
| semantic risk hint | 사용 안 함 | 사용 |
| oracle signal proxy | 사용 안 함 | 사용 |
| exploration | 없음 | 15% seed-based exploration |
| target diversity | novelty 중심 | archive coverage + novelty |

따라서 `ga-without-fsm`은 단순 novelty/executability 기반 정렬이고, `ours`는 attack readiness와 target archive까지 포함한 prioritization이다.

## 15. random-attack-gene과 ours의 차이

`random-attack-gene`은 같은 AttackGene 후보군을 seed 기반 Fisher-Yates shuffle로 섞는다.

차이:

| 항목 | random-attack-gene | ours |
| --- | --- | --- |
| 후보군 | AttackGene | AttackGene |
| ordering | deterministic random shuffle | fitness + archive + FSM |
| seed 사용 | shuffle 순서 | exploration/tie-break |
| semantic signal | 없음 | 있음 |
| FSM signal | 없음 | 있음 |

이 baseline은 “같은 후보군을 알고 있어도 순서만 random이면 어떤가”를 보기 위한 비교군이다.

## 16. template-only와 ours의 차이

`template-only`는 `attack_registry.ts`에서 생성된 AttackGene 순서를 그대로 따른다.

차이:

| 항목 | template-only | ours |
| --- | --- | --- |
| 후보 생성 | predefined template | predefined template |
| ordering | 생성 순서 | archive + fitness |
| budget-limited 성능 | 앞쪽 template에 의존 | security-relevant target 우선 |
| novelty 반영 | 없음 | 있음 |
| FSM progress 반영 | 없음 | 있음 |

## 17. pure-random-schema / dependency-only와의 차이

`pure-random-schema`와 `dependency-only`는 AttackGene pool을 쓰지 않는다.

| Method | AttackGene 사용 | 목적 |
| --- | --- | --- |
| `pure-random-schema` | 아니오 | schema-only random baseline |
| `dependency-only` | 아니오 | dependency만으로 authorization finding이 되는지 비교 |
| `ours` | 예 | authorization-aware candidate prioritization |

이 둘은 GA baseline이라기보다 information-level baseline이다.

## 18. 현재 전략의 강점

현재 전략의 장점:

- 모든 method가 같은 budget/seed 조건에서 비교된다.
- `ours`, `ga-without-fsm`, `random-attack-gene`, `template-only`는 같은 AttackGene pool을 공유한다.
- secure/public/decoy resolver가 섞인 schema에서 FP를 함께 측정할 수 있다.
- limited budget에서 어떤 ordering이 더 많은 TP를 빨리 찾는지 볼 수 있다.
- endpoint introspection 기반이라 테스트 프로그램이 서버 코드에 직접 묶이지 않는다.

## 19. 현재 전략의 한계

정확히 말해야 할 한계:

- 전통적인 GA처럼 crossover/mutation으로 새 sequence를 진화시키는 구조는 아니다.
- `fsmProgress()`는 실제 request별 state transition이 아니라 static readiness score다.
- `semanticRiskHint()`는 이름 기반 heuristic이므로 다른 서버에서는 hints 보완이 필요할 수 있다.
- oracle과 ground truth 설계가 평가 품질에 중요하다.
- completeness는 명시된 AttackGene template scope로 제한된다.

## 20. 발표/보고서에서 안전한 표현

좋은 표현:

```text
We use a GA-inspired MIO-lite prioritization strategy over predefined GraphQL authorization AttackGenes.
The strategy maintains target archives and scores candidates using FSM-like readiness,
security-surface novelty, executability, oracle-signal proxy, and semantic risk hints.
```

더 짧은 표현:

```text
Our method is FSM-aware GA-style candidate prioritization, not a full generational GA.
```

피해야 할 표현:

```text
We implemented a full genetic algorithm with crossover and mutation.
The GA automatically discovers arbitrary GraphQL exploit logic from schema alone.
FSM guarantees that a candidate is vulnerable.
```

## 21. 코드 기준 최종 결론

현재 코드에 적용된 GA 전략은 다음처럼 정리할 수 있다.

```text
1. Schema-derived catalog에서 authorization AttackGene population을 만든다.
2. 각 AttackGene은 attack type, target resolver, object type, sensitive field, setup/delete/verify resolver를 가진다.
3. ours는 targetId별 archive를 만들고, 각 archive에서 FSM progress가 높은 후보를 상위 3개로 제한한다.
4. 실행 순서는 uncovered target coverage, FSM progress, novelty, oracle proxy, semantic risk hint를 섞어 결정한다.
5. 15% 확률로 exploration을 넣어 seed별 ordering 차이를 만든다.
6. budget 안에서 sequence를 실행하고, oracle과 ground truth로 TP/FP/FN을 평가한다.
```

따라서 이 프로젝트의 contribution은 “새로운 exploit을 무제한 생성하는 GA”가 아니라, **GraphQL authorization regression testing에서 제한된 request budget을 security-relevant candidate에 더 잘 배분하는 GA-style prioritization**이다.
