# GraphQL Authorization Testing Project

이 프로젝트는 owned local GraphQL lab server를 대상으로 authorization regression testing을 수행하는 automated testing 수업 프로젝트다.

테스트 프로그램은 localhost의 GraphQL endpoint에 request를 보내고, 실행 결과를 JSON/Markdown report로 저장한다. 평가는 local lab의 ground truth와 비교해 TP/FP/FN을 계산한다.

외부 서비스, 공개 target, credential theft, stealth, persistence, malware, unauthorized access는 범위 밖이다.

## Project Structure

```text
01-test-target-graphql-server/
  01-server/                 테스트 대상 GraphQL lab server
  02-ground-truth/           취약/안전 resolver 정답표

02-independent-testing-program/
  01-test-program/           독립 GraphQL authorization testing harness
  02-other-server-config/    다른 owned local 서버에 붙일 때 쓰는 설정/hints
  03-execution-results/      실행 결과 JSON/Markdown report
  04-docs/                   설계/분석/팀원 공유 문서

03-other/
  01-external-comparison/    외부 비교용 자료. 메인 구현 아님
```

## Test Target Server

서버 위치:

```text
01-test-target-graphql-server/01-server
```

GraphQL endpoint:

```text
http://127.0.0.1:3000/graphql
```

기술 스택:

- Express
- express-graphql
- Sequelize
- SQLite
- TypeScript

현재 서버의 주요 GraphQL type:

- `User`
- `Post`
- `Comment`
- `InternalStats`
- `CommandOutput`

현재 서버의 주요 authorization testing surface:

- user별 session/login
- object ownership이 있는 `Post`, `Comment`
- read/update/delete resolver
- secure/public/decoy resolver
- admin-like resolver
- sensitive field resolver
- soft-delete 이후 접근 확인

Ground truth:

```text
01-test-target-graphql-server/02-ground-truth/ground_truth.json
```

현재 ground truth 기준:

| Group | Count |
| --- | ---: |
| Vulnerable entries | 26 |
| Secure/public/decoy entries | 29 |

## Independent Testing Program

테스트 프로그램 위치:

```text
02-independent-testing-program/01-test-program/lib/security-testing
```

핵심 실행 흐름:

```text
schema introspection
-> operation catalog 생성
-> schema-derived candidate classification
-> optional config/hints 적용
-> actor session 유지
-> runtime object pool 관리
-> authorization test sequence 생성
-> sequence prioritization
-> localhost GraphQL request 실행
-> oracle 판단
-> ground-truth 기반 TP/FP/FN 평가
-> JSON/Markdown report 생성
```

테스트 실행은 black-box 방식이다. 테스트 프로그램은 서버 내부 코드를 직접 호출하지 않고 GraphQL endpoint에 request를 보낸다.

평가는 owned local lab의 ground truth를 사용한다.

## Supported Categories

| Category | Meaning |
| --- | --- |
| `BOLA_READ` | 다른 사용자의 private object를 id 기반 resolver로 읽을 수 있는지 확인 |
| `BOLA_UPDATE_DELETE` | 다른 사용자의 object를 수정하거나 삭제할 수 있는지 확인 |
| `STALE_OBJECT_ACCESS` | soft-delete 이후 object가 계속 접근되는지 확인 |
| `BFLA_ADMIN_LIKE_OP` | low-privileged actor가 admin-like resolver를 실행할 수 있는지 확인 |
| `BOPLA_SENSITIVE_FIELD_READ` | selection set을 통해 sensitive field가 노출되는지 확인 |

## Compared Methods

같은 budget/seed 조건에서 다음 방법들을 비교한다.

| Method | Meaning |
| --- | --- |
| `pure-random-schema` | schema operation만 보고 raw request를 생성 |
| `dependency-only` | input/output dependency와 object pool만 사용 |
| `template-only` | predefined template sequence를 deterministic 순서로 실행 |
| `random-sequence-gene` | 같은 sequence 후보군을 random ordering으로 실행 |
| `ga-without-fsm` | Graph-GA에서 FSM progress signal을 제외한 ablation |
| `graph-ga` | dependency graph, archive, rare-path, FSM progress, runtime feedback을 사용하는 최종 방법 |

## Install

```bash
npm install
npm run tsc
```

DB 준비가 필요한 경우:

```bash
npm run sequelize db:migrate
npm run sequelize db:seed:all
```

## Run Server

터미널 1:

```bash
./run.sh
```

서버가 올라오면 endpoint는 다음 주소다.

```text
http://127.0.0.1:3000/graphql
```

## Run Tests

터미널 2:

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
  --method graph-ga \
  --budget 50 \
  --seed 1 \
  --endpoint http://127.0.0.1:3000/graphql
```

budget/seed sweep:

```bash
npm run security:fuzz -- \
  --budgets 20,40,50,80,160 \
  --seeds 1,2,3 \
  --endpoint http://127.0.0.1:3000/graphql
```

operation catalog만 생성:

```bash
npm run security:catalog -- \
  --endpoint http://127.0.0.1:3000/graphql \
  --out 02-independent-testing-program/03-execution-results/security-results-catalog
```

## Other Local Server Config

다른 owned local GraphQL 서버에 붙일 때는 다음 설정 파일을 참고한다.

```text
02-independent-testing-program/02-other-server-config/config.yaml
02-independent-testing-program/02-other-server-config/security_hints.example.json
```

기본 적용 방식:

```text
schema-derived classification
+ minimal config/hints
+ runtime response 기반 object pool/capability update
+ sequence prioritization
+ owned-lab ground truth evaluation
```

## Outputs

| File | Meaning |
| --- | --- |
| `op_catalog.json` | introspection 기반 operation catalog |
| `object_pool.json` | 실행 중 생성/capture한 object pool |
| `attack_execution_log.json` | sequence별 실행 로그 |
| `findings.json` | 탐지된 finding 목록 |
| `evaluation_result.json` | baseline별 metric |
| `budget_curve.json` | budget/seed 평균 curve |
| `ground_truth_comparison.json` | TP/FP/FN 비교 |
| `run_report.md` | 사람이 읽는 실행 요약 |
| `feedback.md` | 발표/보고서용 해석 가이드 |

## Main Docs

```text
02-independent-testing-program/04-docs/current_project_and_server_summary.md
02-independent-testing-program/04-docs/independent_testing_program_design.md
02-independent-testing-program/04-docs/graph_ga_revised_implementation.md
02-independent-testing-program/04-docs/fsm_design_summary.md
02-independent-testing-program/04-docs/candidate_pool_explanation.md
02-independent-testing-program/04-docs/result_aware_testing_report.md
02-independent-testing-program/04-docs/project_folder_structure.md
```
