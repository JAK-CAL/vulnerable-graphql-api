# GraphQL Security Fuzzing Evaluation Report

## 1. Reference Basis

확장 방향은 OWASP API Security Top 10의 authorization 계열을 기준으로 잡았다.

- OWASP API1: Broken Object Level Authorization, 즉 object id 기반 접근제어 실패
- OWASP API3: Broken Object Property Level Authorization, 즉 민감 object field 노출
- OWASP API5: Broken Function Level Authorization, 즉 권한이 낮은 actor의 privileged function 실행
- OWASP GraphQL Cheat Sheet의 핵심 권고도 field/resolver 단위 access control, input validation, query limits를 강조한다.

참고:

- https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/
- https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/
- https://owasp.org/API-Security/editions/2023/en/0xa5-broken-function-level-authorization/
- https://cheatsheetseries.owasp.org/cheatsheets/GraphQL_Cheat_Sheet.html

## 2. Server Expansion

기존 서버는 `Post` read와 `superSecretPrivateMutation` 정도만 강하게 잡혔다. 이번 수정에서는 프로젝트가 타깃팅하는 structural authorization/resource 취약점이 더 많이 생기도록 서버를 확장했다.

추가/변경한 surface:

| Area | Resolver / Field | Intended Weakness |
| --- | --- | --- |
| BOLA_READ | `post(id)`, `comment(id)` | owner check 없이 private object read |
| BOLA_UPDATE_DELETE | `updatePost`, `deletePost`, `updateComment`, `deleteComment` | owner check 없이 foreign object 변경/삭제 |
| STALE_OBJECT_ACCESS | `deletePost` + `post(id)`, `deleteComment` + `comment(id)` | soft-deleted object가 계속 read 가능 |
| BFLA | `adminUsers`, `superSecretPrivateMutation` | low-privilege actor가 admin-like resolver 실행 |
| BOPLA | `resetToken`, `internalNote`, `moderationNote` | 민감 field가 selection set으로 노출 |
| Noisy schema | `health`, `publicFeed`, `allComments` 등 | search space를 약간 넓힘 |

DB/model 변경:

- `Post.deleted`
- `Post.internalNote`
- 신규 `Comment` model/table
- `Comment.deleted`
- `Comment.moderationNote`

## 3. Fuzzer Expansion

기존 fuzzer는 주로 `BOLA_READ`와 `BFLA`만 oracle로 판정했다. 이번 수정으로 다음 template/lowering/oracle을 추가했다.

| Attack Template | Lowering |
| --- | --- |
| BOLA_READ | `Auth(A) -> createObject(A) -> Auth(B) -> read(B, A.object_id)` |
| BOLA_UPDATE_DELETE | `Auth(A) -> createObject(A) -> Auth(B) -> update/delete(B, A.object_id) -> verify` |
| STALE_OBJECT_ACCESS | `Auth(A) -> createObject(A) -> delete(A) -> read(A, deleted_id)` |
| BFLA_ADMIN_LIKE_OP | `Auth(B) -> execute admin-like op` |
| BOPLA_SENSITIVE_FIELD_READ | `Auth(B) -> request sensitive field in selection set` |

Evaluation metric도 baseline 정리 기준에 맞춰 확장했다.

- requests-to-first-finding
- unique findings
- unique vulnerable resolvers
- unique vulnerable object types
- unique target resolvers tested
- unique object types tested
- unique OWASP templates exercised
- unique actor-role pairs tested
- unique executable paths
- valid sequence ratio
- attack-ready rate
- false positive count

## 4. Actual Result

Command:

```bash
npm run security:fuzz -- --budget 160 --out security-results
```

실제 `vulnerable-graphql-api` 서버에서 `Ours findings: 25`가 나왔다.

대표 findings:

| OWASP Type | Target Resolver | Object Type |
| --- | --- | --- |
| BOLA_READ | `post` | `Post` |
| BOLA_READ | `comment` | `Comment` |
| BOLA_UPDATE_DELETE | `updatePost` | `Post` |
| BOLA_UPDATE_DELETE | `deletePost` | `Post` |
| BOLA_UPDATE_DELETE | `updateComment` | `Comment` |
| BOLA_UPDATE_DELETE | `deleteComment` | `Comment` |
| STALE_OBJECT_ACCESS | `post` | `Post` |
| STALE_OBJECT_ACCESS | `comment` | `Comment` |
| BFLA_ADMIN_LIKE_OP | `adminUsers` | `User` |
| BFLA_ADMIN_LIKE_OP | `superSecretPrivateMutation` | `CommandOutput` |
| BOPLA_SENSITIVE_FIELD_READ | `me`, `user`, `allUsers`, `adminUsers` | `User` |
| BOPLA_SENSITIVE_FIELD_READ | `post`, `createPost`, `updatePost`, `deletePost` | `Post` |
| BOPLA_SENSITIVE_FIELD_READ | `comment`, `allComments`, `createComment`, `updateComment`, `deleteComment` | `Comment` |

## 5. Baseline Result

Request budget: 160

| Method | Requests Used | Requests to First Finding | Unique Findings | Vulnerable Resolvers | Object Types Tested | OWASP Templates Covered | Attack-ready Rate | FP Count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Random | 77 | 5 | 25 | 16 | 4 | 5 | 0 | 0 |
| Dependency-only | 77 | 5 | 25 | 16 | 4 | 5 | 0 | 0 |
| Template-only | 77 | 6 | 25 | 16 | 4 | 5 | 0 | 0 |
| GA without FSM | 77 | 5 | 25 | 16 | 4 | 5 | 0 | 0 |
| Ours | 77 | 6 | 25 | 16 | 4 | 5 | 0.148 | 0 |

## 6. Cold Interpretation

좋아진 점:

- 이제 서버는 우리가 타깃팅하는 취약점 종류를 모두 포함한다.
- `Post` 하나만 보는 toy demo가 아니라 `Post`, `Comment`, `User`, `CommandOutput`까지 object type이 늘었다.
- BOLA read뿐 아니라 update/delete, stale object, BOPLA, BFLA가 실제 finding으로 나온다.
- `findings.json`에는 replay 가능한 GraphQL sequence와 evidence가 남는다.

냉정한 한계:

- 현재 baseline들이 같은 feasible AttackGene population을 공유한다. 그래서 모두 25개 finding을 찾는다.
- 즉 지금 결과는 "취약점 종류와 산출물 completeness"를 보여주기에는 좋지만, "Ours가 baseline보다 우월하다"는 증거로는 아직 약하다.
- Random/Dependency-only가 너무 똑똑한 후보군을 공유한다. 진짜 random baseline은 invalid request와 decoy operation을 더 많이 밟아야 한다.
- Template-only도 모든 template 후보를 다 훑기 때문에, 현재 schema 크기에서는 Ours와 차이가 작다.
- GA는 아직 full generation loop가 아니라 prioritizer에 가깝다. `graphql_ga_strategy_basic.pdf`가 말한 mutation/tournament/elitism/archive logging까지 가야 GA contribution이 더 분명해진다.

안전한 claim:

> 현재 구현은 OWASP structural authorization/resource 취약점을 여러 resolver와 object type에서 재현하고, 이를 자동으로 sequence lowering, execution, oracle, report까지 연결하는 end-to-end GraphQL security testing MVP다.

아직 피해야 할 claim:

> FSM-guided GA가 random보다 항상 빠르다.

이 claim은 현재 실험 결과로는 지지되지 않는다.

## 7. Next Step

기법 차별성을 더 강하게 보이려면 다음이 필요하다.

1. 더 현실적인 Random baseline
   - raw operation, actor, payload, selection set을 더 무작위로 생성
   - invalid request ratio가 드러나야 함

2. Dependency-only baseline 약화
   - OWASP template을 모르게 하고 dependency path만 따라가게 분리
   - 지금처럼 attack-ready 후보를 공유하면 차이가 잘 안 보임

3. Noisy schema 확대
   - decoy object type, decoy resolver, safe resolver 추가
   - 예: `safeComment`, `publicPost`, `auditLog`, `tag`, `category`, `profile`, `settings`

4. GA loop 구현
   - generation log
   - mutation
   - tournament selection
   - elitism
   - archive novelty

5. Ground truth table 작성
   - vulnerable resolver 목록
   - secure resolver 목록
   - expected finding identity
   - false positive / false negative 계산

## 8. Final Feedback

이번 확장으로 "우리 프로젝트가 찾고자 하는 취약점 종류가 실제 서버에 충분히 있는가?"라는 질문에는 답할 수 있게 됐다.

답은 yes다.

현재 서버는 BOLA_READ, BOLA_UPDATE_DELETE, STALE_OBJECT_ACCESS, BFLA_ADMIN_LIKE_OP, BOPLA_SENSITIVE_FIELD_READ를 모두 포함하고, fuzzer도 이를 실제 finding으로 뽑는다.

다만 평가 contribution은 아직 baseline 설계가 너무 관대하다. 발표에서는 현재 결과를 "coverage-rich vulnerable lab + end-to-end detector"로 보여주고, GA 우수성은 noisy schema와 더 엄격한 baseline에서 평가할 계획이라고 말하는 것이 가장 정직하고 안전하다.
