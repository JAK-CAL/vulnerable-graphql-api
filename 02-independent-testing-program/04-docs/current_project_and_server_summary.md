# Current Project And Server Summary

이 문서는 현재 프로젝트 README와 GraphQL lab server 구조를 최신 구현 기준으로 정리한 팀원 공유용 요약이다.

## Project Goal

이 프로젝트는 owned local GraphQL lab server를 대상으로 authorization regression testing을 수행한다.

목표는 두 가지다.

1. GraphQL authorization 관련 regression finding을 black-box request execution으로 탐지한다.
2. 후보 resolver가 많고 request budget이 제한된 상황에서 Graph-GA가 어떤 test sequence를 먼저 실행할지 정해 finding recovery를 빠르게 만드는지 평가한다.

외부 서비스, 공개 target, credential theft, stealth, persistence, malware, unauthorized access는 범위 밖이다.

## Folder Roles

```text
01-test-target-graphql-server/
  01-server/
    테스트 대상 GraphQL lab server

  02-ground-truth/
    취약/안전 resolver 정답표

02-independent-testing-program/
  01-test-program/
    독립 GraphQL authorization testing harness

  02-other-server-config/
    다른 owned local GraphQL 서버에 붙일 때 쓰는 설정/hints

  03-execution-results/
    JSON/Markdown 실행 결과

  04-docs/
    설계, 평가, 팀원 공유 문서

03-other/
  01-external-comparison/
    외부 비교용 자료. 메인 구현 아님
```

## Server Summary

서버 위치:

```text
01-test-target-graphql-server/01-server
```

GraphQL endpoint:

```text
http://127.0.0.1:3000/graphql
```

서버는 GA 로직을 포함하지 않는다. 서버의 역할은 GraphQL authorization regression testing에서 prioritization이 의미 있게 드러나는 local lab 환경을 제공하는 것이다.

현재 서버는 다음 특징을 가진다.

- 여러 object type: `User`, `Post`, `Comment`, `InternalStats`, `CommandOutput`
- 여러 resolver path
- 같은 object type에 대한 vulnerable/secure/public/decoy 접근 경로
- BOLA, BFLA, BOPLA, stale object access 테스트 표면
- sensitive field 후보: `User.resetToken`, `Post.internalNote`, `Comment.moderationNote`
- soft-delete lifecycle state
- admin-like resolver 중 vulnerable/secure 후보 혼합

## Server Changes Made For Meaningful Evaluation

GA 방향성으로 서버 안에 알고리즘을 넣은 것은 아니다. 대신 평가가 너무 쉬운 작은 search space에 머물지 않도록 서버 구조를 확장했다.

주요 변경은 다음과 같다.

- `Comment` type, model, resolver, mutation 추가
- `Post`와 `Comment` 모두 ownership 기반 authorization 테스트 대상화
- `securePost`, `secureComment` 같은 정상 authorization resolver 추가
- `postPreview`, `commentPreview`, owner history resolver 같은 decoy path 추가
- `adminUsers`, `superSecretPrivateMutation` 같은 vulnerable admin-like resolver 유지
- `internalStats`, `adminAuditStatus`, `privateSystemReport` 같은 secure admin-like decoy 추가
- BOPLA 후보 field를 여러 타입에 분산
- safe/public/noise resolver를 추가해 모든 후보가 취약하지 않은 구조로 변경

이 변경의 목적은 취약점 종류를 무작정 늘리는 것이 아니라, 같은 category 안에서 vulnerable / secure / public / decoy 후보가 섞이게 만들어 candidate prioritization이 필요한 상황을 만드는 것이다.

## Ground Truth

정답표 위치:

```text
01-test-target-graphql-server/02-ground-truth/ground_truth.json
```

현재 기준:

| Group | Count |
| --- | ---: |
| Vulnerable | 26 |
| Secure/public/decoy | 29 |

평가는 black-box request execution 결과를 이 ground truth와 비교해 TP/FP/FN으로 계산한다.

## Vulnerability Categories

| Category | Meaning |
| --- | --- |
| `BOLA_READ` | 다른 사용자의 private object를 id 기반 resolver로 읽을 수 있는지 |
| `BOLA_UPDATE_DELETE` | 다른 사용자의 object를 수정하거나 삭제할 수 있는지 |
| `STALE_OBJECT_ACCESS` | soft-delete 이후 object가 계속 접근되는지 |
| `BFLA_ADMIN_LIKE_OP` | low-privileged actor가 admin-like resolver를 실행할 수 있는지 |
| `BOPLA_SENSITIVE_FIELD_READ` | sensitive field가 selection set을 통해 노출되는지 |

## Testing Program Summary

테스트 프로그램 위치:

```text
02-independent-testing-program/01-test-program/lib/security-testing
```

실행 흐름:

```text
schema introspection
-> operation catalog
-> schema-derived classification
-> optional config/hints
-> actor session setup
-> runtime object pool
-> authorization test sequence generation
-> Graph-GA prioritization
-> localhost GraphQL execution
-> oracle judgment
-> ground-truth evaluation
-> JSON/Markdown report
```

테스트 프로그램은 특정 서버 코드에 직접 의존하지 않는다. 다른 owned local GraphQL 서버에 붙일 때는 endpoint, accounts, hints, ground truth를 설정으로 보완한다.

## Graph-GA Role

`graph-ga`는 취약점을 직접 증명하는 알고리즘이 아니라, 제한된 request budget에서 어떤 authorization regression sequence를 먼저 실행할지 정하는 prioritization 전략이다.

현재 구현은 다음 신호를 사용한다.

- schema dependency graph
- actor/session state
- runtime object pool
- attack template objective
- FSM progress signal
- uncovered target priority
- rare semantic path scheduling
- per-target archive
- runtime feedback

발표에서는 다음처럼 설명하는 것이 적절하다.

```text
Graph-GA prioritizes authorization regression sequences under a limited request budget.
The local lab is designed with mixed vulnerable, secure, public, and decoy candidates,
so ordering quality matters.
```

## Baselines

현재 비교 대상은 다음과 같다.

| Method | Meaning |
| --- | --- |
| `pure-random-schema` | schema operation만 보고 raw request를 생성 |
| `dependency-only` | dependency와 object pool만 사용 |
| `template-only` | template sequence를 고정 순서로 실행 |
| `random-sequence-gene` | 같은 sequence 후보군을 random ordering으로 실행 |
| `ga-without-fsm` | FSM progress signal을 제거한 ablation |
| `graph-ga` | dependency graph, archive, rare-path, FSM, runtime feedback을 사용하는 최종 방법 |

예전 이름인 `ours`는 현재 `graph-ga`의 alias로 볼 수 있지만, 보고서와 발표에서는 `graph-ga`를 기준 명칭으로 쓰는 것이 더 명확하다.

## Latest Evaluation Interpretation

최근 guide-aligned evaluation은 budgets `20,40,50,80,160`, seeds `1,2,3` 조건으로 수행했다.

해석의 핵심:

- 작은 budget에서 `graph-ga`가 finding을 더 빨리 회수하는지를 본다.
- full budget은 모든 후보를 거의 다 실행할 수 있으므로 completeness 확인용에 가깝다.
- “GA가 항상 우월하다”가 아니라 “mixed candidate pool과 limited budget에서 graph-aware prioritization이 유리했다”고 설명해야 한다.

대표 결과 위치:

```text
02-independent-testing-program/03-execution-results/security-results-graph-ga-evaluation-guide
```

## Build And Run

빌드:

```bash
npm install
npm run tsc
```

서버 실행:

```bash
./run.sh
```

테스트 실행:

```bash
npm run security:fuzz:course
```

단일 Graph-GA 실행:

```bash
npm run security:fuzz -- \
  --method graph-ga \
  --budget 50 \
  --seed 1 \
  --endpoint http://127.0.0.1:3000/graphql
```

budget curve:

```bash
npm run security:fuzz -- \
  --budgets 20,40,50,80,160 \
  --seeds 1,2,3 \
  --endpoint http://127.0.0.1:3000/graphql
```

## Safe Claims

좋은 표현:

```text
Testing execution is black-box.
Evaluation is ground-truth based in an owned local lab.
The harness uses schema-derived classification, minimal hints, runtime object pools,
FSM progress signals, and Graph-GA sequence prioritization.
```

피해야 할 표현:

```text
The tool fully understands arbitrary GraphQL authorization semantics from schema alone.
Graph-GA is always better on every server.
The server itself implements the GA algorithm.
```
