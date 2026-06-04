# GraphQL Authorization Testing Project

이 프로젝트는 owned local GraphQL lab server를 대상으로 authorization-related vulnerability testing을 수행하는 수업용 automated testing 프로젝트다.

핵심 목표는 두 가지다.

- 실질적인 GraphQL authorization 취약점 후보를 black-box request로 테스트한다.
- 테스트 프로그램은 특정 서버 코드에 묶이지 않고, localhost의 다른 owned GraphQL 서버에도 설정 기반으로 붙일 수 있게 만든다.

외부 서비스, 공개 target, credential theft, stealth, persistence, malware, unauthorized access는 범위 밖이다. Runner는 localhost endpoint만 허용한다.

## 프로젝트 구조

```text
01-test-target-graphql-server/
  01-server/                 테스트 대상 GraphQL lab server
  02-ground-truth/           취약/안전 resolver 정답표

02-independent-testing-program/
  01-test-program/           독립 GraphQL testing harness
  02-other-server-config/    다른 서버에 붙일 때 쓰는 설정/hints
  03-execution-results/      실행 결과 JSON/Markdown report
  04-docs/                   설계/분석/팀원 공유 문서

03-other/
  01-external-comparison/    외부 baseline 비교 자료, 메인 구현 아님
```

## 테스트 대상 서버

서버 위치:

```text
01-test-target-graphql-server/01-server
```

기술 스택:

- Express
- express-graphql
- Sequelize
- SQLite
- TypeScript

GraphQL endpoint:

```text
http://127.0.0.1:3000/graphql
```

현재 lab server는 다음 구조를 가진다.

- Object type: `User`, `Post`, `Comment`, `InternalStats`, `CommandOutput`
- Vulnerable resolver와 secure/public/decoy resolver가 섞여 있음
- 같은 object type에 여러 접근 경로가 있음
- sensitive field: `User.resetToken`, `Post.internalNote`, `Comment.moderationNote`
- lifecycle state: `deleted` soft-delete
- 최신 ground truth 기준:
  - vulnerable entries: `26`
  - secure/public/decoy entries: `29`

자세한 서버 구조와 숨겨진 취약점 설명:

```text
02-independent-testing-program/04-docs/current_graphql_server_structure_and_vulnerability_summary.md
```

## 독립 테스트 프로그램

테스트 프로그램 위치:

```text
02-independent-testing-program/01-test-program/lib/security-testing
```

핵심 흐름:

```text
endpoint introspection
-> operation catalog 생성
-> schema-derived classification
-> actor별 session 유지
-> runtime object pool 관리
-> predefined authorization scenario 생성
-> FSM-like state-aware GA ordering
-> GraphQL request 실행
-> oracle 판단
-> ground-truth 기반 TP/FP/FN 평가
-> JSON/Markdown report 생성
```

테스트 실행은 black-box다. GraphQL request를 endpoint로 보내고 response를 보고 finding을 판단한다. 평가는 owned local lab의 ground truth를 이용한다.

## 지원하는 취약점 category

현재 harness는 다음 authorization/security regression surface를 다룬다.

| Category | 의미 |
| --- | --- |
| `BOLA_READ` | 다른 사용자의 private object를 id로 읽을 수 있는지 |
| `BOLA_UPDATE_DELETE` | 다른 사용자의 object를 수정/삭제할 수 있는지 |
| `STALE_OBJECT_ACCESS` | soft-delete 이후 object가 계속 접근되는지 |
| `BFLA_ADMIN_LIKE_OP` | low-privileged actor가 admin-like resolver를 실행할 수 있는지 |
| `BOPLA_SENSITIVE_FIELD_READ` | selection set으로 sensitive field가 노출되는지 |

## Baseline 비교

같은 budget/seed 조건에서 다음 방법들을 비교한다.

| Method | 설명 |
| --- | --- |
| `pure-random-schema` | schema operation만 보고 random request 생성 |
| `dependency-only` | input/output dependency와 object pool만 사용 |
| `template-only` | predefined attack template을 고정 순서로 실행 |
| `random-attack-gene` | 같은 AttackGene 후보군을 random ordering으로 실행 |
| `ga-without-fsm` | GA-style ordering은 쓰지만 FSM progress는 제외 |
| `ours` | AttackGene + object pool + FSM-like state + GA-style prioritization |

중요한 해석:

- full budget은 harness completeness 확인용이다.
- limited budget curve가 prioritization 효과를 보는 핵심 실험이다.
- “GA가 항상 우월하다”가 아니라, “후보가 많고 budget이 제한된 local lab에서 더 효율적인 ordering을 보였다”라고 설명해야 한다.

## 설치 및 빌드

```bash
npm install
npm run tsc
```

DB 준비가 필요한 경우:

```bash
npm run sequelize db:migrate
npm run sequelize db:seed:all
```

## 서버 실행

터미널 1:

```bash
./run.sh
```

서버가 올라오면 GraphQL endpoint는 다음 주소다.

```text
http://127.0.0.1:3000/graphql
```

## 테스트 실행

터미널 2에서 실행한다.

기본 실행:

```bash
npm run security:fuzz
```

course profile 실행:

```bash
npm run security:fuzz:course
```

명시적으로 endpoint와 output 지정:

```bash
npm run security:fuzz -- \
  --profile course \
  --endpoint http://127.0.0.1:3000/graphql \
  --out 02-independent-testing-program/03-execution-results/security-results-course
```

단일 method 실행:

```bash
npm run security:fuzz -- \
  --method ours \
  --budget 50 \
  --seed 1 \
  --endpoint http://127.0.0.1:3000/graphql
```

budget/seed sweep:

```bash
npm run security:fuzz -- \
  --budgets 20,40,50 \
  --seeds 1,2,3 \
  --endpoint http://127.0.0.1:3000/graphql
```

operation catalog만 생성:

```bash
npm run security:catalog -- \
  --endpoint http://127.0.0.1:3000/graphql \
  --out 02-independent-testing-program/03-execution-results/security-results-catalog
```

## 다른 owned local GraphQL 서버에 붙이기

설정 파일:

```text
02-independent-testing-program/02-other-server-config/config.yaml
02-independent-testing-program/02-other-server-config/security_hints.example.json
```

권장 모델:

```text
schema-derived classification
+ minimal config/hints
+ runtime response 기반 object pool/capability update
+ GA/FSM prioritization
+ owned-lab ground truth evaluation
```

GraphQL schema만으로 login, owner, private object, secure resolver를 완벽히 자동 탐지한다고 주장하지 않는다. 필요한 경우 hints로 auth query, actor login variables, operation tags를 보완한다.

## 주요 산출물

실행 결과는 보통 다음 폴더 아래에 생성된다.

```text
02-independent-testing-program/03-execution-results/
```

대표 산출물:

| 파일 | 의미 |
| --- | --- |
| `op_catalog.json` | introspection 기반 operation catalog |
| `object_pool.json` | 실행 중 생성/capture한 object pool |
| `attack_execution_log.json` | attack gene별 실행 로그 |
| `findings.json` | 탐지된 finding 목록 |
| `evaluation_result.json` | baseline별 metric |
| `budget_curve.json` | budget/seed 평균 curve |
| `ground_truth_comparison.json` | TP/FP/FN 비교 |
| `run_report.md` | 사람이 읽는 실행 요약 |
| `feedback.md` | 발표/보고서용 해석 가이드 |

## 참고 문서

핵심 문서:

```text
02-independent-testing-program/04-docs/current_graphql_server_structure_and_vulnerability_summary.md
02-independent-testing-program/04-docs/independent_testing_program_design.md
02-independent-testing-program/04-docs/result_aware_testing_report.md
02-independent-testing-program/04-docs/project_folder_structure.md
```

## 안전한 프로젝트 Claim

좋은 표현:

```text
We built a local, independent GraphQL authorization testing harness.
It uses endpoint introspection, minimal server-specific hints, runtime object pools,
FSM-like state guidance, and GA-style prioritization.
Evaluation is based on black-box execution results compared against owned-lab ground truth.
```

피해야 할 표현:

```text
The tool fully understands arbitrary GraphQL authorization semantics from schema alone.
FSM-guided GA is always superior on every GraphQL server.
This can be used to test external services without authorization.
```
