# GraphQL - Demo Vulnerable API

A simple GraphQL API demonstrating several common vulnerabilities.

Authored by Aidan Noll, Carve Systems, LLC.

## Requirements

Node, NPM, and Python

## Setup

```
# Install all dependencies.
npm install
# Build the TypeScript source.
npm run tsc
# Create the database and seed it with random users and comments.
npm run sequelize db:migrate
npm run sequelize db:seed:all
```

## Running

To run the main API:

```
./run.sh
```

## Usage

The GraphQL API is available on port 3000. Visiting the homepage will take you to a GraphIQL IDE for exploration.

The API provides a simple social media/blog system. Users are able to make and view posts from other users, and they can be marked private so that they can't be seen by other users.

## GraphQL Security Regression Testing

This repository also includes a course-project MVP for GA/FSM-guided GraphQL security testing. It follows the proposal structure:

- Schema Loader + Operation Catalog
- Static Classifier
- Multi-Session Executor
- Object Pool
- Attack Template + FSM Registry
- Sequence Planner / Lowering
- Oracle + Reporter
- Baseline Planner
- MIO-lite style GA/FSM Prioritizer
- Ground Truth Evaluator

Build the TypeScript first:

```
npm run tsc
```

Then run the vulnerable app in one terminal:

```
./run.sh
```

Run the security regression tester in another terminal:

```
npm run security:fuzz
```

Generated project artifacts are written to `security-results/`:

- `op_catalog.json`
- `object_pool.json`
- `attack_execution_log.json`
- `findings.json`
- `evaluation_result.json`
- `budget_curve.json`
- `run_report.md`
- `generation_log.json`
- `ground_truth_comparison.json`
- `feedback.md`

The MVP discovers the local schema, builds an operation catalog, creates authorized two-user sessions, maintains a local object pool, lowers predefined authorization regression templates into GraphQL sequences, and writes JSON reports. `config.yaml` controls the endpoint, request budget, seed, output directory, ground truth file, and optional actor credentials.

You can also run against a saved operation catalog:

```
npm run security:fuzz -- --catalog security-results/op_catalog.json
```

For safety, the runner refuses non-local endpoints and only executes against `localhost`, `127.0.0.1`, or `::1`. The evaluation report compares schema-only, dependency-only, template-only, random AttackGene, GA-without-FSM, and FSM-guided GA-style prioritization under the same local budget and seed settings.

The default comparison methods separate baselines by information level:

- `pure-random-schema`: schema operation list only; random actor, variables, and selection sets.
- `dependency-only`: input/output dependency and object pool only; no OWASP template or FSM guidance.
- `template-only`: fixed predefined template candidates; no GA/archive prioritization.
- `random-attack-gene`: same feasible AttackGene candidates in deterministic random order.
- `ga-without-fsm`: novelty/capability prioritization without FSM progress.
- `ours`: template + FSM progress + MIO-lite target archive ordering.

Run one method, multiple seeds, or a budget sweep. The budget sweep is the recommended course-project comparison because it keeps pressure on candidate ordering instead of allowing every AttackGene candidate to run to completion.

```
npm run security:fuzz:course
npm run security:fuzz -- --profile course --out security-results-course
npm run security:fuzz -- --profile course --endpoint http://127.0.0.1:3000/graphql --out security-results-course
npm run security:fuzz -- --method ours --seed 1 --budget 50
npm run security:fuzz -- --budgets 20,40,50,80 --seed 1
npm run security:fuzz -- --budgets 20,40,50,80 --seeds 1,2,3
```

To compare against a custom expected-vulnerability table, pass:

```
npm run security:fuzz -- --ground-truth ground_truth.json
```

When no ground truth file is provided, the reporter uses the default intentionally vulnerable lab ground truth for this repository. The checked-in `ground_truth.json` contains the expected vulnerable resolver/type/template triples used by the course-project report.
