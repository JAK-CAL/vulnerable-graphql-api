# Info Folder

이 폴더는 현재 코드 기준으로 프로젝트 설명, 서버 설계, Graph-GA 로직, 평가 결과, 한계 해석을 다시 정리한 최신 문서 세트다.

## Files

| File | Purpose |
| --- | --- |
| `project_core_explanation.md` | 프로젝트 핵심 주장, 안전한 claim, 코드 구성 요약 |
| `current_project_and_server_summary.md` | 현재 repo 구조와 01/02 서버 설계 요약 |
| `graph_ga_strategy.md` | 현재 Graph-GA의 sequence chromosome, archive, feedback, 균형형 prioritization 설명 |
| `fsm_design.md` | attack-readiness/FSM 개념과 attack type별 sequence 상태 모델 |
| `testing_evaluation_guide.md` | 재현 명령, metric, RQ, 결과 해석 가이드 |
| `evaluation_report.md` | 서버1/서버2 최신 평가 결과와 해석 |
| `overfitting_feedback.md` | 서버2 overfitting 점검, Workspace 보강, GA 피드백 반영 내역 |
| `server1_vs_server2_validation.md` | 서버1/서버2 목적, 구조, 결과 비교 검증 |

## Current Code Snapshot

- Target 01: `01-test-target-graphql-server`
  - Domain: `User`, `Post`, `Comment`
  - Ground truth: 26 vulnerable, 29 secure/decoy
  - Role: primary benchmark for limited-budget sequence prioritization

- Target 02: `02-test-target-graphql-server`
  - Domain: `User`, `Paste`, `AuditLog`, `Workspace`
  - Ground truth: 47 vulnerable, 37 secure/decoy
  - Role: broader robustness and cross-domain benchmark

- Current Graph-GA update:
  - 기존 surface-heavy scoring을 조정했다.
  - `BOLA_READ`, `BOLA_UPDATE_DELETE`, `STALE_OBJECT_ACCESS`를 stateful authorization objective로 분류한다.
  - batch selection에서 stateful objective quota를 둔다.
  - `BFLA`/`BOPLA` surface smoke test는 버리지 않고 함께 유지한다.

## Latest Evaluation Snapshot

Evaluation condition:

```text
seeds: 1,2,3
budgets: 40,80,120,160,200
```

Target 01:

```text
budget 40:  graph-ga TP 7.33 / FP 0 / FN 18.67 / F1 0.44
budget 80:  graph-ga TP 15.33 / FP 0 / FN 10.67 / F1 0.74
budget 120: graph-ga TP 19.33 / FP 0 / FN 6.67 / F1 0.85
budget 200: graph-ga TP 26 / FP 1.33 / FN 0 / F1 0.97
```

Target 02:

```text
budget 40:  graph-ga TP 7 / FP 0 / FN 40 / F1 0.26
budget 80:  graph-ga TP 16 / FP 0 / FN 31 / F1 0.51
budget 120: graph-ga TP 24.67 / FP 0 / FN 22.33 / F1 0.68
budget 200: graph-ga TP 36.67 / FP 0 / FN 10.33 / F1 0.88
```

중요한 해석:

```text
Target 01 전체 기준: Graph-GA가 low/mid budget에서 우위.
Target 02 전체 기준: random-sequence-gene이 더 강함.
Target 02 sequence-like subset: Graph-GA가 random보다 명확히 강함.
```

## Recommended Reading Order

1. `project_core_explanation.md`
2. `current_project_and_server_summary.md`
3. `graph_ga_strategy.md`
4. `fsm_design.md`
5. `testing_evaluation_guide.md`
6. `evaluation_report.md`
7. `overfitting_feedback.md`
8. `server1_vs_server2_validation.md`
