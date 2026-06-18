# 02 Test Target GraphQL Server

This is a second local vulnerable GraphQL target server for the security evaluation harness. It is inspired by Damn Vulnerable GraphQL Application (DVGA), but it is intentionally reshaped into a generic GraphQL authorization/object-property lab rather than a server custom-made for one assignment scenario.

## Why This Server Exists

The existing `01-test-target-graphql-server` already evaluates the current Graph-GA harness against five vulnerability classes:

- `BOLA_READ`: cross-user object read by id
- `BOLA_UPDATE_DELETE`: cross-user object mutation by id
- `STALE_OBJECT_ACCESS`: deleted object remains readable
- `BFLA_ADMIN_LIKE_OP`: low-privilege user can call admin-like resolver
- `BOPLA_SENSITIVE_FIELD_READ`: sensitive field is exposed through selection sets

DVGA has a broader vulnerability surface: introspection exposure, GraphiQL exposure, batch/alias/recursion DoS, field suggestion leakage, stack traces, SSRF, command injection, SQL injection, JWT verification bypass, weak filtering, path traversal/file write, and injection-style payload storage.

The current evaluation harness does not score every DVGA category directly. For this server, the DVGA ideas were mapped into the harness-supported classes while preserving realistic GraphQL patterns:

| DVGA-style surface | Implemented here as | Harness category |
| --- | --- | --- |
| Paste ownership mistakes | `paste`, `updatePaste`, `deletePaste` | BOLA, stale object |
| Audit/event ownership mistakes | `auditLog`, `updateAuditLog`, `deleteAuditLog` | BOLA, stale object |
| Admin diagnostics exposure | `adminUsers`, `adminCommand` | BFLA |
| Sensitive object fields | `resetToken`, `internalNote`, `moderationNote` | BOPLA |
| SQL injection-like search | `searchPastes(query)` treats `' or 1=1` style input as broad search | Extra generic DVGA coverage |
| SSRF/command-shaped import | `importRemotePaste(host,path,scheme)` records unsafe remote source | Extra generic DVGA coverage |
| Path traversal-shaped upload | `uploadPaste(filename,content)` stores unsafe filename metadata | Extra generic DVGA coverage |

The server avoids real command execution, outbound network calls, and filesystem writes. Those risky DVGA behaviors are represented as safe local simulations so the lab remains deterministic and safe to run.

## Intentional Vulnerabilities

### Paste Object

- `paste(id)` returns private or deleted pastes without checking owner or lifecycle.
- `updatePaste(id, ...)` and `deletePaste(id)` allow any logged-in user to mutate another user's paste.
- `createPaste`, `paste`, `updatePaste`, `deletePaste`, `importRemotePaste`, and `uploadPaste` expose `internalNote`.

Secure counterexamples:

- `securePaste(id)`, `pastePreview(id)`, `publicPastes`, `ownerPasteHistory(id)`, `secureSearchPastes(query)`, `secureUpdatePaste`, `secureDeletePaste`
- These enforce owner/public visibility and redact `internalNote`.

### AuditLog Object

- `auditLog(id)` returns private or deleted audit logs without checking owner or lifecycle.
- `updateAuditLog(id, ...)` and `deleteAuditLog(id)` allow cross-user mutation.
- `allAuditLogs`, `auditLog`, `createAuditLog`, `updateAuditLog`, and `deleteAuditLog` expose `moderationNote`.

Secure counterexamples:

- `secureAuditLog(id)`, `auditPreview(id)`, `publicAuditLogs`, `ownerAuditHistory(id)`, `secureUpdateAuditLog`, `secureDeleteAuditLog`
- These enforce owner/public visibility and redact `moderationNote`.

### User/Admin Surface

- `adminUsers` is admin-shaped but callable by low-privilege users.
- `adminCommand(command)` is admin-shaped but only requires login.
- `me`, `user(id)`, `allUsers`, `adminUsers`, `register`, and `passwordReset` expose user-level sensitive fields such as `resetToken`, `apiKey`, and `debugToken`.

Secure counterexamples:

- `privateSystemReport`, `internalStats`, and `secureAdminCommand` require admin privileges.

## Cross-Validation Result

The server was designed by cross-checking three sources:

- Current server/harness contract: operation classification is based on resolver names, id arguments, object return type, and sensitive field names.
- DVGA source behavior: paste ownership, unsafe import/debug/admin/search/upload patterns are the closest reusable GraphQL vulnerability surfaces.
- New project docs: evaluation must remain black-box HTTP, local-only, reproducible, and ground-truth compared only after execution.

That means this server adds a second evaluation target without changing the test harness. It broadens the target domain from `Post`/`Comment` into `Paste`/`AuditLog`/admin diagnostics while preserving the same security categories.

Revised and verified locally on 2026-06-18 after overfitting review:

- `npm run tsc`: pass
- Manual BOLA/BFLA/BOPLA checks: pass
- Ground truth: 43 vulnerable entries, 32 secure/decoy entries
- Operation catalog: 47 operations, 30 `sensitive_surface` operations
- Graph-GA at budget 200: TP 35, FP 0, FN 8, F1 0.90
- Template-only at budget 200: TP 38, FP 0, FN 5, F1 0.94
- Random-sequence-gene at budget 200: TP 39, FP 0, FN 4, F1 0.95

The broader version intentionally does not make Graph-GA win every comparison. It is a cross-target robustness benchmark: neutral resolver names (`entry`, `record`, `reviseEntry`, `retireRecord`, `maintenanceTask`), broader sensitive fields (`apiKey`, `ownerSecret`, `reviewToken`, `debugToken`), and redacted safe return types reduce hard-coded benchmark fit.

## Run

From the repository root:

```bash
npm run tsc
PORT=3100 node build/02-test-target-graphql-server/01-server/app.js
```

Reset server state:

```bash
curl -X POST http://127.0.0.1:3100/reset -H 'Content-Type: application/json' -d '{"clearSessions":true}'
```

Run the security harness:

```bash
npm run security:fuzz -- --config 02-test-target-graphql-server/02-other-server-config/config.yaml
```

Useful multi-budget evaluation:

```bash
npm run security:fuzz -- --profile course --budgets 20,40,80,120,200 --seeds 1,2,3 --endpoint http://127.0.0.1:3100/graphql --ground-truth 02-test-target-graphql-server/02-ground-truth/ground_truth.json --hints 02-test-target-graphql-server/02-other-server-config/security_hints.json --out /tmp/security-results-02-test-target
```
