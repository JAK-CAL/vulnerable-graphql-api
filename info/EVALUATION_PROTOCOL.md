# Evaluation Protocol (평가 기준 고정 문서)

이 문서는 리포트에 넣을 모든 수치가 **동일한 조건에서 재현 가능**하도록 평가 절차를 고정한다.
리포트의 모든 표는 이 프로토콜을 따른 실행 결과여야 한다.

## 1. 고정 실행 조건

```text
seeds            : 1, 2, 3        (모든 method, 모든 budget 동일)
budgets          : 40, 80, 120, 160, 200  (request 수 기준)
budget 단위       : 전송한 GraphQL HTTP request 총 개수
서버 리셋         : chromosome/run 간 server-side reset mutation 호출
ground truth 사용 : 실행 종료 후 TP/FP/FN 계산에만 사용 (fitness/selection 중 사용 금지)
보고 통계         : 3 seed의 평균(mean), 그리고 평균과 함께 표준편차(sd) 병기
```

## 2. 비교 method (총 6개, ablation 포함)

| Method | 정의 | 역할 |
| --- | --- | --- |
| `graph-ga` | dependency graph + attack template + runtime feedback + objective archive + stateful objective quota | 제안 방법 |
| `ga-without-fsm` | Graph-GA에서 attack-readiness/storage/guard/planner guidance 제거 | FSM 기여 분리 |
| `template-only` | attack template lowering 결과를 GA 진화 없이 실행 | template 기여 분리 |
| `random-sequence-gene` | 동일 AttackGene 후보를 무작위 순서로 실행 | GA 우선순위화 기여 분리 |
| `dependency-only` | dependency graph만 사용, security objective guidance 약함 | 하한선 |
| `pure-random-schema` | schema operation에 가까운 무작위 실행 | 하한선 |

## 3. 두 단계 지표 (반드시 분리 보고)

평가는 **전체 GT**와 **sequence-like subset**을 분리해서 본다.

```text
Full GT          : 모든 vulnerable 항목
Sequence-like    : BOLA_READ, BOLA_UPDATE_DELETE, STALE_OBJECT_ACCESS
                   (actor/object/lifecycle 전이가 필요한 항목)
Surface-like     : BFLA_ADMIN_LIKE_OP, BOPLA_SENSITIVE_FIELD_READ
                   (단일 또는 짧은 요청으로 노출되는 항목)
```

분리 이유: 본 프로젝트의 핵심 가설은 "stateful sequence를 잘 우선순위화한다"이다.
Surface-like 취약점은 random/template로도 쉽게 잡히므로, full GT만 보면 핵심 가설 검증이 흐려진다.

## 4. 지표 정의와 의미

| 지표 | 계산 | 이 프로젝트에서의 의미 |
| --- | --- | --- |
| TP | oracle finding이 vulnerable GT와 일치 | 실제로 인가가 깨진 케이스를 회수 |
| FP | oracle finding이 secure/decoy GT와 일치 | 안전한 resolver를 취약하다고 잘못 보고 |
| FN | 회수하지 못한 vulnerable GT | 놓친 실제 취약점 |
| Precision = TP/(TP+FP) | finding 신뢰도 | "보고한 게 진짜 취약점인가" |
| Recall = TP/(TP+FN) | 회수율 | "있는 취약점 중 몇 개를 찾았나" |
| F1 | precision·recall 조화평균 | 두 지표 균형 |
| Requests-to-first-finding | 첫 finding까지 request 수 | 제한 budget에서의 효율 |

**중요 단서:** oracle은 "suspected finding"만 만든다. TP로 집계되려면 수동 정의된 ground truth와
일치해야 한다. 즉 TP는 "oracle이 의심했고 + 실제로 취약한" 케이스다. ground truth는 BOLA/BOPLA/BFLA/
STALE 인가 기대를 수동 검증으로 라벨링했다(부록 A 참조). 따라서 본 리포트의 "취약점"은 임의 이상징후가
아니라 인가 정책 위반으로 정의된 케이스다.

## 5. Generation depth 검증 (GA가 실제로 도는지)

"앞단 template ordering만 한 것 아니냐"는 반박을 막기 위해 `generation_log.json`에서
seed/mutation/crossover 개수를 보고한다.

```text
검증 기준: budget 80 이상에서 mutation 후보가 seed 후보 수준 이상으로 생성되어야 한다.
```

## 6. 재현 명령

```bash
# Server 1
node build/.../cli.js run \
  --config 03-independent-testing-program/02-other-server-config/config.yaml \
  --seeds 1,2,3 --budgets 40,80,120,160,200

# Server 2
node build/.../cli.js run \
  --config 02-test-target-graphql-server/02-other-server-config/config.yaml \
  --seeds 1,2,3 --budgets 40,80,120,160,200
```

## 7. 표준편차 측정 (TODO — 리포트 제출 전 필수)

현재 문서들은 3 seed **평균만** 기록돼 있다. 리포트 신뢰도를 위해 각 셀에 표준편차를 병기한다.
`budget_curve.json`에 seed별 raw 값이 있으면 아래로 계산:

```bash
node - <<'NODE'
const fs=require('fs');
// per-method, per-budget seed별 TP 배열 -> mean ± sd 출력
// (raw seed 값이 저장돼 있지 않으면, seed별 결과 파일을 따로 모아 계산)
NODE
```

표준편차가 마진보다 작은 구간(특히 Server 1 budget 40/80, Server 2 sequence-like budget 80/120)을
"통계적으로 안정적인 우위 구간"으로 본문에 명시한다.
