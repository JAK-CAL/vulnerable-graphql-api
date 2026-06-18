# FSM Design

이 문서는 현재 코드 기준 FSM/attack-readiness 설계를 정리한 최신본이다. 여기서 FSM은 서버 내부 state machine이 아니라, testing harness가 GraphQL operation sequence를 security test 관점에서 평가하기 위한 testing-side state model이다.

## 1. FSM의 역할

FSM이 답하는 질문은 다음이다.

```text
1. 필요한 actor/session이 준비되었는가?
2. owner object가 생성되었는가?
3. attacker가 foreign object id를 사용할 수 있는가?
4. read/update/delete/admin/sensitive-field target이 실행되었는가?
5. runtime oracle을 적용할 수 있는 trace가 만들어졌는가?
```

`FOUND` 여부는 FSM이 단독으로 결정하지 않는다. 최종 finding 판정은 `oracle.ts`가 response trace, object pool evidence, baseline response를 보고 수행한다.

따라서 정확한 설명은 다음에 가깝다.

```text
FSM is an attack-readiness model used by sequence generation, prioritization, and runtime feedback. It is not a standalone server automaton and not the final oracle.
```

## 2. Overall Flow

현재 흐름:

```text
Schema introspection
→ operation catalog
→ static classification and hints
→ attack population
→ dependency graph
→ sequence lowering
→ Graph-GA scheduling
→ execution
→ runtime feedback
→ oracle finding
→ ground truth comparison
```

Graph-GA에서는 여기에 다음 요소가 더해진다.

```text
objective archive
semantic path rarity
runtime fitness
stateful objective quota
mutation and repair
```

## 3. Testing-Side State

FSM/feedback이 간접적으로 보는 state는 다음과 같다.

| State item | Meaning |
| --- | --- |
| actor sessions | owner, attacker, anonymous/admin-like actor 준비 여부 |
| object pool | 생성/관찰된 object id, owner, type, evidence |
| lifecycle | object가 created/deleted/stale 상태인지 |
| foreign reference | attacker가 owner object id를 사용할 수 있는지 |
| executed operations | sequence step history |
| last responses | data/errors/status/evidence |
| coverage | resolver/object type/template/sensitive field coverage |
| baseline trace | anonymous 또는 secure resolver와 비교할 근거 |

이 state는 하나의 `fsm.ts`에 모여 있다기보다 `attack_registry.ts`, `sequence_planner.ts`, `graph_ga.ts`, `oracle.ts`에 분산되어 있다.

## 4. BOLA_READ State Model

필요 흐름:

```text
INIT
→ OWNER_SESSION_READY
→ ATTACKER_SESSION_READY
→ OWN_OBJECT_AVAILABLE
→ FOREIGN_REFERENCE_AVAILABLE
→ READ_OP_READY
→ ATTACK_EXECUTED
→ FOUND / NOT_FOUND
```

현재 lowering 예:

```text
AUTH(owner)
owner.createObject(...)
AUTH(attacker)
attacker.readById(id = owner.object.id)
ANON baseline read
```

Oracle 기준:

- attacker가 owner private object를 받는다.
- response id가 object pool의 owner object id와 일치한다.
- public object 때문에 생기는 FP를 줄이기 위해 unauthenticated baseline을 비교한다.

Server 1 예:

```text
createPost -> post(id)
createComment -> comment(id)
```

Server 2 예:

```text
createPaste -> paste(id)
createAuditLog -> auditLog(id)
createWorkspace -> workspace(id)
```

## 5. BOLA_UPDATE_DELETE State Model

필요 흐름:

```text
INIT
→ OWNER_SESSION_READY
→ OWN_OBJECT_AVAILABLE
→ ATTACKER_SESSION_READY
→ FOREIGN_REFERENCE_AVAILABLE
→ MUTATION_READY
→ ATTACK_EXECUTED
→ SIDE_EFFECT_OPTIONALLY_VERIFIED
→ FOUND / NOT_FOUND
```

현재 lowering 예:

```text
AUTH(owner)
owner.createObject(...)
AUTH(attacker)
attacker.updateOrDelete(id = owner.object.id)
owner.verifyRead(id = owner.object.id)
```

Oracle 기준:

- attacker mutation 응답에 owner object id가 포함된다.
- GraphQL/runtime error가 없어야 한다.
- response가 cross-user mutation success를 보여야 한다.

Server 2 Workspace 예:

```text
createWorkspace(owner)
updateWorkspace(attacker, id = owner.workspace.id)
deleteWorkspace(attacker, id = owner.workspace.id)
secureUpdateWorkspace(attacker, id = owner.workspace.id) should fail
secureDeleteWorkspace(attacker, id = owner.workspace.id) should fail
```

이 Workspace target은 Server 2를 단순 BOPLA/BFLA surface 서버로 두지 않고, 실제 sequence-required authorization benchmark 역할을 하도록 추가한 부분이다.

## 6. STALE_OBJECT_ACCESS State Model

필요 흐름:

```text
INIT
→ OWNER_SESSION_READY
→ OBJECT_CREATED
→ OBJECT_DELETED
→ STALE_REFERENCE_READY
→ READ_DELETED_EXECUTED
→ FOUND / NOT_FOUND
```

현재 lowering 예:

```text
AUTH(owner)
owner.createObject(...)
owner.deleteObject(id)
owner.readById(id)
```

Oracle 기준:

- delete step이 성공한다.
- read step도 성공한다.
- read response의 `deleted` field가 `true`다.

주의점:

- Server 1에서는 high budget에서 secure/history resolver에 stale-object FP가 일부 발생했다.
- 이는 FSM 문제가 아니라 oracle refinement point다. secure/history resolver가 deleted object를 audit/history 목적으로 보여주는 경우와 stale unauthorized access를 더 정교하게 구분해야 한다.

## 7. BFLA_ADMIN_LIKE_OP State Model

필요 흐름:

```text
INIT
→ LOW_PRIV_SESSION
→ ADMIN_OP_AVAILABLE
→ ADMIN_OP_EXECUTED
→ FOUND / NOT_FOUND
```

현재 admin-like classification:

- resolver name에 `admin`, `super`, `secret`, `private`, `internal`
- 또는 hints에서 `admin_like`

Oracle 기준:

- low-privilege actor가 admin-like resolver를 실행한다.
- data가 반환되고 error가 없다.
- secure/admin-required resolver는 low-privilege actor에게 data를 반환하지 않아야 한다.

Server 2 vulnerable examples:

```text
adminUsers
adminCommand
maintenanceTask
```

Server 2 secure counterexamples:

```text
privateSystemReport
internalStats
secureAdminCommand
```

BFLA는 대부분 short sequence로 충분하다. 이 때문에 random/template도 빠르게 찾을 수 있고, Graph-GA의 sequence 구성 강점이 크게 드러나지 않는다.

## 8. BOPLA_SENSITIVE_FIELD_READ State Model

필요 흐름:

```text
INIT
→ LOW_PRIV_SESSION
→ SENSITIVE_SURFACE_AVAILABLE
→ SENSITIVE_FIELD_SELECTED
→ READ_EXECUTED
→ FOUND / NOT_FOUND
```

기존 hard-coded sensitive fields:

```text
resetToken
internalNote
moderationNote
```

Server 2에서 hints로 확장한 broader fields:

```text
apiKey
ownerSecret
reviewToken
debugToken
```

Oracle 기준:

- low-privilege actor가 sensitive field를 selection set에 넣어 요청한다.
- response data에 해당 sensitive field 값이 실제로 존재한다.

Server 2 examples:

```text
me.resetToken
user(id).resetToken
paste(id).internalNote
searchPastes(query).internalNote
auditLog(id).moderationNote
passwordReset(input).resetToken
```

주의점:

- BOPLA는 GraphQL selection set만으로도 찾을 수 있는 경우가 많다.
- 따라서 BOPLA가 많은 target에서는 random/template baseline이 강해질 수 있다.
- 이 현상 때문에 Server 2 전체 결과에서는 random이 Graph-GA보다 높게 나온다.

## 9. Dependency Graph와 FSM의 관계

Dependency graph는 “기술적으로 가능한 operation 연결”을 제공한다.

```text
createPaste -> paste(id)
createPaste -> updatePaste(id)
createPaste -> deletePaste(id)

createAuditLog -> auditLog(id)
createAuditLog -> updateAuditLog(id)
createAuditLog -> deleteAuditLog(id)

createWorkspace -> workspace(id)
createWorkspace -> updateWorkspace(id)
createWorkspace -> deleteWorkspace(id)
```

FSM/attack-readiness는 그 연결이 security test로 의미 있는지 판단한다.

```text
Dependency graph:
  이 operation 다음에 어떤 operation이 가능한가?

FSM:
  이 transition이 BOLA/BFLA/BOPLA/STALE 검증 상태를 진전시키는가?
```

예:

```text
createWorkspace -> workspace(id)
```

이 연결만 있으면 단순 dependency다. 여기에 actor 전환이 들어가면 BOLA_READ test가 된다.

```text
owner.createWorkspace
attacker.workspace(id = owner.workspace.id)
```

삭제 후 같은 id를 다시 읽으면 STALE_OBJECT_ACCESS test가 된다.

```text
owner.createWorkspace
owner.deleteWorkspace(id)
owner.workspace(id)
```

## 10. Graph-GA에서 FSM이 반영되는 방식

현재 Graph-GA는 stateful authorization objective를 별도로 분류한다.

```text
BOLA_READ
BOLA_UPDATE_DELETE
STALE_OBJECT_ACCESS
```

그리고 batch selection에서 약 45%까지 stateful objective 후보를 먼저 배정한다. 이유는 BOPLA/BFLA surface가 많은 target에서 surface-only 후보가 sequence-like 후보를 밀어내는 문제를 줄이기 위해서다.

효과:

- Server 2 전체 GT에서는 random이 여전히 더 높다.
- 하지만 Server 2 sequence-like subset에서는 Graph-GA가 random보다 높다.
- 즉 FSM/attack-readiness guidance는 “전체 취약점 만능”이 아니라 “stateful authorization path”에서 의미가 있다.

## 11. Current Limitation

현재 구현은 독립 FSM engine을 별도 모듈로 완전히 분리한 구조는 아니다. FSM 개념은 다음 요소에 분산되어 있다.

- `attack_registry.ts`의 template/fsm metadata
- `sequence_planner.ts`의 attack-specific lowering
- `graph_ga.ts`의 feedback/fitness/archive/stateful quota
- `oracle.ts`의 finding 판정
- report의 `attackReadyRate`

따라서 리포트에서는 다음처럼 쓰는 것이 정확하다.

```text
We model attack readiness as FSM-like states and use that model in sequence lowering, prioritization, and runtime feedback. The implementation is integrated across the harness rather than implemented as a separate standalone automaton.
```

남은 개선점:

- FSM transition state를 별도 로그로 export하면 설명력이 좋아진다.
- BOPLA/BFLA와 sequence-like objective를 report에서 자동 분리하면 결과 해석이 더 명확해진다.
- stale-object oracle은 secure history/view resolver와 실제 stale access를 더 잘 구분해야 한다.