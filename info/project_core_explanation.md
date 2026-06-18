# Project Core Explanation

이 문서는 현재 코드 기준 프로젝트의 핵심 아이디어와 안전한 발표/리포트 claim을 정리한다.

## 1. One-Line Summary

이 프로젝트는 owned local vulnerable GraphQL servers를 대상으로, 제한된 request budget 안에서 authorization regression finding을 효율적으로 찾기 위해 GraphQL operation sequence를 생성, 우선순위화, 실행, 평가하는 automated testing harness다.

## 2. What This Project Is Not

이 프로젝트는 실제 외부 서비스 공격 도구가 아니다.

범위는 다음으로 제한된다.

- localhost endpoint
- owned vulnerable lab server
- dummy test accounts
- controlled ground truth
- black-box GraphQL HTTP execution
- JSON/Markdown evaluation report

안전한 claim:

> owned local GraphQL lab에서 authorization regression testing을 자동화하고, 제한된 request budget에서 Graph-GA 기반 sequence prioritization을 평가했다.

피해야 할 claim:

- 모든 GraphQL 서버에서 항상 최고 성능을 낸다.
- 실제 외부 GraphQL API 공격 성능을 증명했다.
- DVGA의 모든 vulnerability class를 현재 harness가 scoring한다.
- Graph-GA의 모든 요소를 완전한 ablation으로 분리 증명했다.

## 3. Why GraphQL Authorization Testing Needs Sequences

GraphQL authorization bug는 단일 request 하나로 드러나지 않는 경우가 많다.

예를 들어 BOLA update/delete를 확인하려면 보통 다음 흐름이 필요하다.

```text
user A 로그인
user A가 private object 생성
user B 로그인
user B가 user A object id로 update/delete 시도
side effect 확인
```

따라서 이 프로젝트에서 testing unit은 단일 resolver가 아니라 operation sequence다.

## 4. High-Level Architecture

```text
Schema introspection / operation catalog
        |
        v
Operation classification
        |
        v
Dependency graph construction
        |
        v
Attack population / seed sequence generation
        |
        v
Graph-GA sequence prioritization
        |
        v
Black-box execution against localhost
        |
        v
Runtime oracle
        |
        v
Ground-truth evaluation
```

## 5. Core Code Components

| File | Role |
| --- | --- |
| `schema_loader.ts` | endpoint introspection 또는 catalog file에서 operation catalog 생성 |
| `static_classifier.ts` | resolver 이름, args, return fields 기반 classification |
| `attack_registry.ts` | 5개 attack type별 candidate gene 생성 |
| `dependency_graph.ts` | operation producer-consumer relation 계산 |
| `sequence_planner.ts` | AttackGene을 executable GraphQL request sequence로 lower |
| `executor.ts` | actor별 session/cookie를 유지하며 GraphQL HTTP request 실행 |
| `object_pool.ts` | 실행 중 생성/관찰한 object id와 evidence 저장 |
| `oracle.ts` | response trace로 suspected finding 판정 |
| `graph_ga.ts` | Graph-GA prioritization, archive, runtime feedback, generation 관리 |
| `evaluation.ts` | request run 결과를 evaluation metric으로 변환 |
| `reporter.ts` | JSON/Markdown report 생성 |

## 6. Operation Classification

현재 classifier는 다음 신호를 사용한다.

| Classification | Main heuristic |
| --- | --- |
| `login` | mutation name에 `login`, `signin`, `authenticate` |
| `create` | mutation name에 `create`, `new`, `add` |
| `read_by_id` | query이고 `id` arg가 있으며 list가 아님 |
| `update` | mutation name에 `update`, `edit`, `patch` 또는 hints |
| `delete` | mutation name에 `delete`, `remove`, `destroy` 또는 hints |
| `list` | query return이 list |
| `admin_like` | name에 `admin`, `super`, `secret`, `private`, `internal` 또는 hints |
| `secure_hint` | name에 `secure`, `safe`, `sanitized` 또는 hints |
| `sensitive_surface` | return fields에 sensitive field 존재 |
| `search` | query name에 `search`, `find` |

classification은 ground truth가 아니라 candidate generation을 위한 heuristic이다.

## 7. Supported Attack Types

현재 코드가 직접 scoring하는 attack type은 다음 5개다.

| Attack type | Meaning |
| --- | --- |
| `BOLA_READ` | 다른 사용자의 private object를 id로 읽을 수 있는가 |
| `BOLA_UPDATE_DELETE` | 다른 사용자의 object를 update/delete할 수 있는가 |
| `STALE_OBJECT_ACCESS` | 삭제된 object가 다시 읽히는가 |
| `BFLA_ADMIN_LIKE_OP` | low-privilege actor가 admin-like resolver를 실행할 수 있는가 |
| `BOPLA_SENSITIVE_FIELD_READ` | sensitive field가 selection set으로 노출되는가 |

이 중 `BOLA_READ`, `BOLA_UPDATE_DELETE`, `STALE_OBJECT_ACCESS`는 stateful authorization sequence의 성격이 강하다. `BFLA`와 `BOPLA`는 surface exposure 또는 function/property authorization 성격이 강하다.

## 8. What Graph-GA Adds

template-only 방식은 attack template sequence를 안정적으로 실행한다. Graph-GA는 여기에 다음을 추가한다.

- dependency graph 기반 executable sequence 유지
- per-target objective archive
- rare semantic path scheduling
- runtime feedback 기반 fitness
- mutation/crossover를 통한 자손 sequence 생성
- stateful authorization objective quota
- request budget 안에서 target 다양성과 sequence relevance 유지

최근 수정의 핵심은 `BFLA/BOPLA`만 빨리 찾는 surface-heavy scoring을 완화하고, `BOLA/stale/update-delete` 계열 stateful authorization target이 low/mid budget에서 충분히 실행되도록 조정한 것이다.

## 9. Current Target Servers

| Target | Domain | Endpoint | Ground truth | Role |
| --- | --- | --- | --- | --- |
| 01 | `User`, `Post`, `Comment` | `http://127.0.0.1:3000/graphql` | 26 vulnerable, 29 secure | primary limited-budget benchmark |
| 02 | `User`, `Paste`, `AuditLog`, `Workspace` | `http://127.0.0.1:3100/graphql` | 47 vulnerable, 37 secure | broader robustness benchmark |

Target 02는 DVGA를 참고했지만, 현재 harness가 scoring 가능한 GraphQL authorization/object-property benchmark로 재구성했다. 실제 outbound request, command execution, filesystem write는 하지 않는다.

## 10. Current Evidence

Evaluation condition:

```text
seeds: 1,2,3
budgets: 40,80,120,160,200
```

Target 01 전체 기준:

```text
budget 40: graph-ga TP 7.33 / F1 0.44 > random TP 4.67 / F1 0.31
budget 80: graph-ga TP 15.33 / F1 0.74 > random TP 10.67 / F1 0.58
budget 120: graph-ga TP 19.33 / F1 0.85 > random TP 17.67 / F1 0.81
```

Target 02 전체 기준:

```text
random-sequence-gene이 모든 budget에서 graph-ga보다 높은 전체 TP/F1을 보인다.
```

Target 02 sequence-like subset:

```text
budget 40: graph-ga 5.00 / 20 > random 2.67 / 20
budget 80: graph-ga 11.33 / 20 > random 5.67 / 20
budget 120: graph-ga 16.00 / 20 > random 9.33 / 20
budget 160: graph-ga 19.00 / 20 > random 12.00 / 20
budget 200: graph-ga 19.00 / 20 > random 15.00 / 20
```

따라서 현재 가장 정확한 claim은 다음이다.

> Graph-GA는 모든 GraphQL 취약점에서 항상 random보다 우수한 범용 fuzzer가 아니다. 그러나 stateful authorization sequence가 필요한 BOLA/update-delete/stale 계열 취약점에서는 두 서버 모두에서 random보다 높은 회수율을 보였다.