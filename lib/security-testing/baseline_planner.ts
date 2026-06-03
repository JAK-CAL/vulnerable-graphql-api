import {AttackGene, AttackType, OperationCatalogEntry, SequenceStep} from './types';

export interface PlannedBaselineCandidate {
    gene: AttackGene;
    sequence: SequenceStep[];
}

export function makeRng(seed: number): () => number {
    let state = seed || 1;
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}

function pick<T>(items: T[], rng: () => number): T {
    return items[Math.floor(rng() * items.length)];
}

function hasArg(op: OperationCatalogEntry, name: string): boolean {
    return op.args.some((arg) => arg.name === name);
}

function variableDefinitions(op: OperationCatalogEntry): string {
    return op.args.map((arg) => '$' + arg.name + ': ' + arg.type).join(', ');
}

function argumentBindings(op: OperationCatalogEntry): string {
    return op.args.map((arg) => arg.name + ': $' + arg.name).join(', ');
}

function fieldCall(op: OperationCatalogEntry): string {
    const args = argumentBindings(op);
    return op.name + (args ? '(' + args + ')' : '');
}

function operationHeader(op: OperationCatalogEntry, name: string): string {
    const varDefs = variableDefinitions(op);
    return (op.kind === 'mutation' ? 'mutation' : 'query') + ' ' + name + (varDefs ? '(' + varDefs + ')' : '') + ' {';
}

function simpleSelection(op: OperationCatalogEntry, includeSensitive: boolean): string {
    if (op.fields.length === 0) {
        return '';
    }

    const allowed = op.fields
        .map((field) => field.name)
        .filter((name) => {
            if (includeSensitive) {
                return ['id', 'title', 'content', 'public', 'deleted', 'internalNote', 'body', 'moderationNote', 'username', 'firstName', 'lastName', 'resetToken', 'stdout', 'stderr'].indexOf(name) >= 0;
            }
            return ['id', 'title', 'content', 'public', 'deleted', 'body', 'username', 'firstName', 'lastName', 'stdout', 'stderr'].indexOf(name) >= 0;
        });

    if (allowed.length === 0) {
        return 'id';
    }
    return allowed.join(' ');
}

function variableValue(argName: string, namedType: string, rng: () => number): any {
    if (argName === 'id') {
        return String(1 + Math.floor(rng() * 10));
    }
    if (argName === 'postId') {
        return '1';
    }
    if (argName === 'title') {
        return 'schema-baseline-title';
    }
    if (argName === 'content') {
        return 'schema baseline content';
    }
    if (argName === 'body') {
        return 'schema baseline comment';
    }
    if (argName === 'command') {
        return 'echo graphql-security-regression';
    }
    if (argName === 'input' || namedType === 'JSON') {
        return {};
    }
    if (namedType === 'Boolean') {
        return rng() > 0.5;
    }
    if (namedType === 'Int' || namedType === 'Float') {
        return Math.floor(rng() * 10);
    }
    return 'schema-baseline';
}

function operationVariables(op: OperationCatalogEntry, rng: () => number): any {
    const variables: any = {};
    op.args.forEach((arg) => {
        variables[arg.name] = variableValue(arg.name, arg.namedType, rng);
    });
    return variables;
}

function operationQuery(op: OperationCatalogEntry, name: string, selection: string, makeInvalid: boolean): string {
    const actualSelection = makeInvalid && op.fields.length > 0 ? selection + ' __invalidRegressionField' : selection;
    const selectionSuffix = actualSelection ? ' { ' + actualSelection + ' }' : '';
    return [
        operationHeader(op, name),
        '  ' + fieldCall(op) + selectionSuffix,
        '}'
    ].join('\n');
}

function attackTypeForOperation(op: OperationCatalogEntry): AttackType {
    if (op.classification.indexOf('admin_like') >= 0) {
        return 'BFLA_ADMIN_LIKE_OP';
    }
    if (op.classification.indexOf('sensitive_surface') >= 0) {
        return 'BOPLA_SENSITIVE_FIELD_READ';
    }
    if (op.classification.indexOf('update') >= 0 || op.classification.indexOf('delete') >= 0) {
        return 'BOLA_UPDATE_DELETE';
    }
    if (op.classification.indexOf('read_by_id') >= 0) {
        return 'BOLA_READ';
    }
    return 'BOPLA_SENSITIVE_FIELD_READ';
}

function syntheticGene(id: string, op: OperationCatalogEntry, mode: string, fitness: number): AttackGene {
    return {
        id: id,
        type: attackTypeForOperation(op),
        owner: 'SCHEMA',
        attacker: 'SCHEMA',
        objectType: op.namedReturnType,
        targetResolver: op.name,
        fitness: fitness,
        fsmState: mode,
        capabilities: op.classification.slice(0)
    };
}

export function buildPureRandomSchemaCandidates(catalog: OperationCatalogEntry[], actorNames: string[], requestBudget: number, seed: number): PlannedBaselineCandidate[] {
    const rng = makeRng(seed);
    const candidates: PlannedBaselineCandidate[] = [];
    const operations = catalog.filter((op) => op.name !== 'login');
    if (operations.length === 0 || actorNames.length === 0) {
        return candidates;
    }

    for (let i = 0; i < requestBudget; i++) {
        const op = pick(operations, rng);
        const actor = pick(actorNames, rng);
        const invalid = rng() < 0.25;
        const selection = simpleSelection(op, rng() > 0.65);
        const name = 'PureRandomSchema' + i;
        candidates.push({
            gene: syntheticGene('pure-random-schema-' + i, op, 'PURE_RANDOM_SCHEMA', requestBudget - i),
            sequence: [{
                actor: actor,
                operationName: name,
                query: operationQuery(op, name, selection, invalid),
                variables: operationVariables(op, rng),
                purpose: 'Pure schema baseline: randomly selected operation, actor, variables, and selection set.'
            }]
        });
    }
    return candidates;
}

function createVariables(op: OperationCatalogEntry): any {
    const variables: any = {};
    op.args.forEach((arg) => {
        if (arg.name === 'title') {
            variables[arg.name] = 'dependency-baseline-title';
        }
        else if (arg.name === 'content') {
            variables[arg.name] = 'dependency baseline content';
        }
        else if (arg.name === 'body') {
            variables[arg.name] = 'dependency baseline comment';
        }
        else if (arg.name === 'public') {
            variables[arg.name] = false;
        }
        else if (arg.name === 'postId') {
            variables[arg.name] = '1';
        }
        else {
            variables[arg.name] = variableValue(arg.name, arg.namedType, () => 0.5);
        }
    });
    return variables;
}

function dependentVariables(op: OperationCatalogEntry, poolKey: string): any {
    const variables: any = {};
    op.args.forEach((arg) => {
        if (arg.name === 'id') {
            variables[arg.name] = '${pool.' + poolKey + '.id}';
        }
        else {
            variables[arg.name] = variableValue(arg.name, arg.namedType, () => 0.5);
        }
    });
    return variables;
}

export function buildDependencyOnlyCandidates(catalog: OperationCatalogEntry[], actorName: string, seed: number): PlannedBaselineCandidate[] {
    const rng = makeRng(seed);
    const creates = catalog.filter((op) => op.classification.indexOf('create') >= 0 && op.fields.length > 0);
    const consumers = catalog.filter((op) => hasArg(op, 'id') && op.fields.length > 0);
    const candidates: PlannedBaselineCandidate[] = [];

    creates.forEach((createOp) => {
        consumers
            .filter((consumer) => consumer.namedReturnType === createOp.namedReturnType)
            .forEach((consumer) => {
                const index = candidates.length;
                const poolKey = 'dependency.' + createOp.namedReturnType + '.' + index;
                const createName = 'DependencyCreate' + createOp.namedReturnType + index;
                const consumeName = 'DependencyConsume' + createOp.namedReturnType + index;
                const createSelection = simpleSelection(createOp, false);
                const consumeSelection = simpleSelection(consumer, false);
                candidates.push({
                    gene: syntheticGene('dependency-only-' + index, consumer, 'DEPENDENCY_ONLY', 100 - index + rng()),
                    sequence: [
                        {
                            actor: actorName,
                            operationName: createName,
                            query: operationQuery(createOp, createName, createSelection, false),
                            variables: createVariables(createOp),
                            purpose: 'Dependency-only baseline: produce an object from a schema dependency.',
                            captures: [{
                                poolKey: poolKey,
                                path: [createOp.name],
                                ownerActor: actorName,
                                objectType: createOp.namedReturnType,
                                lifecycleState: 'created'
                            }]
                        },
                        {
                            actor: actorName,
                            operationName: consumeName,
                            query: operationQuery(consumer, consumeName, consumeSelection, false),
                            variables: dependentVariables(consumer, poolKey),
                            purpose: 'Dependency-only baseline: consume an object id without OWASP template guidance.'
                        }
                    ]
                });
            });
    });

    return candidates;
}
