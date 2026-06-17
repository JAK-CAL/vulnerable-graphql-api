# Project Folder Structure

작성일: 2026-06-04

이 프로젝트는 역할별로 3개 상위 폴더로 나뉜다.

## 1. 테스트 대상 GraphQL 서버

```text
01-test-target-graphql-server/
```

### 1.1 서버 폴더

```text
01-test-target-graphql-server/01-server/
```

이 폴더는 테스트 대상인 local vulnerable GraphQL lab server다.

주요 파일:

| 경로 | 의미 |
|---|---|
| `app.ts` | Express + GraphQL 서버 시작점 |
| `lib/gql/schema.ts` | GraphQL schema 조립 |
| `lib/gql/types/` | Query/Object type 정의 |
| `lib/gql/mutations/` | Mutation resolver 정의 |
| `models/` | Sequelize model |
| `migrations/` | DB schema migration |
| `seeders/` | 초기 seed data |
| `static/` | local static asset server용 파일 |
| `config.json` | Sequelize DB 설정 |

### 1.2 서버 취약 평가 정답표

```text
01-test-target-graphql-server/02-ground-truth/
```

이 폴더에는 owned lab 평가용 ground truth가 들어 있다.

| 경로 | 의미 |
|---|---|
| `ground_truth.json` | vulnerable / secure resolver 정답표 |

테스트 실행은 black-box request지만, 평가는 이 ground truth로 TP / FP / FN을 계산한다.

## 2. 우리가 만든 독립 테스트 프로그램

```text
02-independent-testing-program/
```

### 2.1 테스트 프로그램

```text
02-independent-testing-program/01-test-program/
```

이 폴더가 우리가 만든 핵심 testing harness다. 특정 서버 코드에 직접 묶이지 않고, 기본적으로 endpoint introspection 또는 catalog file로 operation catalog를 만든다.

주요 파일:

| 경로 | 의미 |
|---|---|
| `lib/security-testing/cli.ts` | 실행 진입점 |
| `lib/security-testing/schema_loader.ts` | endpoint introspection / catalog loading |
| `lib/security-testing/static_classifier.ts` | schema heuristic classification |
| `lib/security-testing/attack_registry.ts` | authorization regression candidate 생성 |
| `lib/security-testing/sequence_planner.ts` | candidate를 GraphQL request sequence로 변환 |
| `lib/security-testing/executor.ts` | actor별 session/cookie 관리와 request 실행 |
| `lib/security-testing/object_pool.ts` | runtime object id capture/substitution |
| `lib/security-testing/oracle.ts` | finding 판정 |
| `lib/security-testing/ga_prioritizer.ts` | baseline / GA-style ordering |
| `lib/security-testing/reporter.ts` | JSON / Markdown report 생성 |

### 2.2 다른 서버에 붙일 때 설정

```text
02-independent-testing-program/02-other-server-config/
```

다른 owned local GraphQL server에 붙일 때 바꾸는 설정이다.

| 경로 | 의미 |
|---|---|
| `config.yaml` | endpoint, budget, seed, output, ground truth path 설정 |
| `security_hints.example.json` | login/me query, actor login variable, operation tag hint 예시 |

### 2.3 실행 결과

```text
02-independent-testing-program/03-execution-results/
```

`security-results-*` 폴더들이 여기에 들어간다. 이 폴더는 코드가 아니라 실험 산출물이다.

최신 구조 검증 결과:

```text
02-independent-testing-program/03-execution-results/security-results-reorganized-smoke/
```

대표 산출물:

| 파일 | 의미 |
|---|---|
| `op_catalog.json` | endpoint introspection 또는 catalog 기반 operation catalog |
| `attack_execution_log.json` | 실행된 sequence와 response |
| `findings.json` | finding 목록 |
| `ground_truth_comparison.json` | TP / FP / FN 비교 |
| `budget_curve.json` | budget별 aggregated result |
| `run_report.md` | 사람이 읽는 실행 요약 |
| `feedback.md` | claim guidance |

### 2.4 설명 문서

```text
02-independent-testing-program/04-docs/
```

팀원 공유/발표용 설명 문서가 들어간다.

중요 문서:

| 경로 | 의미 |
|---|---|
| `independent_testing_program_design.md` | 독립 testing program 설계 설명 |
| `prioritization_lab_redesign.md` | candidate prioritization이 의미 있게 보이도록 서버를 바꾼 이유 |
| `fsm_design_summary.md` | FSM-guided prioritization 설명 |
| `teammate_code_walkthrough.md` | 팀원용 코드 상세 설명 |
| `project_folder_structure.md` | 현재 폴더 구조 설명 |

## 3. 기타

```text
03-other/
```

### 3.1 외부 비교용, 메인 구현 아님

```text
03-other/01-external-comparison/
```

여기는 메인 구현이 아니다. 비교 실험이나 참고용으로 둔다.

| 경로 | 의미 |
|---|---|
| `GA/` | 별도로 가져온 Python GA/FSM fuzzer |
| `graphqler-results-local/` | GraphQLer baseline 결과 |
| `graphqler-results-local-mut/` | mutation 포함 GraphQLer baseline 결과 |
| `graphqler_baseline.toml` | GraphQLer 실행 config |

## 루트에 남긴 파일

루트에는 실행 인프라만 남긴다.

| 경로 | 의미 |
|---|---|
| `package.json` | npm scripts |
| `tsconfig.json` | TypeScript build 설정 |
| `run.sh` | local server + static server 실행 |
| `node_modules/` | npm dependency |
| `build/` | TypeScript build output |

## 기본 실행

서버 실행:

```bash
./run.sh
```

테스트 실행:

```bash
npm run security:fuzz -- --profile course --endpoint http://127.0.0.1:3000/graphql
```

결과는 기본적으로 다음 위치에 생성된다.

```text
02-independent-testing-program/03-execution-results/security-results/
```
