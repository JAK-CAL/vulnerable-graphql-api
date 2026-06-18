import {buildDependencyGraph, compatibleTargets, operationsWithTag} from './dependency_graph';
import {makeRng} from './baseline_planner';
import {lowerGeneToSequence} from './sequence_planner';
import {evaluateGene} from './oracle';
import {MultiSessionExecutor} from './executor';
import {ObjectPool} from './object_pool';
import {
    AttackExecutionLog,
    AttackGene,
    Finding,
    OperationCatalogEntry,
    RuntimeFeedback,
    SecurityTestConfig,
    SequenceChromosome,
    SequenceStep
} from './types';

export interface GraphGaResult {
    logs: AttackExecutionLog[];
    findings: Finding[];
    pool: ObjectPool;
    requestCount: number;
    attackReady: number;
    executable: number;
    firstFindingAt: number | null;
}

interface ObjectiveArchiveEntry {
    key: string;
    template: string;
    targetResolver?: string;
    objectType?: string;
    executions: number;
    findings: number;
    covered: boolean;
    bestFitness: number;
    bestSequenceLength: number;
    lastGeneration: number;
}

function cloneGene(gene: AttackGene): AttackGene {
    return Object.assign({}, gene);
}

function hasResultErrors(result: any): boolean {
    return !result || result.status === 0 || result.status >= 400 || (result.errors && result.errors.length > 0);
}

function hasData(result: any): boolean {
    return !!result && !!result.data && Object.keys(result.data).some((key) => result.data[key] !== null && result.data[key] !== undefined);
}

function sequenceUsesForeignReference(sequence: SequenceStep[], attacker: string): boolean {
    return sequence.some((step) => {
        return step.actor === attacker && JSON.stringify(step.variables).indexOf('${pool.') >= 0;
    });
}

function unique(items: string[]): string[] {
    return items.filter((item, index) => items.indexOf(item) === index);
}

function sensitiveFieldNames(config: SecurityTestConfig): string[] {
    return unique(['resetToken', 'internalNote', 'moderationNote'].concat(config.hints.sensitiveFields || []));
}

function scalarSelection(fields: string[], config?: SecurityTestConfig): string {
    const sensitive = config ? sensitiveFieldNames(config) : ['resetToken', 'internalNote', 'moderationNote'];
    const allowedNames = unique(['id', 'title', 'content', 'public', 'deleted', 'body', 'username', 'firstName', 'lastName', 'stdout', 'stderr', 'summary'].concat(sensitive));
    const allowed = fields.filter((field) => allowedNames.indexOf(field) >= 0);
    return allowed.length > 0 ? allowed.join(' ') : 'id';
}

function findOperation(catalog: OperationCatalogEntry[], name?: string): OperationCatalogEntry | undefined {
    if (!name) {
        return undefined;
    }
    return catalog.filter((entry) => entry.name === name)[0];
}

function chromosomeTargetKey(chromosome: SequenceChromosome): string {
    const gene = chromosome.sourceGene;
    return [
        gene.type,
        gene.objectType || 'unknown-type',
        gene.setupResolver || 'no-setup',
        gene.targetResolver || 'no-target',
        gene.deleteResolver || 'no-delete',
        gene.verifyResolver || 'no-verify',
        gene.sensitiveField || 'no-sensitive-field'
    ].join(':');
}

function chromosomePathKey(chromosome: SequenceChromosome): string {
    return chromosome.sequence.map((step) => step.actor + '.' + step.operationName).join('>');
}

function selectionTokens(gene: AttackGene): string[] {
    return (gene.selectionSet || '')
        .replace(/[{}()]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 0 && token.indexOf('$') !== 0);
}

function chromosomeFromGene(gene: AttackGene, catalog: OperationCatalogEntry[], config: SecurityTestConfig, id: string, generation: number, mutationHistory: string[]): SequenceChromosome | undefined {
    const sequence = lowerGeneToSequence(gene, catalog, config);
    if (sequence.length === 0) {
        return undefined;
    }

    return {
        id: id,
        targetClass: gene.type,
        sourceGene: gene,
        steps: sequence.map((step) => {
            return {
                actor: step.actor,
                operationName: step.operationName,
                operationKind: step.query.trim().indexOf('mutation') === 0 ? 'mutation' : 'query',
                inputBindings: step.variables || {},
                selectionSet: selectionTokens(gene)
            };
        }),
        sequence: sequence,
        expectedStateGoal: 'FOUND_OR_NOT_FOUND',
        generation: generation,
        fitness: 0,
        mutationHistory: mutationHistory
    };
}

function makeArchiveEntry(chromosome: SequenceChromosome): ObjectiveArchiveEntry {
    const gene = chromosome.sourceGene;
    return {
        key: chromosomeTargetKey(chromosome),
        template: gene.type,
        targetResolver: gene.targetResolver,
        objectType: gene.objectType,
        executions: 0,
        findings: 0,
        covered: false,
        bestFitness: 0,
        bestSequenceLength: chromosome.sequence.length,
        lastGeneration: 0
    };
}

function initializeArchive(chromosomes: SequenceChromosome[]): {[key: string]: ObjectiveArchiveEntry} {
    const archive: {[key: string]: ObjectiveArchiveEntry} = {};
    chromosomes.forEach((chromosome) => {
        const key = chromosomeTargetKey(chromosome);
        if (!archive[key]) {
            archive[key] = makeArchiveEntry(chromosome);
        }
        else if (chromosome.sequence.length < archive[key].bestSequenceLength) {
            archive[key].bestSequenceLength = chromosome.sequence.length;
        }
    });
    return archive;
}

function ensureObjective(archive: {[key: string]: ObjectiveArchiveEntry}, chromosome: SequenceChromosome): ObjectiveArchiveEntry {
    const key = chromosomeTargetKey(chromosome);
    if (!archive[key]) {
        archive[key] = makeArchiveEntry(chromosome);
    }
    return archive[key];
}

function initialPopulation(population: AttackGene[], catalog: OperationCatalogEntry[], config: SecurityTestConfig): SequenceChromosome[] {
    const chromosomes: SequenceChromosome[] = [];
    population.forEach((gene, index) => {
        const copy = cloneGene(gene);
        copy.fsmState = 'GRAPH_GA_SEED';
        const chromosome = chromosomeFromGene(copy, catalog, config, 'graph-ga-seed-' + index, 0, ['seed-from-attack-gene']);
        if (chromosome) {
            chromosomes.push(chromosome);
        }
    });
    return orderInitialPopulation(chromosomes, config.seed || 1337);
}

function includesAny(value: string | undefined, terms: string[]): boolean {
    if (!value) {
        return false;
    }
    const lowered = value.toLowerCase();
    return terms.some((term) => lowered.indexOf(term) >= 0);
}

function semanticRiskHint(gene: AttackGene): number {
    const resolver = gene.targetResolver || '';
    if (includesAny(resolver, ['secure', 'safe', 'sanitized', 'public', 'preview', 'history', 'health', 'echo', 'time', 'feed'])) {
        return 0.15;
    }
    if (includesAny(resolver, ['admin', 'super', 'secret', 'private', 'password', 'reset'])) {
        return 0.95;
    }
    if (includesAny(resolver, ['update', 'delete', 'comment', 'post', 'user', 'search'])) {
        return 0.75;
    }
    return 0.5;
}

function templateGoalWeight(gene: AttackGene): number {
    if (gene.type === 'BFLA_ADMIN_LIKE_OP') {
        return 1.0;
    }
    if (gene.type === 'BOPLA_SENSITIVE_FIELD_READ') {
        return 0.95;
    }
    if (gene.type === 'BOLA_UPDATE_DELETE') {
        return 0.85;
    }
    if (gene.type === 'STALE_OBJECT_ACCESS') {
        return 0.75;
    }
    if (gene.type === 'BOLA_READ') {
        return 0.65;
    }
    return 0.5;
}

function sequenceCostHint(chromosome: SequenceChromosome): number {
    return 1 / Math.max(1, chromosome.sequence.length);
}

function noveltyHint(chromosome: SequenceChromosome, seenResolvers: string[], seenTypes: string[], seenTemplates: string[]): number {
    const gene = chromosome.sourceGene;
    let score = 0;
    if (gene.targetResolver && seenResolvers.indexOf(gene.targetResolver) < 0) {
        score += 0.4;
    }
    if (gene.objectType && seenTypes.indexOf(gene.objectType) < 0) {
        score += 0.25;
    }
    if (seenTemplates.indexOf(gene.type) < 0) {
        score += 0.35;
    }
    return Math.min(1, score);
}

function initialSeedScore(chromosome: SequenceChromosome, seenResolvers: string[], seenTypes: string[], seenTemplates: string[]): number {
    const gene = chromosome.sourceGene;
    const dependencyReady = chromosome.sequence.some((step) => JSON.stringify(step.variables).indexOf('${pool.') >= 0) ? 1 : 0.6;
    return 0.30 * templateGoalWeight(gene)
        + 0.25 * semanticRiskHint(gene)
        + 0.20 * noveltyHint(chromosome, seenResolvers, seenTypes, seenTemplates)
        + 0.15 * sequenceCostHint(chromosome)
        + 0.10 * dependencyReady;
}

function orderInitialPopulation(chromosomes: SequenceChromosome[], seed: number): SequenceChromosome[] {
    const rng = makeRng(seed);
    const remaining = chromosomes.slice(0);
    const ordered: SequenceChromosome[] = [];
    const seenResolvers: string[] = [];
    const seenTypes: string[] = [];
    const seenTemplates: string[] = [];

    while (remaining.length > 0) {
        remaining.sort((a, b) => {
            const diff = initialSeedScore(b, seenResolvers, seenTypes, seenTemplates) - initialSeedScore(a, seenResolvers, seenTypes, seenTemplates);
            return diff === 0 ? rng() - 0.5 : diff;
        });
        const selected = remaining.shift() as SequenceChromosome;
        ordered.push(selected);
        markSeen(selected, seenResolvers, seenTypes, seenTemplates);
    }

    return ordered;
}

function containsSensitiveValue(data: any, fieldName?: string): boolean {
    if (!data || !fieldName) {
        return false;
    }
    const stack = [data];
    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
            continue;
        }
        if (Array.isArray(current)) {
            current.forEach((item) => stack.push(item));
        }
        else if (typeof current === 'object') {
            if (current[fieldName] !== undefined && current[fieldName] !== null) {
                return true;
            }
            Object.keys(current).forEach((key) => stack.push(current[key]));
        }
    }
    return false;
}

function computeFeedback(chromosome: SequenceChromosome, results: any[], finding: Finding | undefined, beforePoolSize: number, pool: ObjectPool, seenResolvers: string[], seenTypes: string[], seenTemplates: string[]): RuntimeFeedback {
    const completed = results.length === chromosome.sequence.length;
    const validGraphQL = completed && results.every((result) => !hasResultErrors(result));
    const responseHadData = results.some(hasData);
    const responseHadAuthError = results.some((result) => {
        return result.errors && JSON.stringify(result.errors).toLowerCase().indexOf('auth') >= 0;
    });
    const targetResolver = chromosome.sourceGene.targetResolver;
    const objectType = chromosome.sourceGene.objectType;
    const template = chromosome.sourceGene.type;

    return {
        validGraphQL: validGraphQL,
        executedSteps: results.length,
        completed: completed,
        capturedObjects: Math.max(0, pool.all().length - beforePoolSize),
        usedForeignReference: sequenceUsesForeignReference(chromosome.sequence, chromosome.sourceGene.attacker),
        reachedAttackReady: completed && chromosome.sequence.length > 0,
        responseHadData: responseHadData,
        responseHadAuthError: responseHadAuthError,
        sensitiveFieldReturned: results.some((result) => containsSensitiveValue(result.data, chromosome.sourceGene.sensitiveField)),
        sideEffectVerified: !!finding && chromosome.sourceGene.type === 'BOLA_UPDATE_DELETE',
        findingProduced: !!finding,
        newResolverCovered: !!targetResolver && seenResolvers.indexOf(targetResolver) < 0,
        newObjectTypeCovered: !!objectType && seenTypes.indexOf(objectType) < 0,
        newTemplateCovered: seenTemplates.indexOf(template) < 0,
        dependencySatisfied: completed && chromosome.sequence.some((step) => JSON.stringify(step.variables).indexOf('${pool.') >= 0),
        invalidPenalty: validGraphQL ? 0 : 1
    };
}

function fitnessFromFeedback(feedback: RuntimeFeedback): number {
    let score = 0;
    score += 0.20 * (feedback.reachedAttackReady ? 1 : feedback.executedSteps > 0 ? 0.4 : 0);
    score += 0.20 * (feedback.validGraphQL ? 1 : feedback.completed ? 0.5 : 0.2);
    score += 0.15 * (feedback.dependencySatisfied ? 1 : 0);
    score += 0.15 * (feedback.findingProduced || feedback.sensitiveFieldReturned || feedback.sideEffectVerified ? 1 : feedback.responseHadData ? 0.4 : 0);
    score += 0.15 * ((feedback.newResolverCovered ? 0.4 : 0) + (feedback.newObjectTypeCovered ? 0.3 : 0) + (feedback.newTemplateCovered ? 0.3 : 0));
    score += 0.10 * ((feedback.capturedObjects > 0 ? 0.5 : 0) + (feedback.usedForeignReference ? 0.5 : 0));
    score += 0.20 * (feedback.findingProduced ? 1 : 0);
    score -= 0.30 * feedback.invalidPenalty;
    return Math.round(score * 1000) / 1000;
}

function updateArchive(archive: {[key: string]: ObjectiveArchiveEntry}, chromosome: SequenceChromosome, finding: Finding | undefined, generation: number): void {
    const entry = ensureObjective(archive, chromosome);
    entry.executions += 1;
    entry.findings += finding ? 1 : 0;
    entry.covered = entry.covered || !!finding;
    entry.bestFitness = Math.max(entry.bestFitness, chromosome.fitness);
    entry.bestSequenceLength = Math.min(entry.bestSequenceLength, chromosome.sequence.length);
    entry.lastGeneration = generation;
}

function pathRarityScore(pathCounts: {[key: string]: number}, chromosome: SequenceChromosome): number {
    const count = pathCounts[chromosomePathKey(chromosome)] || 0;
    return 1 / Math.sqrt(1 + count);
}

function activeObjectiveScore(chromosome: SequenceChromosome, archive: {[key: string]: ObjectiveArchiveEntry}, pathCounts: {[key: string]: number}, generation: number): number {
    const entry = ensureObjective(archive, chromosome);
    const uncovered = entry.covered ? 0.15 : 1.0;
    const targetRarity = 1 / Math.sqrt(1 + entry.executions);
    const pathRarity = pathRarityScore(pathCounts, chromosome);
    const cost = sequenceCostHint(chromosome);
    const age = entry.executions === 0 ? 0.2 : Math.min(0.2, Math.max(0, generation - entry.lastGeneration) * 0.03);
    return 0.30 * uncovered
        + 0.20 * targetRarity
        + 0.15 * pathRarity
        + 0.15 * templateGoalWeight(chromosome.sourceGene)
        + 0.10 * semanticRiskHint(chromosome.sourceGene)
        + 0.05 * cost
        + 0.05 * age
        + 0.10 * chromosome.fitness;
}

function selectExecutionBatch(chromosomes: SequenceChromosome[], archive: {[key: string]: ObjectiveArchiveEntry}, pathCounts: {[key: string]: number}, executedTargets: string[], generation: number, rng: () => number): SequenceChromosome[] {
    return chromosomes
        .filter((chromosome) => executedTargets.indexOf(chromosomeTargetKey(chromosome)) < 0)
        .slice(0)
        .sort((a, b) => {
            const diff = activeObjectiveScore(b, archive, pathCounts, generation) - activeObjectiveScore(a, archive, pathCounts, generation);
            return diff === 0 ? rng() - 0.5 : diff;
        })
        .slice(0, Math.min(chromosomes.length, 8));
}

function markSeen(chromosome: SequenceChromosome, seenResolvers: string[], seenTypes: string[], seenTemplates: string[]): void {
    const resolver = chromosome.sourceGene.targetResolver;
    const type = chromosome.sourceGene.objectType;
    const template = chromosome.sourceGene.type;
    if (resolver && seenResolvers.indexOf(resolver) < 0) {
        seenResolvers.push(resolver);
    }
    if (type && seenTypes.indexOf(type) < 0) {
        seenTypes.push(type);
    }
    if (seenTemplates.indexOf(template) < 0) {
        seenTemplates.push(template);
    }
}

function tournament(population: SequenceChromosome[], archive: {[key: string]: ObjectiveArchiveEntry}, pathCounts: {[key: string]: number}, generation: number, rng: () => number): SequenceChromosome {
    const k = Math.min(3, population.length);
    let best = population[Math.floor(rng() * population.length)];
    for (let i = 1; i < k; i++) {
        const candidate = population[Math.floor(rng() * population.length)];
        if (activeObjectiveScore(candidate, archive, pathCounts, generation) > activeObjectiveScore(best, archive, pathCounts, generation)) {
            best = candidate;
        }
    }
    return best;
}

function hasDependency(edges: ReturnType<typeof buildDependencyGraph>, from?: string, to?: string): boolean {
    if (!from || !to) {
        return false;
    }
    return edges.some((edge) => edge.from === from && edge.to === to);
}

function dependencyTagsFor(gene: AttackGene): string[] {
    if (gene.type === 'BOLA_READ' || gene.type === 'STALE_OBJECT_ACCESS') {
        return ['read_by_id'];
    }
    if (gene.type === 'BOLA_UPDATE_DELETE') {
        return ['update', 'delete'];
    }
    return [];
}

function repairGene(gene: AttackGene, catalog: OperationCatalogEntry[], config: SecurityTestConfig, id: string, generation: number, history: string[]): SequenceChromosome | undefined {
    const edges = buildDependencyGraph(catalog);

    if (gene.setupResolver && gene.targetResolver && !hasDependency(edges, gene.setupResolver, gene.targetResolver)) {
        const replacement = compatibleTargets(catalog, edges, gene.setupResolver, dependencyTagsFor(gene))
            .filter((entry) => !gene.objectType || entry.namedReturnType === gene.objectType)[0];
        if (replacement) {
            gene.targetResolver = replacement.name;
            history.push('dependency-target-repair');
        }
    }

    if (gene.type === 'STALE_OBJECT_ACCESS' && gene.setupResolver && gene.deleteResolver && !hasDependency(edges, gene.setupResolver, gene.deleteResolver)) {
        const replacement = compatibleTargets(catalog, edges, gene.setupResolver, ['delete'])
            .filter((entry) => !gene.objectType || entry.namedReturnType === gene.objectType)[0];
        if (replacement) {
            gene.deleteResolver = replacement.name;
            history.push('dependency-delete-repair');
        }
    }

    return chromosomeFromGene(gene, catalog, config, id, generation, history);
}

function mutateGene(parent: SequenceChromosome, catalog: OperationCatalogEntry[], config: SecurityTestConfig, rng: () => number, generation: number): SequenceChromosome {
    const gene = cloneGene(parent.sourceGene);
    const edges = buildDependencyGraph(catalog);
    const history = parent.mutationHistory.slice(0);
    const roll = rng();

    if (roll < 0.25 && gene.setupResolver) {
        let tags: string[] = [];
        if (gene.type === 'BOLA_READ') {
            tags = ['read_by_id'];
        }
        else if (gene.type === 'BOLA_UPDATE_DELETE') {
            tags = rng() < 0.5 ? ['update'] : ['delete'];
        }
        else if (gene.type === 'STALE_OBJECT_ACCESS') {
            tags = ['read_by_id'];
        }
        const options = compatibleTargets(catalog, edges, gene.setupResolver, tags)
            .filter((entry) => !gene.objectType || entry.namedReturnType === gene.objectType);
        if (options.length > 0) {
            gene.targetResolver = options[Math.floor(rng() * options.length)].name;
            history.push('target-operation-mutation');
        }
    }
    else if (roll < 0.45 && gene.type === 'BFLA_ADMIN_LIKE_OP') {
        const options = operationsWithTag(catalog, 'admin_like');
        if (options.length > 0) {
            const op = options[Math.floor(rng() * options.length)];
            gene.targetResolver = op.name;
            gene.objectType = op.namedReturnType;
            gene.selectionSet = scalarSelection(op.fields.map((field) => field.name), config);
            history.push('admin-like-operation-mutation');
        }
    }
    else if (roll < 0.65 && gene.type === 'BOPLA_SENSITIVE_FIELD_READ') {
        const options = operationsWithTag(catalog, 'sensitive_surface');
        if (options.length > 0) {
            const op = options[Math.floor(rng() * options.length)];
            const sensitive = op.fields
                .map((field) => field.name)
                .filter((field) => sensitiveFieldNames(config).indexOf(field) >= 0);
            if (sensitive.length > 0) {
                gene.targetResolver = op.name;
                gene.objectType = op.namedReturnType;
                gene.sensitiveField = sensitive[Math.floor(rng() * sensitive.length)];
                gene.selectionSet = scalarSelection(op.fields.map((field) => field.name), config);
                history.push('sensitive-field-mutation');
            }
        }
    }
    else if (roll < 0.8) {
        const owner = gene.owner;
        gene.owner = gene.attacker;
        gene.attacker = owner;
        history.push('actor-swap-mutation');
    }
    else {
        const op = findOperation(catalog, gene.targetResolver);
        if (op) {
            gene.selectionSet = scalarSelection(op.fields.map((field) => field.name), config);
            history.push('selection-set-repair-mutation');
        }
    }

    gene.id = parent.sourceGene.id + '-m' + generation + '-' + Math.floor(rng() * 10000);
    gene.fsmState = 'GRAPH_GA_MUTATED';
    const repaired = repairGene(gene, catalog, config, 'graph-ga-mut-' + gene.id, generation, history);
    return repaired || parent;
}

function crossover(a: SequenceChromosome, b: SequenceChromosome, catalog: OperationCatalogEntry[], config: SecurityTestConfig, rng: () => number, generation: number): SequenceChromosome {
    const child = cloneGene(a.sourceGene);
    const history = a.mutationHistory.concat(['crossover']);

    if (a.sourceGene.type === b.sourceGene.type && (!a.sourceGene.objectType || a.sourceGene.objectType === b.sourceGene.objectType)) {
        child.targetResolver = b.sourceGene.targetResolver || child.targetResolver;
        child.deleteResolver = b.sourceGene.deleteResolver || child.deleteResolver;
        child.verifyResolver = b.sourceGene.verifyResolver || child.verifyResolver;
        child.sensitiveField = b.sourceGene.sensitiveField || child.sensitiveField;
        child.selectionSet = b.sourceGene.selectionSet || child.selectionSet;
    }
    else if (rng() < 0.5) {
        return mutateGene(b, catalog, config, rng, generation);
    }

    child.id = a.sourceGene.id + '-x-' + b.sourceGene.id + '-' + generation;
    child.fsmState = 'GRAPH_GA_CROSSOVER';
    const repaired = repairGene(child, catalog, config, 'graph-ga-x-' + child.id, generation, history);
    return repaired || a;
}

function nextGeneration(current: SequenceChromosome[], seeds: SequenceChromosome[], catalog: OperationCatalogEntry[], config: SecurityTestConfig, archive: {[key: string]: ObjectiveArchiveEntry}, pathCounts: {[key: string]: number}, rng: () => number, generation: number): SequenceChromosome[] {
    const combined = current.concat(seeds).reduce((unique: SequenceChromosome[], chromosome) => {
        if (!unique.some((item) => chromosomeTargetKey(item) === chromosomeTargetKey(chromosome))) {
            unique.push(chromosome);
        }
        return unique;
    }, []);
    const ordered = combined.slice(0).sort((a, b) => activeObjectiveScore(b, archive, pathCounts, generation) - activeObjectiveScore(a, archive, pathCounts, generation));
    const next = ordered.slice(0, Math.min(4, ordered.length));
    const nextKeys = next.map(chromosomeTargetKey);
    let attempts = 0;

    while (next.length < combined.length && combined.length > 0 && attempts < combined.length * 5) {
        attempts += 1;
        const parentA = tournament(ordered, archive, pathCounts, generation, rng);
        const parentB = tournament(ordered, archive, pathCounts, generation, rng);
        const child = rng() < 0.45
            ? crossover(parentA, parentB, catalog, config, rng, generation)
            : mutateGene(parentA, catalog, config, rng, generation);
        ensureObjective(archive, child);
        const key = chromosomeTargetKey(child);
        if (nextKeys.indexOf(key) >= 0 && attempts < combined.length * 4) {
            continue;
        }
        next.push(child);
        nextKeys.push(key);
    }

    return next;
}

export async function runGraphGa(config: SecurityTestConfig, catalog: OperationCatalogEntry[], population: AttackGene[]): Promise<GraphGaResult> {
    const rng = makeRng(config.seed || 1337);
    const executor = new MultiSessionExecutor(config);
    const pool = new ObjectPool();
    const logs: AttackExecutionLog[] = [];
    const findings: Finding[] = [];
    const seenResolvers: string[] = [];
    const seenTypes: string[] = [];
    const seenTemplates: string[] = [];
    const executedTargets: string[] = [];
    let chromosomes = initialPopulation(population, catalog, config);
    const seedBank = chromosomes.slice(0);
    const archive = initializeArchive(chromosomes);
    const pathCounts: {[key: string]: number} = {};
    let firstFindingAt: number | null = null;
    let executable = 0;
    let attackReady = 0;
    let generation = 0;

    if (chromosomes.length === 0) {
        return {logs: logs, findings: findings, pool: pool, requestCount: 0, attackReady: 0, executable: 0, firstFindingAt: null};
    }

    while (executor.requestCount < config.requestBudget && generation < 8) {
        const slice = selectExecutionBatch(chromosomes, archive, pathCounts, executedTargets, generation, rng);

        if (slice.length === 0) {
            break;
        }

        for (let i = 0; i < slice.length; i++) {
            if (executor.requestCount >= config.requestBudget) {
                break;
            }

            const chromosome = slice[i];
            const results = [];
            const beforePoolSize = pool.all().length;
            const pathKey = chromosomePathKey(chromosome);
            executable += 1;
            executedTargets.push(chromosomeTargetKey(chromosome));
            pathCounts[pathKey] = (pathCounts[pathKey] || 0) + 1;

            for (let stepIndex = 0; stepIndex < chromosome.sequence.length; stepIndex++) {
                if (executor.requestCount >= config.requestBudget) {
                    break;
                }
                results.push(await executor.executeStep(chromosome.sequence[stepIndex], pool));
            }

            const finding = evaluateGene(chromosome.sourceGene, chromosome.sequence, results, pool);
            chromosome.feedback = computeFeedback(chromosome, results, finding, beforePoolSize, pool, seenResolvers, seenTypes, seenTemplates);
            chromosome.fitness = fitnessFromFeedback(chromosome.feedback);
            chromosome.sourceGene.fitness = chromosome.fitness;
            chromosome.sourceGene.fsmState = 'GRAPH_GA';
            if (chromosome.feedback.reachedAttackReady) {
                attackReady += 1;
            }
            updateArchive(archive, chromosome, finding, generation);
            markSeen(chromosome, seenResolvers, seenTypes, seenTemplates);

            const log: AttackExecutionLog = {
                gene: chromosome.sourceGene,
                sequence: chromosome.sequence,
                results: results
            };
            if (finding) {
                log.finding = finding;
                findings.push(finding);
                if (firstFindingAt === null) {
                    firstFindingAt = executor.requestCount;
                }
            }
            logs.push(log);
        }

        generation += 1;
        chromosomes = nextGeneration(chromosomes, seedBank, catalog, config, archive, pathCounts, rng, generation);
    }

    return {
        logs: logs,
        findings: findings,
        pool: pool,
        requestCount: executor.requestCount,
        attackReady: attackReady,
        executable: executable,
        firstFindingAt: firstFindingAt
    };
}
