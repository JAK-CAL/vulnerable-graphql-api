# Independent GraphQL Regression Testing Design

작성일: 2026-06-03

## 목표

프로젝트는 두 조건을 만족해야 한다.

1. 실질적으로 의미 있는 authorization/security regression 취약점을 테스트한다.
2. 테스팅 프로그램은 특정 GraphQL 서버 코드에 묶이지 않고, 다른 owned local GraphQL 서버에도 붙일 수 있어야 한다.

이번 구조는 다음 원칙을 따른다.

```text
Schema-derived classification + minimal test account/config + runtime object pool + ground-truth evaluation
```

즉 GraphQL schema만으로 login, owner, private object를 완벽히 알아낸다고 주장하지 않는다.

## 실행 모델

테스트 실행은 black-box다.

- endpoint에 GraphQL request를 보낸다.
- actor별 cookie/session을 분리해 유지한다.
- create response에서 object id를 capture한다.
- 이후 read/update/delete sequence에서 object pool id를 재사용한다.
- 응답을 보고 authorization expectation 실패 여부를 판단한다.

평가는 owned lab ground truth 기반이다.

- local lab 설계자가 vulnerable / secure resolver를 알고 있다.
- 실행 결과 finding을 ground truth와 비교해서 TP / FP / FN을 계산한다.
- secure/public/decoy resolver를 finding으로 잘못 찍으면 FP가 된다.

## 독립성 개선

기존에는 operation catalog를 만들 때 local `lib/gql/schema`를 import했다. 이제 기본값은 endpoint introspection이다.

```bash
npm run security:fuzz -- --endpoint http://127.0.0.1:3000/graphql --out security-results
```

명시적으로 선택할 수 있는 schema source:

```bash
--schema-source endpoint
--schema-source local
--schema-source static
```

다른 서버에 붙일 때 권장 방식:

```bash
npm run security:fuzz -- \
  --endpoint http://127.0.0.1:4000/graphql \
  --hints config/security_hints.example.json \
  --ground-truth ground_truth.json \
  --out security-results-other-server
```

외부/공개 target은 scope 밖이다. endpoint 제한은 여전히 localhost only다.

## Hints가 필요한 이유

GraphQL schema만 보고는 보통 다음을 정확히 알 수 없다.

- 어떤 mutation이 login인지
- 로그인 변수명이 `username/password`인지 `email/passcode`인지
- 현재 사용자 query가 `me`인지 `viewer`인지
- 어떤 object가 private인지
- 어떤 resolver가 secure decoy인지

그래서 hints는 최소한의 서버별 의미를 보완한다.

예시:

```json
{
  "auth": {
    "loginOperationName": "Login",
    "loginQuery": "mutation Login($email: String, $password: String) { login(email: $email, password: $password) { id email } }",
    "meOperationName": "Viewer",
    "meQuery": "query Viewer { viewer { id email } }",
    "meResultPath": ["viewer"]
  },
  "actorLoginVariables": {
    "A": {"email": "a@example.local", "password": "pwA"},
    "B": {"email": "b@example.local", "password": "pwB"}
  },
  "operationTags": {
    "adminUsers": ["admin_like"],
    "safePost": ["secure_hint"],
    "publicFeed": ["decoy_or_public_hint"]
  }
}
```

## 실질적인 취약점 범위

현재 lab은 다음 보안 regression surface를 가진다.

- BOLA read: 다른 사용자의 private object id read
- BOLA update/delete: 다른 사용자의 object id mutation
- Stale object access: soft-delete 이후 id 기반 read
- BFLA: low-privileged actor의 admin-like resolver 실행
- BOPLA: selection set을 통해 sensitive field 노출

secure/public/decoy resolver도 같은 category 안에 섞여 있다.

- `securePost`
- `secureComment`
- `secureUpdatePost`
- `secureDeletePost`
- `secureUpdateComment`
- `secureDeleteComment`
- `publicPosts`
- `publicComments`
- `secureSearch`
- `internalStats`

따라서 모든 후보가 취약하지 않고, 작은 budget에서는 candidate prioritization이 실제로 중요해진다.

## 정확한 Claim

좋은 표현:

```text
The harness is server-independent at the testing layer: it builds an operation catalog from endpoint introspection or a supplied catalog, uses configurable auth hints for test accounts, maintains a runtime object pool, and evaluates black-box execution results against owned-lab ground truth.
```

피해야 할 표현:

```text
The tool fully understands arbitrary GraphQL authorization semantics from schema alone.
```
