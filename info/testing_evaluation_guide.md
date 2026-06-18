# Testing Evaluation Guide

이 문서는 현재 코드 기준으로 평가를 재현하고 해석하는 방법을 정리한 최신 가이드다. 리포트 작성 시에는 이 문서의 run condition, metric, 해석 원칙을 그대로 맞추는 것이 좋다.

## 1. Evaluation Principles

반드시 유지해야 할 원칙:

```text
1. 테스트 대상은 localhost owned lab server다.
2. execution 중 ground truth를 fitness나 selection에 사용하지 않는다.
3. runtime oracle은 suspected finding만 만든다.
4. ground truth는 실행 후 TP/FP/FN 비교에만 사용한다.
5. 같은 endpoint, 같은 actor setup, 같은 request budget으로 method를 비교한다.
6. request count를 primary budget으로 둔다.
7. full benchmark와 sequence-like subset을 분리해서 해석한다.
```

## 2. Primary Metrics

| Metric | Meaning |
| --- | --- |
| TP | vulnerable ground truth를 finding으로 회수 |
| FP | secure/decoy entry를 finding으로 잘못 보고 |
| FN | 놓친 vulnerable ground truth |
| Precision | finding quality |
| Recall | vulnerability recovery |
| F1 | precision/recall 균형 |
| Requests-to-first-finding | 얼마나 빨리 첫 finding을 찾는지 |
| Unique findings | budget 안에서 회수한 unique finding 수 |

## 3. Secondary Metrics

| Metric | Meaning |
| --- | --- |
| valid sequence ratio | 실행 가능한 sequence 비율 |
| attack-ready rate | oracle 적용 가능한 상태까지 도달한 비율 |
| unique target resolvers tested | 탐색한 resolver 다양성 |
| unique object types tested | 탐색한 object type 다양성 |
| unique templates exercised | attack type 다양성 |
| unique executable paths | 실행한 semantic path 다양성 |
| generation depth | seed/mutation/crossover가 실제로 얼마나 생겼는지 |

## 4. Subset Metrics

리포트에는 full benchmark만 넣으면 해석이 흔들릴 수 있다. 반드시 sequence-like subset도 함께 본다.

Sequence-like vulnerable classes:

```text
BOLA_READ
BOLA_UPDATE_DELETE
STALE_OBJECT_ACCESS
```

Surface-like vulnerable classes:

```text
BFLA_ADMIN_LIKE_OP
BOPLA_SENSITIVE_FIELD_READ
```

이유:

- Graph-GA의 핵심은 sequence-aware authorization testing이다.
- BOPLA/BFLA는 단일 request 또는 짧은 template으로도 잘 잡히는 경우가 많다.
- Server 2처럼 BOPLA/BFLA가 많은 target에서는 random/template이 full benchmark에서 강해질 수 있다.

따라서 안전한 해석은 다음 순서다.

```text
1. Full GT 결과로 전체 성능을 보고한다.
2. Sequence-like subset으로 프로젝트 핵심 가설을 검증한다.
3. 두 결과가 다르면 숨기지 말고 역할을 분리한다.
```

## 5. Target 01 Recommended Evaluation

Target 01은 Graph-GA의 limited-budget prioritization 효과를 보여주는 primary benchmark다.

Run server:

```bash
./run.sh
```

Recommended multi-budget command:

```bash
npm run security:fuzz -- --profile course --budgets 40,80,120,160,200 --seeds 1,2,3 --endpoint http://127.0.0.1:3000/graphql --ground-truth 01-test-target-graphql-server/02-ground-truth/ground_truth.json --out 03-independent-testing-program/03-execution-results/security-results
```

Current expected interpretation:

- budget 40/80에서 Graph-GA 우위가 가장 잘 보인다.
- sequence-like subset에서는 budget 80에 Graph-GA가 8/8을 회수한다.
- budget 160/200에서는 random/ablation도 따라오므로 “limited-budget advantage”로 표현해야 한다.
- high budget에서 stale-object FP가 발생할 수 있어 oracle refinement point로 언급한다.

Server 1 full benchmark summary:

| Budget | Best interpretation |
| ---: | --- |
| 40 | Graph-GA가 random/template보다 명확히 높음 |
| 80 | Graph-GA 우위가 가장 설명력 있음 |
| 120 | Graph-GA가 높지만 random/ablation이 접근 |
| 160 | 거의 saturation, FP 주의 |
| 200 | full recovery 구간, method 차이 작음 |

## 6. Target 02 Recommended Evaluation

Target 02는 DVGA-inspired cross-target robustness benchmark다.

Build:

```bash
npm run tsc
```

Run server:

```bash
npm run server:02
```

Reset:

```bash
curl -X POST http://127.0.0.1:3100/reset -H 'Content-Type: application/json' -d '{"clearSessions":true}'
```

Run default evaluation:

```bash
npm run security:fuzz:02
```

Run explicit evaluation:

```bash
npm run security:fuzz -- --config 02-test-target-graphql-server/02-other-server-config/config.yaml
```

Current expected interpretation:

- full benchmark에서는 random-sequence-gene이 Graph-GA보다 높다.
- 이 결과는 Server 2가 Graph-GA에 맞춘 target이 아님을 보여준다.
- sequence-like subset에서는 Graph-GA가 random보다 높다.
- Server 2는 Graph-GA 우위 증명용이 아니라 robustness/overfitting 점검용이다.

Server 2 full benchmark summary:

| Budget | graph-ga TP | random TP | template TP |
| ---: | ---: | ---: | ---: |
| 40 | 7.00 | 10.67 | 6.00 |
| 80 | 16.00 | 20.33 | 13.00 |
| 120 | 24.67 | 28.67 | 21.00 |
| 160 | 29.00 | 36.00 | 30.00 |
| 200 | 36.67 | 39.67 | 35.67 |

Server 2 sequence-like summary:

| Budget | graph-ga | random | template |
| ---: | ---: | ---: | ---: |
| 40 | 5.00 | 2.67 | 6.00 |
| 80 | 11.33 | 5.67 | 13.00 |
| 120 | 16.00 | 9.33 | 17.00 |
| 160 | 19.00 | 12.00 | 17.00 |
| 200 | 19.00 | 15.00 | 17.00 |

## 7. Manual Verification Queries for Target 02

Login as userB:

```graphql
mutation {
  login(username: "userB", password: "passwordB") {
    id
    username
  }
}
```

BOLA/BOPLA vulnerable read:

```graphql
query {
  paste(id: "2") {
    id
    title
    public
    deleted
    internalNote
  }
}
```

Secure counterexample:

```graphql
query {
  securePaste(id: "2") {
    id
    title
    public
    deleted
  }
}
```

BFLA/BOPLA admin-like exposure:

```graphql
query {
  adminUsers {
    id
    username
    resetToken
  }
}
```

Workspace BOLA read:

```graphql
query {
  workspace(id: "1") {
    id
    name
    ownerId
    deleted
  }
}
```

Workspace secure counterexample:

```graphql
query {
  secureWorkspace(id: "1") {
    id
    name
    ownerId
    deleted
  }
}
```

Workspace update/delete BOLA:

```graphql
mutation {
  updateWorkspace(id: "1", name: "attacker rename") {
    id
    name
    ownerId
  }
}
```

Two-step `passwordReset` BOPLA:

```graphql
mutation {
  register(username: "resetProof", password: "pw", firstName: "Reset", lastName: "Proof") {
    id
    username
    resetToken
  }
}
```

Then:

```graphql
mutation($input: JSON) {
  passwordReset(input: $input) {
    id
    username
    resetToken
  }
}
```

Variables:

```json
{
  "input": {
    "username": "resetProof",
    "reset_token": "resetProof-<id>-reset-token",
    "new_password": "pw2"
  }
}
```

## 8. Research Questions

현재 구현 기준으로 사용할 수 있는 RQ:

### RQ1. Dependency graph가 executable sequence 생성을 돕는가?

주요 evidence:

- valid sequence ratio
- dependency-only baseline과 비교
- object pool capture 성공 여부

### RQ2. FSM/attack-readiness가 oracle 적용 가능한 상태로 sequence를 유도하는가?

주요 evidence:

- attack-ready rate
- requests-to-first-finding
- covered attack types
- sequence-like subset recovery

### RQ3. Graph-GA가 limited budget에서 finding recovery를 높이는가?

주요 evidence:

- budget curve
- Graph-GA vs template-only/random/ga-without-fsm
- Server 1 full GT and sequence-like subset

### RQ4. Graph-GA가 broader second target에서도 의미 있는가?

주요 evidence:

- Server 2 full benchmark에서 random이 더 높다는 사실
- Server 2 sequence-like subset에서 Graph-GA가 random보다 높다는 사실
- secure/decoy FP 0 유지

### RQ5. GA가 template ordering에 머물지 않고 실제로 자손을 만드는가?

주요 evidence:

- `generation_log.json`
- seed/mutation/crossover count
- budget 80 이후 mutation candidate 증가

현재 확인된 generation fact:

```text
Server 1 budget 200: 189 candidates, 35 seed, 152 mutated, 2 crossover
Server 2 budget 200: 192 candidates, 32 seed, 154 mutated, 6 crossover
```

정확한 표현:

```text
Mutation and feedback-guided scheduling are active, but crossover is limited. The current Graph-GA is not merely template ordering, but it is also not a deep crossover-heavy genetic algorithm.
```

## 9. Current Limitations

현재 구현/평가에서 조심해야 할 점:

- `graph-ga-static-fitness` baseline은 별도로 완성된 상태가 아니다.
- `graph-ga-no-repair` baseline도 독립 ablation으로 분리되어 있지 않다.
- generation별 best/mean fitness curve는 충분히 상세하게 report되지 않는다.
- Server 2 full benchmark에서는 random-sequence-gene이 Graph-GA보다 높은 TP를 보이므로, 02를 전체 우위 주장용으로 쓰면 안 된다.
- Server 2 low/mid budget sequence-like subset에서 template-only가 Graph-GA보다 강한 구간이 있다.
- Server 1 high budget에서 stale-object FP가 발생한다.
- 3 seeds 평균은 최소 검증으로는 충분하지만 통계적 유의성 주장에는 부족하다.
- 현재 scoring 대상은 authorization-focused classes이며, injection/DoS/batching/introspection abuse까지 포함하지 않는다.

## 10. Safe Reporting Template

발표/리포트에는 다음 문장을 쓰는 것이 안전하다.

```text
The evaluation uses owned localhost GraphQL lab servers. Ground truth is used only after execution for TP/FP/FN comparison. Server 1 is the primary limited-budget benchmark and shows that Graph-GA recovers stateful authorization vulnerabilities faster than random or template-only baselines. Server 2 is a broader DVGA-inspired robustness benchmark. On Server 2, Graph-GA does not dominate the full benchmark; random-sequence-gene recovers more overall findings. However, on sequence-like authorization vulnerabilities, Graph-GA consistently recovers more than random, supporting a narrower claim that Graph-GA is useful for prioritizing stateful authorization sequences rather than universally outperforming every baseline on every GraphQL vulnerability surface.
```

짧은 한국어 버전:

```text
서버1은 Graph-GA의 제한 budget 우위를 보여주는 주 benchmark이고, 서버2는 과적합을 점검하는 robustness benchmark다. 서버2 전체 결과에서는 random이 더 높지만, sequence-like authorization subset에서는 Graph-GA가 random보다 높다. 따라서 본 프로젝트의 핵심 주장은 “모든 GraphQL 취약점에서 최고”가 아니라 “상태 전이가 필요한 authorization sequence를 우선 탐색하는 데 효과적”이라는 좁고 방어 가능한 주장으로 정리해야 한다.
```