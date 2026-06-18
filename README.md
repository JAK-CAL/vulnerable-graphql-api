# vulnerable-graphql-api-server

A simple GraphQL API server demonstrating several common vulnerabilities, adapted from [ivision-research/vulnerable-graphql-api](https://github.com/ivision-research/vulnerable-graphql-api).

The tester sends GraphQL requests to a local endpoint, records the results, and writes JSON/Markdown reports.

Remark: This server is intended only for local.

## Structure

```text
01-test-target-graphql-server/
  01-server/                 GraphQL lab server
  02-ground-truth/           Expected vulnerable/safe results

02-independent-testing-program/
  01-test-program/           Authorization testing harness
  02-other-server-config/    Example config for other local servers
  03-execution-results/      Generated reports
  04-docs/                   Design notes and project documentation
```

## Setup

Prerequisites:

- Node.js and npm
- Python 3

Install dependencies:

```bash
npm install
npm run tsc
```

Initialize the database if needed:

```bash
npm run sequelize db:migrate
npm run sequelize db:seed:all
```

Create the report output directory on a new checkout:

```bash
mkdir -p 02-independent-testing-program/03-execution-results
```

## Run the Server

From the repository root:

```text
vulnerable-graphql-api/
```

Run:

```bash
./run.sh
```

The GraphQL endpoint will be available at:

```text
http://127.0.0.1:3000/graphql
```

## Run the Tester

Default run:

```bash
npm run security:fuzz
```

Course profile:

```bash
npm run security:fuzz:course
```

Run with explicit options:

```bash
npm run security:fuzz -- \
  --profile course \
  --endpoint http://127.0.0.1:3000/graphql \
  --out 02-independent-testing-program/03-execution-results/security-results-course
```

Run one method:

```bash
npm run security:fuzz -- \
  --method graph-ga \
  --budget 50 \
  --seed 1 \
  --endpoint http://127.0.0.1:3000/graphql
```

Run multiple budgets and seeds:

```bash
npm run security:fuzz -- \
  --budgets 20,40,50,80,160 \
  --seeds 1,2,3 \
  --endpoint http://127.0.0.1:3000/graphql
```

Generate only the operation catalog:

```bash
npm run security:catalog -- \
  --endpoint http://127.0.0.1:3000/graphql \
  --out 02-independent-testing-program/03-execution-results/security-results-catalog
```

## Outputs

Results are written under:

```text
02-independent-testing-program/03-execution-results/
```

Common output files:

```text
op_catalog.json
object_pool.json
attack_execution_log.json
findings.json
evaluation_result.json
generation_log.json
budget_curve.json
ground_truth_comparison.json
run_report.md
feedback.md
```

## Using Another Local GraphQL Server

Example config files are available at:

```text
02-independent-testing-program/02-other-server-config/config.yaml
02-independent-testing-program/02-other-server-config/security_hints.example.json
```

Use these when connecting the tester to another owned local GraphQL server.

## Documentation

Additional notes are in:

```text
02-independent-testing-program/04-docs/
```
