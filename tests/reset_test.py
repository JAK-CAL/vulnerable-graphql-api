import json
import os
import urllib.error
import urllib.request
import http.cookiejar
from typing import Dict, List

BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:3000")


class ResetTestError(Exception):
    pass


class ApiClient:
    def __init__(self) -> None:
        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookie_jar)
        )

    def post_json(self, path: str, payload: Dict[str, object]) -> Dict[str, object]:
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            f"{BASE_URL}{path}",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with self.opener.open(request, timeout=10) as response:
                body = response.read().decode("utf-8")
                return json.loads(body)
        except urllib.error.HTTPError as error:
            raise ResetTestError(
                f"http error for {path}: {error.read().decode('utf-8')}"
            ) from error

    def graphql(self, query: str) -> Dict[str, object]:
        return self.post_json("/graphql", {"query": query})


def get_initial_state(client: ApiClient) -> Dict[str, List[Dict[str, object]]]:
    reset_response = client.post_json("/reset", {"clearSessions": True})
    if reset_response.get("ok") is not True:
        raise ResetTestError(f"failed to reset initial state: {reset_response}")

    users_response = client.graphql("query { allUsers { id username firstName lastName } }")
    posts_response = client.graphql("query { search(query: \"private\") { id title public content } }")

    users_data = users_response["data"]["allUsers"]
    posts_data = posts_response["data"]["search"]

    return {"users": users_data, "posts": posts_data}


def mutate_database(client: ApiClient) -> Dict[str, object]:
    create_response = client.graphql(
        "mutation { createPost(title: \"Test post\", content: \"This should be reset\", public: true) { id title content public } }"
    )

    if create_response.get("errors"):
        raise ResetTestError(f"graphql error on create: {create_response}")

    mutation_result = create_response["data"]["createPost"]

    verify_response = client.graphql(
        "query { post(id: \""
        + str(mutation_result["id"])
        + "\") { id title content public } }"
    )

    if verify_response.get("errors"):
        raise ResetTestError(f"graphql error on verify: {verify_response}")

    if verify_response["data"]["post"] is None:
        raise ResetTestError("mutation was not visible via query")

    return mutation_result


def reset_and_compare(client: ApiClient, initial_state: Dict[str, List[Dict[str, object]]]) -> None:
    reset_response = client.post_json("/reset", {"clearSessions": True})
    if reset_response.get("ok") is not True:
        raise ResetTestError(f"failed to reset after mutation: {reset_response}")

    users_response = client.graphql("query { allUsers { id username firstName lastName } }")
    posts_response = client.graphql("query { search(query: \"private\") { id title public content } }")

    users_data = users_response["data"]["allUsers"]
    posts_data = posts_response["data"]["search"]

    if users_data != initial_state["users"]:
        raise ResetTestError("user state did not match initial state after reset")

    if posts_data != initial_state["posts"]:
        raise ResetTestError("post state did not match initial state after reset")


def main() -> None:
    client = ApiClient()
    initial_state = get_initial_state(client)
    mutate_database(client)
    reset_and_compare(client, initial_state)
    print("reset test passed")


if __name__ == "__main__":
    main()
