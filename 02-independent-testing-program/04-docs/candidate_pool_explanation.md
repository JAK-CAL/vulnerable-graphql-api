
## 1. Candidate Pool이 뭐냐?

Candidate pool은 쉽게 말하면 **테스트할 만한 보안 후보 목록**이다.

GraphQL 서버에는 query와 mutation이 많다.

예를 들어:

```graphql
post(id)
comment(id)
updatePost(id)
deletePost(id)
adminUsers
securePost(id)
publicPosts
```

단순 random fuzzer는 이 중 아무거나 고른다.

하지만 우리 testing는 이렇게 생각한다.

```text
이 operation은 어떤 보안 질문과 연결될 수 있을까?
이 resolver는 다른 사람 object를 읽는 테스트에 쓸 수 있을까?
이 mutation은 다른 사람 object를 수정하는 테스트에 쓸 수 있을까?
이 field는 민감 정보 노출 테스트에 쓸 수 있을까?
이 resolver는 admin-like 기능처럼 보이는가?
```

즉 candidate pool은 단순한 operation 목록이 아니라, **보안 테스트 관점으로 재해석한 후보 목록**이다.

## 2. 왜 Pool이 필요한가?

GraphQL schema에는 보안과 별로 관련 없는 operation도 많다.

예를 들어:

```text
health
serverTime
echo
publicFeed
tags
categories
```

이런 것들도 random fuzzer 입장에서는 똑같은 operation이다. 그래서 request budget이 작으면 random은 중요한 보안 후보를 보기 전에 budget을 낭비할 수 있다.

우리 pool의 목적은 random을 완전히 없애는 것이 아니다.

목적은 이것이다.

```text
random이 낭비하는 공간을 줄이고,
authorization 취약점과 관련 있을 법한 후보에 request budget을 집중시키기
```

## 3. Pool은 어떻게 만들어지는가?

전체 흐름은 간단히 보면 이렇다.

```text
GraphQL schema 읽기
-> operation 목록 만들기
-> operation에 의미 태그 붙이기
-> 보안 template과 연결하기
-> 실행 가능한 test candidate 만들기
-> GA/FSM이 실행 순서를 정하기
```

조금 더 풀면:

1. GraphQL 서버에서 operation 목록을 가져온다.
2. 각 operation이 create인지, read인지, update인지, delete인지, admin-like인지, sensitive field를 반환하는지 본다.
3. 이 정보를 바탕으로 보안 테스트 template에 연결한다.
4. 그렇게 만들어진 후보들이 candidate pool이 된다.

## 4. 예시로 보기

서버에 이런 operation이 있다고 하자.

```graphql
createPost(...)
post(id)
securePost(id)
updatePost(id)
deletePost(id)
adminUsers
publicPosts
```

다음처럼 보안 질문으로 바꾼다.

| Operation | 보안 관점 질문 |
| --- | --- |
| `post(id)` | 다른 사용자의 private post를 읽을 수 있는가? |
| `securePost(id)` | 안전한 resolver가 정말 막는가? |
| `updatePost(id)` | 다른 사용자의 post를 수정할 수 있는가? |
| `deletePost(id)` | 다른 사용자의 post를 삭제할 수 있는가? |
| `deletePost -> post(id)` | 삭제된 post가 계속 읽히는가? |
| `adminUsers` | 일반 사용자가 admin-like resolver를 실행할 수 있는가? |
| `publicPosts` | public resolver가 민감 필드를 노출하지 않는가? |

이렇게 바꾸면 operation 목록이 보안 테스트 후보 목록이 된다.

## 5. Pool 안에는 취약한 후보만 들어가나?

아니다.

중요한 점은 candidate pool 안에 **취약한 후보와 안전한 후보가 같이 들어간다**는 것이다.

예를 들어:

```text
post(id)        -> 취약할 수 있음
securePost(id)  -> 안전해야 함
publicPosts     -> public/decoy
```

이 셋이 모두 pool에 들어갈 수 있다.

왜냐하면 테스트 프로그램은 처음부터 “이건 무조건 취약하다”라고 찍으면 안 되기 때문이다.

올바른 흐름은 이렇다.

```text
후보로 넣는다
-> 실제 request를 보낸다
-> response를 본다
-> oracle이 finding인지 판단한다
-> ground truth와 비교해서 TP/FP/FN을 계산한다
```

그래서 secure resolver를 취약점으로 잘못 보고하면 FP가 된다.

이 구조 덕분에 우리 프로젝트는 단순히 finding 개수만 보는 것이 아니라, **oracle이 안전한 resolver를 잘 구분하는지도 평가**할 수 있다.

## 6. Object ID는 어떻게 쓰이나?

BOLA 같은 테스트는 object id가 필요하다.

예를 들어:

```text
user A가 post를 만든다
그 post id를 저장한다
user B가 그 id로 post(id)를 호출한다
```

여기서 중요한 것은 id를 하드코딩하지 않는다는 점이다.

우리 harness는 실행 중에 object를 만들고, response에서 id를 뽑아서 저장한다.

이 저장소가 runtime object pool이다.

쉽게 말하면:

```text
candidate pool = 어떤 테스트를 할지 정하는 후보 목록
object pool    = 실행 중에 얻은 실제 object id 저장소
```

둘은 다르지만 함께 동작한다.

## 7. Actor도 Pool의 일부인가?

넓게 보면 그렇다.

authorization 테스트에서는 누가 요청하는지가 중요하다.

우리 harness는 보통 다음 actor를 사용한다.

| Actor | 역할 |
| --- | --- |
| `A` | object owner |
| `B` | attacker / non-owner |
| `ANON` | anonymous baseline |

예를 들어 BOLA_READ는 이렇게 진행된다.

```text
A가 private object 생성
B가 A의 object id로 조회 시도
ANON도 같은 id로 조회 시도
```

이렇게 해야 단순히 public object라서 읽힌 것인지, 권한 체크가 깨진 것인지 구분할 수 있다.

## 8. Template은 어떤 역할인가?

Template은 보안 질문의 형태다.

우리 프로젝트의 주요 template은 다음과 같다.

| Template | 질문 |
| --- | --- |
| `BOLA_READ` | 다른 사용자의 object를 읽을 수 있는가? |
| `BOLA_UPDATE_DELETE` | 다른 사용자의 object를 수정/삭제할 수 있는가? |
| `STALE_OBJECT_ACCESS` | 삭제된 object가 계속 접근되는가? |
| `BFLA_ADMIN_LIKE_OP` | 일반 사용자가 admin-like 기능을 실행할 수 있는가? |
| `BOPLA_SENSITIVE_FIELD_READ` | 민감 field가 GraphQL selection set으로 노출되는가? |

operation은 이 template과 연결되면서 보안 테스트 후보가 된다.

예를 들어:

```text
post(id)      + BOLA_READ template
updatePost(id)+ BOLA_UPDATE_DELETE template
adminUsers    + BFLA_ADMIN_LIKE_OP template
resetToken    + BOPLA_SENSITIVE_FIELD_READ template
```

## 9. Pool과 GA/FSM의 관계

Candidate pool은 “무엇을 테스트할 수 있는가”를 만든다.

GA/FSM은 “그중 무엇을 먼저 테스트할 것인가”를 정한다.

즉:

```text
candidate pool = 후보 생성
GA/FSM          = 후보 우선순위 결정
oracle          = 실행 후 finding 여부 판단
reporter        = 결과 평가
```

pool이 없으면 GA/FSM은 정렬할 후보가 없다.

반대로 pool만 있고 GA/FSM이 없으면 후보를 그냥 순서대로 또는 random으로 실행하게 된다.

우리 프로젝트의 핵심은 다음 조합이다.

```text
보안 의미가 있는 후보 pool을 만들고,
제한된 budget 안에서 GA/FSM으로 더 좋은 순서를 고른다.
```

## 10. Random과 가장 큰 차이

Random fuzzer:

```text
operation을 무작위로 고른다
argument를 대충 만든다
결과를 본다
```

우리 harness:

```text
operation을 보안 질문과 연결한다
owner/attacker 관계를 만든다
object id를 runtime에 capture한다
sensitive field를 selection set에 넣는다
secure/decoy도 후보에 넣어 FP를 확인한다
GA/FSM으로 실행 순서를 정한다
```

그래서 같은 request budget이라도 random보다 보안적으로 의미 있는 요청을 더 많이 실행할 수 있다.

## 11. 중요한 오해 방지

### 오해 1: Pool 안의 후보는 전부 취약점이다

아니다.

pool은 “테스트해볼 가치가 있는 후보”다. 취약점인지 아닌지는 실행 후 판단한다.

### 오해 2: Schema만 보면 모든 권한 의미를 알 수 있다

아니다.

schema만으로는 owner, private object, admin role의 정확한 의미를 완전히 알 수 없다. 그래서 config/hints와 runtime response, ground truth 평가가 필요하다.

### 오해 3: Random을 아예 안 쓴다

아니다.

우리는 random을 없애는 게 아니라, random이 낭비하기 쉬운 search space를 줄인다. baseline으로 random도 비교한다.

## 12. 발표용 쉬운 설명

짧게 설명하면:

```text
우리 harness는 GraphQL operation을 그냥 무작위로 호출하지 않는다.
먼저 operation들을 authorization 취약점 template과 연결해서
보안적으로 의미 있는 candidate pool을 만든다.
그 다음 GA/FSM이 제한된 request budget 안에서
어떤 후보를 먼저 실행할지 정한다.
```

더 짧게:

```text
Candidate pool은 GraphQL schema를 보안 테스트 후보 목록으로 바꾸는 단계다.
```

## 13. 최종 정리

Candidate pool의 역할은 다음 한 문장으로 정리할 수 있다.

```text
GraphQL operation 목록을 authorization vulnerability testing에 맞는 후보 공간으로 바꾸고,
GA/FSM이 request budget을 의미 있는 곳에 쓰도록 도와주는 구조
```

따라서 pool은 취약점 목록이 아니라, **취약점일 수도 있고 아닐 수도 있는 보안 테스트 후보군**이다.
