# Current Project and Server Summary

이 문서는 현재 코드 기준 프로젝트 구조와 테스트 대상 서버를 정리한다.

## 1. Project Overview

이 프로젝트는 owned local GraphQL lab server를 대상으로 authorization regression testing을 수행하는 automated testing harness다.

핵심 목표:

1. GraphQL authorization 관련 suspected finding을 black-box HTTP request execution으로 탐지한다.
2. 제한된 request budget에서 Graph-GA가 어떤 operation sequence를 먼저 실행할지 결정하게 하여 random/template/dependency-only baseline과 비교한다.
3. 전체 취약점 기준뿐 아니라 stateful authorization sequence가 필요한 subset에서 Graph-GA의 효과를 확인한다.

## 2. Current Folder Structure

```text
01-test-target-graphql-server/
  01-server/
    기존 Post/Comment 기반 vulnerable GraphQL lab server
  02-ground-truth/
    01 서버 ground truth

02-test-target-graphql-server/
  01-server/
    DVGA-inspired Paste/AuditLog/Workspace 기반 vulnerable GraphQL lab server
  02-ground-truth/
    02 서버 ground truth
  02-other-server-config/
    02 서버용 harness config/hints

03-independent-testing-program/
  01-test-program/
    독립 GraphQL authorization testing harness
  02-other-server-config/
    기본 01 서버용 config
  03-execution-results/
    실행 결과 JSON/Markdown

Damn-Vulnerable-GraphQL-Application c/
  DVGA 원본 clone. 분석 참고용이며 현재 scoring target은 아님.

info/
  현재 코드 기준 최신 문서 세트
```

## 3. Target 01: Existing Post/Comment Server

위치:

```text
01-test-target-graphql-server/01-server
```

Endpoint:

```text
http://127.0.0.1:3000/graphql
```

기술 스택:

- Express
- express-graphql
- Sequelize
- SQLite
- TypeScript

주요 object type:

| Type | Security meaning |
| --- | --- |
| `User` | session/user identity, `resetToken` sensitive field |
| `Post` | private/public ownership object, `internalNote` sensitive field |
| `Comment` | private/public ownership object, `moderationNote` sensitive field |
| `InternalStats` | secure admin-like decoy |
| `CommandOutput` | admin-like mutation output |

Ground truth:

```text
vulnerable entries: 26
secure/decoy entries: 29
sequence-like vulnerable entries: 8
surface-like vulnerable entries: 18
```

Target 01의 역할:

```text
Graph-GA의 limited-budget prioritization 효과를 보여주는 primary benchmark.
```

## 4. Target 02: DVGA-Inspired GraphQL Server

위치:

```text
02-test-target-graphql-server/01-server
```

Endpoint:

```text
http://127.0.0.1:3100/graphql
```

기술 스택:

- Express
- express-graphql
- express-session
- TypeScript
- In-memory deterministic state

주요 object type:

| Type | Security meaning |
| --- | --- |
| `User` | user/admin identity, `resetToken`, `apiKey`, `debugToken` |
| `Paste` | paste ownership object, `internalNote`, `ownerSecret` |
| `AuditLog` | audit/event object, `moderationNote`, `reviewToken` |
| `Workspace` | 협업 workspace object, ownership/lifecycle sequence target |
| `SystemReport` | secure admin-only decoy |
| `CommandOutput` | admin command-like resolver output |

Ground truth:

```text
vulnerable entries: 47
secure/decoy entries: 37
sequence-like vulnerable entries: 20
surface-like vulnerable entries: 27
```

Target 02의 역할:

```text
서버1의 Post/Comment domain과 hard-coded sensitive field overfit을 줄이고,
Paste/AuditLog/Workspace 기반 broader GraphQL authorization benchmark를 제공한다.
```

## 5. Target 02 Vulnerability Mapping

| Surface | Implemented resolver/type | Harness category |
| --- | --- | --- |
| Paste ownership mistakes | `paste`, `entry`, `updatePaste`, `deletePaste`, `reviseEntry`, `retireEntry` | BOLA, update/delete, stale |
| Audit/event ownership mistakes | `auditLog`, `record`, `updateAuditLog`, `deleteAuditLog`, `reviseRecord`, `retireRecord` | BOLA, update/delete, stale |
| Workspace ownership/lifecycle | `workspace`, `createWorkspace`, `updateWorkspace`, `deleteWorkspace` | BOLA, update/delete, stale |
| Secure workspace decoys | `secureWorkspace`, `myWorkspaces`, `secureUpdateWorkspace`, `secureDeleteWorkspace` | secure/decoy |
| Admin diagnostics exposure | `adminUsers`, `adminCommand`, `maintenanceTask` | BFLA |
| Sensitive object fields | `resetToken`, `apiKey`, `debugToken`, `internalNote`, `ownerSecret`, `moderationNote`, `reviewToken` | BOPLA |
| SQL injection-like search | `searchPastes(query)` broadens result on `' or 1=1`-like input | simulated DVGA-style surface |
| SSRF/command-shaped import | `importRemotePaste(host,path,scheme)` stores unsafe source metadata | simulated DVGA-style surface |
| Path traversal-shaped upload | `uploadPaste(filename,content)` stores unsafe filename metadata | simulated DVGA-style surface |

실제 command execution, outbound network request, filesystem write는 수행하지 않는다. 위험한 DVGA 동작은 deterministic local simulation으로만 표현했다.

## 6. Harness-Supported Vulnerability Classes

현재 코드의 `AttackType`은 다음 5개다.

```text
BOLA_READ
BOLA_UPDATE_DELETE
STALE_OBJECT_ACCESS
BFLA_ADMIN_LIKE_OP
BOPLA_SENSITIVE_FIELD_READ
```

따라서 02 서버도 이 5개를 중심으로 ground truth를 구성한다. DVGA의 introspection, batching DoS, field suggestion, stack trace, JWT bypass 등은 참고 분석 대상이지만 현재 TP/FP/FN scoring target은 아니다.

## 7. Current Verification Snapshot

검증 날짜: 2026-06-18

공통 검증:

| Check | Result |
| --- | --- |
| `npm run tsc` | pass |
| Target 01 curve | seeds 1,2,3 / budgets 40,80,120,160,200 |
| Target 02 curve | seeds 1,2,3 / budgets 40,80,120,160,200 |
| Target 02 manual Workspace query | pass |
| Target 02 `npm run security:fuzz:02` | pass |

최신 해석:

```text
Target 01: Graph-GA가 low/mid budget 전체 기준에서 우위.
Target 02: 전체 기준은 random-sequence-gene 우위.
Target 02: sequence-like subset은 Graph-GA 우위.
```

## 8. Run Commands

Build:

```bash
npm run tsc
```

Run target 01:

```bash
./run.sh
```

Run target 02:

```bash
npm run server:02
```

Evaluate target 01:

```bash
node build/03-independent-testing-program/01-test-program/lib/security-testing/cli.js run \
  --config 03-independent-testing-program/02-other-server-config/config.yaml \
  --seeds 1,2,3 \
  --budgets 40,80,120,160,200
```

Evaluate target 02:

```bash
node build/03-independent-testing-program/01-test-program/lib/security-testing/cli.js run \
  --config 02-test-target-graphql-server/02-other-server-config/config.yaml \
  --seeds 1,2,3 \
  --budgets 40,80,120,160,200
```

Target 02 reset:

```bash
curl -X POST http://127.0.0.1:3100/reset \
  -H 'Content-Type: application/json' \
  -d '{"clearSessions":true}'
```