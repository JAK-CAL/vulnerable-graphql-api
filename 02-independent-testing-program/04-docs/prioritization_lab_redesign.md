# Prioritization-Focused GraphQL Lab Redesign

작성일: 2026-06-03

## 목적

이번 변경은 취약점 category를 무작정 늘리는 것이 아니라, 같은 category 안에 vulnerable / secure / public / decoy resolver를 섞어서 candidate prioritization이 실제로 중요해지는 local lab을 만드는 데 목적이 있다.

핵심 전제는 다음과 같다.

```text
Testing execution is black-box.
Evaluation is ground-truth based in an owned local lab.
```

즉 harness는 localhost GraphQL endpoint에 black-box request를 보내고 응답을 관찰한다. 하지만 평가 단계에서는 우리가 설계한 local lab의 ground truth를 알고 있으므로 TP / FP / FN을 계산한다.

## 왜 바꿨나

기존 서버도 Post / Comment / User와 BOLA / BFLA / BOPLA / stale object scenario를 갖고 있었지만, secure counterpart와 decoy surface가 충분하지 않았다.

그 상태에서는 후보군이 작아서 큰 budget에서는 template, random, GA 계열이 후보군을 대부분 소화할 수 있다. 그러면 GA/FSM의 의미가 “더 많이 찾는다”보다 “first finding이 빠르다” 정도로 약해진다.

이번 변경은 다음 상황을 만들기 위한 것이다.

- 후보는 많다.
- 모든 후보가 취약한 것은 아니다.
- secure/public/decoy 후보도 schema heuristic상 candidate가 될 수 있다.
- budget은 작아서 모든 후보를 실행할 수 없다.
- 따라서 어떤 후보를 먼저 실행할지가 중요하다.

## 서버 변경

추가된 secure/public/decoy resolver는 다음과 같다.

| Type | Resolver | 의도 |
|---|---|---|
| Post | `securePost(id)` | owner/public check + `internalNote` sanitization |
| Post | `publicPosts` | public post만 반환하고 sensitive field 제거 |
| Post | `secureSearch(query)` | parameterized-style safe search 역할 + sanitization |
| Post | `secureUpdatePost(id, ...)` | owner만 update 가능 |
| Post | `secureDeletePost(id)` | owner만 delete 가능 |
| Comment | `secureComment(id)` | owner/public check + `moderationNote` sanitization |
| Comment | `publicComments` | public comment만 반환하고 sensitive field 제거 |
| Comment | `secureUpdateComment(id, ...)` | owner만 update 가능 |
| Comment | `secureDeleteComment(id)` | owner만 delete 가능 |
| User/Admin | `internalStats` | admin-like name이지만 low-priv user에게 null 반환 |
| Decoy | `health`, `publicFeed`, `serverTime`, `echo` | schema noise / low-value operation |

기존 vulnerable resolver는 유지했다.

| Category | Vulnerable examples |
|---|---|
| BOLA_READ | `post`, `comment` |
| BOLA_UPDATE_DELETE | `updatePost`, `deletePost`, `updateComment`, `deleteComment` |
| STALE_OBJECT_ACCESS | `post`, `comment` after soft delete |
| BFLA_ADMIN_LIKE_OP | `adminUsers`, `superSecretPrivateMutation` |
| BOPLA_SENSITIVE_FIELD_READ | `me`, `user`, `allUsers`, `post`, `search`, `comment`, mutation return values 등 |

## Harness 변경

Schema heuristic은 candidate를 제거하지 않는다. 대신 operation classification에 다음 weak hint를 추가했다.

- `secure_hint`: resolver 이름에 `secure`, `safe`, `sanitized`가 있는 경우
- `decoy_or_public_hint`: resolver 이름에 `public`, `health`, `echo`, `time`, `feed`가 있는 경우

`ours` prioritizer는 이 hint를 약한 risk signal로 사용한다.

- `secure/public/decoy`로 보이는 후보는 낮은 priority를 받는다.
- `admin/super/secret/private/internal/password/reset` 같은 후보는 높은 risk hint를 받는다.
- `update/delete/comment/post/user/search` 같은 authorization-relevant 후보는 중간 이상의 risk hint를 받는다.

이것은 정답을 주입하는 방식이 아니다. 새 GraphQL 서버에 붙을 때도 schema 이름과 return field를 보고 후보를 만들고, 모호한 부분은 runtime response와 optional config/hint로 보완한다는 프로젝트 설명과 맞다.

## Ground Truth 변경

`ground_truth.json`의 vulnerable 항목은 유지하고, secure/decoy 항목을 2개에서 17개로 늘렸다.

이제 평가에는 다음이 포함된다.

- vulnerable ground truth: 26개
- secure/decoy ground truth: 17개

FP가 0이라는 것은 secure/public/decoy resolver를 취약점으로 과대보고하지 않았다는 의미다.

## 재실행 결과

실행 결과 위치:

```text
security-results-prioritization-lab/
```

요약:

| Budget | Best Method | Mean TP | Mean FP | Mean FN | F1 | Mean First |
|---:|---|---:|---:|---:|---:|---:|
| 20 | ours | 4.67 | 0 | 21.33 | 0.31 | 2.67 |
| 40 | ours | 13 | 0 | 13 | 0.67 | 2.67 |
| 50 | ours | 16.33 | 0 | 9.67 | 0.77 | 2.67 |

주요 baseline 비교:

| Method | Budget 50 Mean TP | FP | Recall | F1 |
|---|---:|---:|---:|---:|
| template-only | 5 | 0 | 0.19 | 0.32 |
| ga-without-fsm | 6 | 0 | 0.23 | 0.37 |
| random-attack-gene | 9.33 | 0 | 0.36 | 0.53 |
| ours | 16.33 | 0 | 0.63 | 0.77 |

새 schema catalog 기준 operation 수는 33개다.

```text
read_by_id: 5
update: 4
delete: 4
admin_like: 3
sensitive_surface: 28
secure_hint: 7
decoy_or_public_hint: 6
```

## 발표용 설명

좋은 한 문장:

```text
We redesigned the local GraphQL lab so that the candidate space contains vulnerable, secure, public, and decoy resolvers under the same authorization categories. The harness executes tests as black-box GraphQL requests, but evaluates TP/FP/FN against owned-lab ground truth, making budget-limited prioritization measurable.
```

피해야 할 표현:

```text
The system automatically understands login, ownership, and private objects from any schema.
```

더 정확한 표현:

```text
The system uses schema-derived classification, minimal actor/config assumptions, runtime object-pool updates, and ground-truth evaluation in an owned local lab.
```
