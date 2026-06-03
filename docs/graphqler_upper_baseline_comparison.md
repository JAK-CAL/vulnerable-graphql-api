# GraphQLer Upper Baseline Comparison

이 문서는 GraphQLer를 외부 상한 baseline으로 가져와서, 현재 local vulnerable GraphQL lab server와 우리 authorization regression harness를 비교한 결과다.

## 1. 왜 GraphQLer를 비교했나

GraphQLer는 schema introspection, dependency graph, object bucket, chain generation을 지원하는 context-aware GraphQL API testing tool이다. 우리 프로젝트도 schema catalog, object pool, dependency-aware sequence를 사용하므로, GraphQLer를 "강한 외부 baseline"으로 두면 비교 의미가 있다.

참고:

- GraphQLer GitHub: https://github.com/omar2535/GraphQLer
- GraphQLer paper: https://arxiv.org/abs/2504.13358

## 2. 실행 조건

대상은 우리 소유 local lab server만 사용했다.

| 항목 | 값 |
| --- | --- |
| Endpoint | `http://127.0.0.1:3000/graphql` |
| GraphQLer version | `2.3.8` |
| Output | `graphqler-results-local-mut/` |
| Config | `config/graphqler_baseline.toml` |
| LLM | disabled |
| DoS / injection / misc fuzzing | disabled |
| Max fuzzing iterations | `1` |
| Max time | `60s` |

GraphQLer는 Python 3.12이 필요해서 Codex bundled Python 3.12 환경에 `/private/tmp/graphqler-pkg`로 임시 설치했다. 프로젝트 dependency에는 추가하지 않았다.

## 3. GraphQLer 실행 중 조정한 점

처음 실행했을 때 GraphQLer가 mutation을 0개로 인식했다.

원인:

- 우리 schema의 root mutation type 이름은 `RootMutation`이다.
- GraphQLer 2.3.8의 mutation parser는 root mutation type을 introspection의 `mutationType.name`으로 읽지 않고, 이름이 정확히 `Mutation` 또는 `Mutations`일 때만 mutation object로 처리했다.

조치:

- `/private/tmp/graphqler-pkg/graphqler/compiler/parsers/mutation_list_parser.py` 임시 설치본에만 compatibility patch를 적용했다.
- 패치 후 GraphQLer는 mutation 10개를 정상 인식했다.

이 조정은 GraphQLer를 우리 서버 schema naming과 맞추기 위한 호환 패치이고, 우리 서버나 harness 로직을 바꾸지는 않았다.

## 4. GraphQLer 결과

GraphQLer compile 결과:

| Metric | Result |
| --- | ---: |
| Nodes | 28 |
| Edges | 28 |
| Generated chains | 70 |
| Queries recognized | 12 |
| Mutations recognized | 10 |
| Objects recognized | 6 |

GraphQLer fuzz 결과:

| Metric | Result |
| --- | ---: |
| Time taken | 3.87s |
| Successes | 204 |
| Failures | 29 |
| Successful operation coverage | 14 / 22 = 63.6% |
| Negative coverage | 5 / 22 = 22.7% |

GraphQLer가 성공적으로 실행한 주요 operation:

- Queries: `adminUsers`, `allComments`, `allUsers`, `health`, `me`, `publicFeed`, `search`, `post`, `securePost`, `user`
- Mutations: `createPost`, `updatePost`, `register`, `deletePost`

GraphQLer가 실패로 기록한 주요 operation:

- `createComment`
- `login`
- `passwordReset`
- `superSecretPrivateMutation`
- `getAsset`

GraphQLer 공식 detector finding:

| Detector | Result |
| --- | --- |
| Introspection Enabled | detected |
| Field Suggestions Enabled | detected |

중요한 점은 GraphQLer가 authorization regression finding을 직접 분류해서 내지는 않았다는 것이다. 즉 우리 ground truth 기준의 `BOLA_READ`, `BOLA_UPDATE_DELETE`, `STALE_OBJECT_ACCESS`, `BFLA_ADMIN_LIKE_OP`, `BOPLA_SENSITIVE_FIELD_READ` finding으로 바로 매핑되는 공식 결과는 없었다.

## 5. 우리 Harness 재실행 결과

같은 서버 상태에서 우리 course profile을 다시 실행했다.

Command:

```bash
npm run security:fuzz -- --profile course --out security-results-course-graphqler-compare --endpoint http://127.0.0.1:3000/graphql
```

Output:

- `security-results-course-graphqler-compare/`

Budget curve 요약:

| Budget | Best method | Mean TP | Mean FP | Mean FN | F1 | Mean first finding |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 20 | `random-attack-gene` | 6.67 | 0 | 19.33 | 0.41 | 2 |
| 40 | `ours` | 14 | 0 | 12 | 0.70 | 2.67 |
| 50 | `ours` | 18.33 | 0 | 7.67 | 0.83 | 2.67 |

Full 주요 비교:

| Method | Budget | Mean TP | Mean FP | Mean FN | Recall | F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `pure-random-schema` | 50 | 0 | 0 | 26 | 0.00 | n/a |
| `dependency-only` | 50 | 0 | 0 | 26 | 0.00 | n/a |
| `template-only` | 50 | 11 | 0 | 15 | 0.42 | 0.59 |
| `random-attack-gene` | 50 | 15.67 | 0 | 10.33 | 0.60 | 0.75 |
| `ga-without-fsm` | 50 | 14 | 0 | 12 | 0.54 | 0.70 |
| `ours` | 50 | 18.33 | 0 | 7.67 | 0.71 | 0.83 |

## 6. Direct Comparison

| 관점 | GraphQLer | Ours |
| --- | --- | --- |
| Schema introspection | yes | yes |
| Dependency graph / chain | yes | partial, template-driven |
| Object/resource tracking | yes | yes |
| Mutation execution | yes, after compatibility patch | yes |
| Two actor authorization sequence | not in this run | yes |
| Ground-truth TP/FP/FN | no direct mapping | yes |
| BOLA read oracle | no direct local finding | yes |
| BOLA update/delete oracle | no direct local finding | yes |
| Stale object oracle | no direct local finding | yes |
| BFLA oracle | no direct local finding | yes |
| BOPLA sensitive field oracle | no direct local finding | yes |
| Official findings produced | introspection, field suggestions | authorization regression findings |

GraphQLer did exercise security-relevant surfaces. 예를 들어 `adminUsers`, `allUsers`, `me`, `user`, `post`, `createPost`, `updatePost`, `deletePost` 등을 실행했고 response에는 `resetToken` 또는 `internalNote` 같은 sensitive field가 포함된 경우가 있었다. 하지만 GraphQLer의 detector는 이것을 우리 ground-truth style의 BOPLA/BFLA/BOLA finding으로 구조화하지 않았다.

따라서 GraphQLer 결과는 다음처럼 해석하는 것이 맞다.

- GraphQLer는 dependency-aware GraphQL operation exploration baseline으로 강하다.
- 그러나 이 프로젝트의 핵심인 multi-session authorization regression oracle은 우리 harness가 더 직접적으로 구현한다.
- GraphQLer는 "operation coverage 상한 baseline"으로 적합하고, "authorization regression TP baseline"으로는 그대로 쓰기 어렵다.

## 7. 발표용 결론

안전하게 말할 수 있는 결론:

> GraphQLer를 외부 context-aware baseline으로 실행한 결과, schema/operation exploration과 dependency chain generation은 잘 수행되었고 mutation까지 포함해 70개 chain을 생성했다. 다만 GraphQLer의 공식 detector는 introspection과 field suggestion만 보고했으며, 우리 ground truth 기준의 BOLA/BOPLA/BFLA/STALE authorization regression finding은 산출하지 않았다. 반면 우리 harness는 같은 local lab에서 two-session authorization sequence와 ground-truth oracle을 사용해 budget 50 기준 평균 TP 18.33, FP 0, F1 0.83을 기록했다.

피해야 할 결론:

> GraphQLer보다 우리가 모든 GraphQL testing에서 더 좋다.

이건 아니다. GraphQLer는 범용 GraphQL exploration/fuzzing 도구이고, 우리는 수업 프로젝트 목적에 맞춘 authorization regression harness다. 비교 claim은 "우리 task-specific oracle이 local authorization regression에는 더 적합하다"로 제한하는 것이 정확하다.

## 8. 산출물 위치

| Path | 설명 |
| --- | --- |
| `config/graphqler_baseline.toml` | GraphQLer local-safe baseline config |
| `graphqler-results-local-mut/stats.txt` | GraphQLer text summary |
| `graphqler-results-local-mut/stats.json` | GraphQLer machine-readable summary |
| `graphqler-results-local-mut/compiled/chains.yml` | GraphQLer generated chains |
| `graphqler-results-local-mut/compiled/compiled_queries.yml` | Parsed queries |
| `graphqler-results-local-mut/compiled/compiled_mutations.yml` | Parsed mutations |
| `security-results-course-graphqler-compare/budget_curve.json` | 우리 harness budget curve |
| `security-results-course-graphqler-compare/run_report.md` | 우리 harness report |
