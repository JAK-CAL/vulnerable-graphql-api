# Server 1 vs Server 2 Validation

이 문서는 기존 `01-test-target-graphql-server`와 새 `02-test-target-graphql-server`를 현재 코드 기준으로 비교해, 02 서버가 유의미한 추가 benchmark인지 검증한 결과다.

## 1. Question

검증 질문:

```text
02 서버는 단순히 점수가 잘 나오도록 만든 서버인가?
아니면 01 서버와 다른 평가 의미를 제공하는 유의미한 second target인가?
```

결론:

```text
02 서버는 유의미하다.
하지만 Graph-GA 우위 증명용 main benchmark가 아니라,
overfitting 점검과 cross-target robustness 검증용 benchmark로 의미가 있다.
```

## 2. Structural Comparison

| Item | Server 1 | Server 2 |
| --- | --- | --- |
| Folder | `01-test-target-graphql-server` | `02-test-target-graphql-server` |
| Endpoint | `127.0.0.1:3000/graphql` | `127.0.0.1:3100/graphql` |
| Main domain | `Post`, `Comment` | `Paste`, `AuditLog`, `Workspace` |
| Storage | SQLite/Sequelize | In-memory deterministic state |
| Design goal | Graph-GA limited-budget prioritization benchmark | DVGA-inspired robustness and overfitting benchmark |
| Vulnerable GT | 26 | 47 |
| Secure/decoy GT | 29 | 37 |
| Sequence-like vulnerable GT | 8 | 20 |

## 3. Why Server 1 Exists

Server 1은 원래 프로젝트의 핵심 가설을 가장 잘 보여주는 target이다.

핵심 가설:

```text
Graph-GA는 제한된 request budget에서 dependency-aware authorization sequence를 random/template보다 먼저 실행한다.
```

Server 1이 이 가설과 잘 맞는 이유:

- `Post`, `Comment` lifecycle이 create/read/update/delete로 명확하다.
- owner object를 만든 뒤 attacker가 foreign id를 사용하는 흐름이 자연스럽다.
- stale access도 delete 후 read로 정의된다.
- sequence-like 취약점이 작지만 명확하게 존재한다.

Server 1의 역할:

```text
성능 주장용 primary benchmark
```

## 4. Why Server 2 Exists

Server 1만 있으면 다음 의심을 피하기 어렵다.

```text
혹시 Post/Comment domain에만 맞춘 것 아닌가?
혹시 resetToken/internalNote/moderationNote 같은 hard-coded field 이름에만 맞춘 것 아닌가?
혹시 secure resolver가 너무 단순한 것 아닌가?
혹시 sequence가 아니라 template ordering만 잘한 것 아닌가?
```

Server 2는 이 의심을 줄이기 위해 만들었다.

Server 2의 보완 요소:

- domain을 `Paste`, `AuditLog`, `Workspace`로 변경했다.
- `apiKey`, `ownerSecret`, `reviewToken`, `debugToken` 같은 broadened sensitive field를 추가했다.
- `PasteView`, `AuditLogView`, `WorkspaceView`, `UserSession` 같은 redacted safe type을 추가했다.
- `entry`, `record`, `reviseEntry`, `retireRecord`, `maintenanceTask`처럼 neutral resolver name을 사용했다.
- Workspace domain으로 sequence-required BOLA/update-delete/stale target을 추가했다.

Server 2의 역할:

```text
robustness and overfitting benchmark
```

## 5. Ground Truth Complementarity

| Category | Server 1 | Server 2 | Meaning |
| --- | ---: | ---: | --- |
| Total vulnerable | 26 | 47 | Server 2가 더 넓은 평가 표면 제공 |
| Secure/decoy | 29 | 37 | Server 2가 FP 억제 확인에 더 유리 |
| Sequence-like vulnerable | 8 | 20 | Server 2가 sequence subset도 보완 |
| Surface-like vulnerable | 18 | 27 | Server 2는 BOPLA/BFLA surface도 더 많음 |

해석:

- Server 1은 Graph-GA의 limited-budget 장점을 보기 좋다.
- Server 2는 더 넓고 어렵지만, 전체 결과에서 random/template이 강해질 수 있다.
- 두 서버는 같은 주장을 반복하는 관계가 아니라, 장점과 한계를 분리해서 보여주는 보완관계다.

## 6. Full Benchmark Comparison

### 6.1 Server 1 Full GT

3 seeds 평균:

| Budget | graph-ga TP/F1 | random TP/F1 | template TP/F1 | ga-without-fsm TP/F1 |
| ---: | --- | --- | --- | --- |
| 40 | 7.33 / 0.44 | 4.67 / 0.31 | 2.00 / 0.15 | 6.00 / 0.37 |
| 80 | 15.33 / 0.74 | 10.67 / 0.58 | 6.00 / 0.37 | 13.00 / 0.67 |
| 120 | 19.33 / 0.85 | 17.67 / 0.81 | 14.00 / 0.70 | 18.67 / 0.84 |
| 160 | 24.67 / 0.95 | 24.00 / 0.96 | 22.00 / 0.92 | 23.00 / 0.94 |
| 200 | 26.00 / 0.97 | 26.00 / 1.00 | 25.00 / 0.98 | 26.00 / 1.00 |

해석:

- Server 1에서는 low/mid budget에서 Graph-GA가 가장 좋다.
- high budget에서는 random/ablation도 따라오며 차이가 줄어든다.
- Graph-GA는 high budget에서 stale-object FP가 생긴다.

### 6.2 Server 2 Full GT

3 seeds 평균:

| Budget | graph-ga TP/F1 | random TP/F1 | template TP/F1 | ga-without-fsm TP/F1 |
| ---: | --- | --- | --- | --- |
| 40 | 7.00 / 0.26 | 10.67 / 0.37 | 6.00 / 0.23 | 6.00 / 0.23 |
| 80 | 16.00 / 0.51 | 20.33 / 0.60 | 13.00 / 0.44 | 15.00 / 0.48 |
| 120 | 24.67 / 0.68 | 28.67 / 0.76 | 21.00 / 0.62 | 28.00 / 0.75 |
| 160 | 29.00 / 0.77 | 36.00 / 0.87 | 30.00 / 0.78 | 28.67 / 0.76 |
| 200 | 36.67 / 0.88 | 39.67 / 0.91 | 35.67 / 0.86 | 36.67 / 0.88 |

해석:

- Server 2 전체 기준에서는 random이 Graph-GA보다 높다.
- 이는 서버2가 Graph-GA에 맞춰진 target이 아니라는 증거다.
- 다만 Graph-GA는 FP 0을 유지한다.

## 7. Sequence-like Comparison

이 subset은 프로젝트 본질과 가장 직접적으로 연결된다.

```text
BOLA_READ
BOLA_UPDATE_DELETE
STALE_OBJECT_ACCESS
```

### 7.1 Server 1 Sequence-like

| Budget | graph-ga | random | template | ga-without-fsm |
| ---: | ---: | ---: | ---: | ---: |
| 40 | 5.33 | 1.00 | 2.00 | 5.00 |
| 80 | 8.00 | 2.67 | 6.00 | 6.00 |
| 120 | 8.00 | 6.33 | 8.00 | 8.00 |
| 160 | 8.00 | 8.00 | 8.00 | 8.00 |
| 200 | 8.00 | 8.00 | 8.00 | 8.00 |

### 7.2 Server 2 Sequence-like

| Budget | graph-ga | random | template | ga-without-fsm |
| ---: | ---: | ---: | ---: | ---: |
| 40 | 5.00 | 2.67 | 6.00 | 5.00 |
| 80 | 11.33 | 5.67 | 13.00 | 12.00 |
| 120 | 16.00 | 9.33 | 17.00 | 13.00 |
| 160 | 19.00 | 12.00 | 17.00 | 13.00 |
| 200 | 19.00 | 15.00 | 17.00 | 13.00 |

해석:

- 두 서버 모두 sequence-like subset에서 Graph-GA는 random보다 높다.
- Server 1에서는 low budget부터 강하게 앞선다.
- Server 2에서는 template-only가 early budget에서 강하지만, Graph-GA는 random보다 일관되게 높고 high budget에서는 template보다도 높다.
- 이 결과가 두 서버의 가장 중요한 보완 관계다.

## 8. Is Server 2 Meaningful?

Yes, but with a narrow and honest framing.

Server 2가 의미 있는 이유:

1. Server 1 domain/name/field overfit을 줄인다.
2. secure redacted resolver와 decoy로 FP 억제를 확인한다.
3. Workspace domain으로 sequence-required target을 추가했다.
4. 전체 benchmark에서는 Graph-GA가 지기 때문에 과적합 target이 아니라는 점을 보여준다.
5. sequence-like subset에서는 Graph-GA가 random보다 높아 방법론의 핵심 정체성을 보완 검증한다.

Server 2가 증명하지 않는 것:

```text
Graph-GA가 모든 GraphQL 취약점에서 random/template보다 우수하다.
Graph-GA가 실제 world API에서 그대로 높은 성능을 낸다.
Injection/DoS/batching까지 평가했다.
```

## 9. Complementarity Verdict

두 서버의 관계:

```text
Server 1:
  Graph-GA가 왜 필요한지 보여주는 primary benchmark.

Server 2:
  그 결과가 과적합인지 점검하고, broader domain에서 장점과 한계를 동시에 보여주는 robustness benchmark.
```

리포트에서 이렇게 쓰는 것이 가장 안전하다.

```text
The two targets are complementary. Server 1 shows the benefit of Graph-GA under limited budgets on a sequence-friendly Post/Comment authorization benchmark. Server 2 intentionally broadens the domain and includes more surface-like GraphQL vulnerabilities, where random/template baselines are competitive or stronger. However, when restricted to sequence-like authorization vulnerabilities, Graph-GA still recovers more issues than random on both targets. This supports a narrower but more defensible claim: Graph-GA is useful for prioritizing stateful authorization sequences, not for universally outperforming all baselines on every GraphQL vulnerability surface.
```

## 10. Recommended Final Report Placement

리포트 구성 추천:

1. Server 1 전체 budget curve로 Graph-GA 장점 제시.
2. Server 1 sequence-like subset으로 “왜 잘 나왔는지” 설명.
3. Server 2 설계 이유와 overfitting 방지 수정 설명.
4. Server 2 전체 결과에서 random이 더 높다는 사실을 숨기지 않음.
5. Server 2 sequence-like subset으로 Graph-GA의 핵심 강점이 cross-domain에서도 남는다는 점 제시.
6. Limitations에서 template-only early strength, low crossover, stale-object FP, 3-seed limitation 언급.