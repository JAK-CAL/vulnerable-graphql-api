# GraphQL Authorization Regression Testing Feedback

## Scope

이 프로젝트는 소유한 local vulnerable GraphQL lab에 대한 authorization regression testing harness다. 외부 endpoint 스캔, credential attack, stealth, persistence, bypass, data exfiltration은 구현 범위가 아니다.

## Reporter 반영 사항

brief 기준으로 reporter는 단순 finding 목록만 쓰지 않고 다음 산출물을 남기도록 확장했다.

- `op_catalog.json`: schema/operation catalog
- `object_pool.json`: locally created test object pool
- `attack_execution_log.json`: replay 가능한 sequence와 execution result
- `findings.json`: GA-prioritized run의 unique finding
- `evaluation_result.json`: baseline별 request budget, first finding, coverage, valid sequence ratio
- `generation_log.json`: baseline별 candidate ordering, fitness, FSM state, execution completion, finding id
- `ground_truth_comparison.json`: TP/FP/FN 및 missed expected finding
- `feedback.md`: 발표/보고서에 붙일 수 있는 결과 해석과 안전한 claim

기본 ground truth는 이 intentionally vulnerable lab의 seeded authorization regression target을 기준으로 한다. 필요하면 `--ground-truth ground_truth.json` 또는 `groundTruthPath`로 별도 파일을 지정할 수 있다.

## Evaluation Feedback

현재 구현은 end-to-end MVP로는 충분히 의미가 있다. schema cataloging, two-session execution, object pool capture, predefined authorization regression scenarios, local-only execution, JSON reporting, baseline comparison이 한 흐름으로 연결되어 있다.

다만 현재 baseline은 아직 기법 차별성을 강하게 증명하기에는 관대하다. 특히 feasible AttackGene 후보를 공유하면 random/template baseline도 이미 security-aware한 후보군을 보게 된다. 따라서 finding 수가 비슷하게 나오면 “FSM-guided GA가 항상 random보다 빠르다”고 주장하지 않는 것이 맞다.

안전한 claim은 다음 정도다.

> 이 구현은 local vulnerable GraphQL lab에서 OWASP structural authorization/resource regression checks를 자동 생성하고, 제한된 request budget 안에서 baseline별 실행 순서와 coverage를 비교하는 reproducible testing harness다.

피해야 할 claim은 다음이다.

> 이 결과만으로 FSM-guided GA가 모든 GraphQL target에서 random보다 우월하다고 말할 수 있다.

## Next Steps

기법 차별성을 더 분명히 하려면 brief의 ticket 순서대로 진행하는 것이 좋다.

1. PureRandomSchemaBaseline을 별도로 구현해서 raw operation/actor/payload/selection random을 기록한다.
2. RandomAttackGeneOrderingBaseline으로 현재 random의 의미를 명확히 분리한다.
3. DependencyOnlyBaseline에서 OWASP template과 FSM progress 접근을 제거한다.
4. MIO-lite archive 기반 FsmGuidedGaStrategy를 구현하고 generation별 best score를 기록한다.
5. ground truth를 프로젝트 파일로 고정하고 TP/FP/FN을 정식 metric으로 사용한다.
6. budget과 seed를 여러 개 두고 평균/중앙값을 비교한다.
