# Overfitting Feedback and Applied Fixes

이 문서는 `02-test-target-graphql-server`가 처음에는 너무 잘 풀렸던 문제를 점검하고, 현재 프로젝트 목적에 맞게 수정한 내용을 정리한다. 핵심은 서버2를 “Graph-GA가 또 압승하는 서버”로 만드는 것이 아니라, 서버1의 아쉬운 점을 보완하는 유의미한 robustness benchmark로 만드는 것이다.

## 1. Broad Criteria Used

기준은 현재 harness가 지원하는 authorization vulnerability 범위와 일반 GraphQL/API security 기준을 함께 봤다.

주요 기준:

- OWASP GraphQL Cheat Sheet: GraphQL에서는 query/mutation 양쪽의 access control, insecure defaults, batching/DoS, injection 등을 함께 고려해야 한다.
- OWASP API1:2023 BOLA: object id를 조작해 다른 사용자의 object를 읽거나 수정/삭제하는 문제.
- OWASP API3:2023 BOPLA: 사용자가 접근하면 안 되는 object property를 읽거나 변경할 수 있는 문제.
- OWASP API5:2023 BFLA: low-privilege 사용자가 admin/function-level operation을 실행할 수 있는 문제.
- DVGA-style GraphQL target: paste ownership, search/filter, diagnostics/admin-like resolver, sensitive field exposure 같은 실험 표면.

참고:

- https://cheatsheetseries.owasp.org/cheatsheets/GraphQL_Cheat_Sheet.html
- https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/
- https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/
- https://owasp.org/API-Security/editions/2023/en/0xa5-broken-function-level-authorization/

중요한 제한:

```text
현재 harness가 점수화하는 것은 모든 GraphQL 취약점이 아니라,
BOLA/BOPLA/BFLA/STALE 중심의 authorization 취약점이다.
```

따라서 서버2도 injection, DoS, SSRF, introspection abuse까지 모두 평가하는 서버가 아니라, authorization-focused second target이다.

## 2. Original Overfitting Signals

초기 02 서버 결과:

```text
Graph-GA: TP 27, FP 0, FN 1
Template-only: TP 28, FP 0, FN 0
Ground truth: 28 vulnerable, 30 secure
```

문제 신호:

- Template-only가 거의 완벽했다.
- resolver 이름이 `admin`, `update`, `delete`, `secure`처럼 classifier 규칙과 너무 잘 맞았다.
- sensitive field가 `resetToken`, `internalNote`, `moderationNote` 중심이라 harness hard-coded field list와 너무 잘 맞았다.
- return type에 sensitive field가 많아 거의 모든 operation이 `sensitive_surface`로 분류되었다.
- sequence가 필요한 취약점보다 단발성 BOPLA/BFLA가 많아 Graph-GA의 본질인 sequence construction을 평가하기 어려웠다.

이 상태의 서버2는 robust benchmark라기보다 harness compatibility sanity check에 가까웠다.

## 3. First Fix: Broaden the Surface Without Targeting Graph-GA

### 3.1 Broadened Sensitive Field Handling

Harness에 `hints.sensitiveFields`를 추가했다.

기존 hard-coded field:

```text
resetToken
internalNote
moderationNote
```

Server 2 hints에 추가한 broader fields:

```text
apiKey
ownerSecret
reviewToken
debugToken
```

효과:

- sensitive property benchmark가 세 이름에만 맞춰지지 않는다.
- 다른 local server에 붙일 때도 config/hints로 민감 필드 후보를 확장할 수 있다.

### 3.2 Redacted Safe Return Types

안전 resolver가 기존 vulnerable object type을 그대로 반환하면 schema상 sensitive field가 남아 BOPLA 후보가 과도하게 늘었다.

이를 줄이기 위해 safe return type을 추가했다.

```text
UserSession
PasteView
AuditLogView
SystemStatus
WorkspaceView
```

효과:

- secure/public resolver가 불필요하게 `sensitive_surface`로 분류되는 비율이 줄었다.
- secure resolver가 실제 secure counterexample 역할을 하게 되었다.

### 3.3 Neutral Vulnerable Resolver Names

너무 쉬운 이름만 쓰지 않도록 neutral resolver를 추가했다.

```text
entry(id) -> Paste
record(id) -> AuditLog
reviseEntry(id, ...) -> Paste
retireEntry(id) -> Paste
reviseRecord(id, ...) -> AuditLog
retireRecord(id) -> AuditLog
maintenanceTask(command) -> CommandOutput
```

이 resolver들은 실제로 취약하지만 이름만 봐서는 `admin/update/delete`만큼 노골적이지 않다. 필요한 semantic tag는 hints로 제공한다.

### 3.4 Additional Safe Decoys

안전한 admin-like/secure decoy도 추가했다.

```text
adminSafeDirectory
privateSystemReport
internalStats
secureAdminCommand
securePaste
secureAuditLog
secureWorkspace
secureUpdateWorkspace
secureDeleteWorkspace
```

효과:

- 위험해 보이는 이름이 항상 취약하지 않다는 신호를 만든다.
- FP 평가가 더 의미 있어진다.

## 4. Second Fix: Add Meaningful Sequence-Required Domain

첫 수정만으로는 서버2가 넓어지긴 했지만, BOPLA/BFLA surface가 여전히 많았다. 이 경우 random/template baseline이 강해지는 것은 자연스럽다. 문제는 프로젝트의 핵심이 sequence-aware testing인데, 서버2가 그 핵심을 충분히 평가하지 못할 수 있다는 점이었다.

그래서 `Workspace` domain을 추가했다.

Vulnerable Workspace operations:

```text
workspace(id)              BOLA_READ + STALE_OBJECT_ACCESS
updateWorkspace(id, ...)   BOLA_UPDATE_DELETE
deleteWorkspace(id)        BOLA_UPDATE_DELETE
```

Secure Workspace counterexamples:

```text
secureWorkspace(id)
myWorkspaces
secureUpdateWorkspace(id, ...)
secureDeleteWorkspace(id)
```

설계 의도:

- 서버 사이즈를 과도하게 키우지 않는다.
- Server 1의 `Post/Comment`와 다른 domain으로 sequence-required authorization bug를 만든다.
- Graph-GA에 맞춘 특수한 operation 이름이 아니라 일반 SaaS-style workspace resource로 구성한다.
- BOLA read, update/delete, stale access를 모두 포함한다.
- secure view type을 사용해 safe resolver가 sensitive field surface로 오염되지 않게 한다.

현재 Server 2 ground truth:

```text
vulnerable entries: 47
secure/decoy entries: 37
sequence-like vulnerable entries: 20
```

## 5. GA Strategy Feedback

서버2를 고치면서 Graph-GA 쪽에서도 중요한 피드백이 나왔다.

문제:

```text
BOPLA/BFLA surface가 많은 target에서는 short template 후보가 sequence-like 후보를 밀어낼 수 있다.
```

이는 프로젝트 본질에 어긋날 수 있다. Graph-GA의 강점은 단순 field probing이 아니라 actor/object/lifecycle sequence를 구성하는 데 있기 때문이다.

현재 반영된 조정:

```text
stateful objective:
  BOLA_READ
  BOLA_UPDATE_DELETE
  STALE_OBJECT_ACCESS

batch selection:
  batchSize의 최대 약 45%를 stateful objective 후보에 우선 배정
```

이 조정은 Graph-GA를 서버2에 과적합시키기 위한 것이 아니라, 평가에서 sequence-like objective가 surface-like objective에 묻히지 않게 하는 보정이다.

## 6. Revised Verification

### 6.1 Server 2 Full Benchmark

3 seeds 평균:

| Budget | graph-ga TP | random TP | template TP | ga-without-fsm TP |
| ---: | ---: | ---: | ---: | ---: |
| 40 | 7.00 | 10.67 | 6.00 | 6.00 |
| 80 | 16.00 | 20.33 | 13.00 | 15.00 |
| 120 | 24.67 | 28.67 | 21.00 | 28.00 |
| 160 | 29.00 | 36.00 | 30.00 | 28.67 |
| 200 | 36.67 | 39.67 | 35.67 | 36.67 |

해석:

- 전체 GT 기준으로는 random-sequence-gene이 모든 budget에서 Graph-GA보다 높다.
- 따라서 Server 2를 “Graph-GA 성능 우위 증명용”으로 쓰면 안 된다.
- 이 결과는 오히려 서버2가 Graph-GA에 맞춘 과적합 target이 아니라는 증거다.

### 6.2 Server 2 Sequence-like Subset

3 seeds 평균:

| Budget | graph-ga | random-sequence-gene | template-only | ga-without-fsm |
| ---: | ---: | ---: | ---: | ---: |
| 40 | 5.00 | 2.67 | 6.00 | 5.00 |
| 80 | 11.33 | 5.67 | 13.00 | 12.00 |
| 120 | 16.00 | 9.33 | 17.00 | 13.00 |
| 160 | 19.00 | 12.00 | 17.00 | 13.00 |
| 200 | 19.00 | 15.00 | 17.00 | 13.00 |

해석:

- sequence-like subset에서는 Graph-GA가 random보다 강하다.
- template-only는 low/mid budget에서 여전히 강하다.
- 따라서 Graph-GA의 의미는 “모든 vulnerability enumeration에서 최고”가 아니라 “stateful authorization sequence에서 random보다 좋은 prioritization을 한다”로 잡아야 한다.

## 7. What This Fix Achieved

서버2는 이제 다음 역할을 한다.

```text
1. Server 1 naming/object/domain overfit 점검
2. broadened sensitive-field handling 검증
3. secure redacted resolver에 대한 FP 억제 확인
4. sequence-like authorization subset에서 Graph-GA의 cross-domain 효과 확인
5. full benchmark에서 Graph-GA의 한계도 정직하게 드러냄
```

이것이 리포트 관점에서 중요하다. 둘 다 Graph-GA가 압승하는 서버라면 과적합 의심을 피하기 어렵다. 현재 구성은 Server 1에서 장점, Server 2에서 일반화와 한계를 함께 보여준다.

## 8. Remaining Limitations

아직 남은 한계:

1. BOPLA ground truth가 field-level이 아니라 resolver/object-level에 가깝다.
2. crossover 비중이 낮아 deep crossover-driven GA라고 말하기 어렵다.
3. Server 2 low-budget sequence-like subset에서 template-only가 Graph-GA보다 강한 구간이 있다.
4. Server 1 high-budget에서 stale-object FP가 일부 발생한다.
5. 3 seeds 평균이라 통계적 유의성까지 강하게 주장하기에는 부족하다.
6. broader GraphQL 취약점 중 injection/DoS/batching은 현재 scoring 대상이 아니다.

## 9. Final Framing

리포트에서 안전한 문장:

```text
The second target was redesigned after an overfitting review. It no longer serves as a benchmark where Graph-GA dominates every baseline. Instead, it checks whether the harness still behaves correctly on a broader DVGA-inspired domain with redacted safe resolvers, neutral names, broader sensitive fields, and additional sequence-required Workspace vulnerabilities. The full benchmark exposes Graph-GA's limitations, while the sequence-like subset confirms that its useful advantage is concentrated on stateful authorization paths.
```

피해야 할 문장:

```text
Server 2 proves Graph-GA is generally better than random/template.
```

추천 문장:

```text
Server 2 makes the evaluation more credible because it prevents the report from relying only on a target that matches Graph-GA's strongest assumptions.
```