import {falsePositiveCount} from './oracle';
import {
    AttackExecutionLog,
    EvaluationResult,
    Finding,
    GenerationLogEntry
} from './types';

export interface ExecutionLogGroup {
    mode: string;
    logs: AttackExecutionLog[];
}

export function uniqueFindings(findings: Finding[]): Finding[] {
    const ids: string[] = [];
    const unique: Finding[] = [];
    findings.forEach((finding: Finding) => {
        if (ids.indexOf(finding.id) < 0) {
            ids.push(finding.id);
            unique.push(finding);
        }
    });
    return unique;
}

export function isAttackReady(state: string): boolean {
    return state === 'ATTACK_READY'
        || state === 'GA_PRIORITIZED'
        || state === 'TEMPLATE_READY'
        || state === 'RANDOM_BASELINE'
        || state === 'RANDOM_ATTACK_GENE'
        || state === 'RANDOM_SEQUENCE_GENE'
        || state === 'GA_WITHOUT_FSM'
        || state === 'MIO_FSM_ARCHIVE'
        || state === 'GRAPH_GA'
        || state === 'GRAPH_GA_SEED'
        || state === 'GRAPH_GA_MUTATED'
        || state === 'GRAPH_GA_CROSSOVER';
}

function coveredAttackTypes(findings: Finding[]): string[] {
    const types: string[] = [];
    findings.forEach((finding: Finding) => {
        if (types.indexOf(finding.owaspType) < 0) {
            types.push(finding.owaspType);
        }
    });
    return types;
}

function uniqueCount(values: Array<string | undefined>): number {
    const seen: string[] = [];
    values.forEach((value) => {
        if (value && seen.indexOf(value) < 0) {
            seen.push(value);
        }
    });
    return seen.length;
}

function sequenceIdentity(log: AttackExecutionLog): string {
    return log.sequence.map((step) => step.actor + ':' + step.operationName).join(' -> ');
}

function resultHasErrors(result: {status: number; errors?: unknown[]}): boolean {
    return result.status === 0 || result.status >= 400 || (result.errors !== undefined && result.errors.length > 0);
}

function isValidCompletedLog(log: AttackExecutionLog): boolean {
    return log.results.length === log.sequence.length && log.results.every((result) => !resultHasErrors(result));
}

function usesOwaspTemplate(log: AttackExecutionLog): boolean {
    return log.gene.fsmState !== 'PURE_RANDOM_SCHEMA' && log.gene.fsmState !== 'DEPENDENCY_ONLY';
}

export function evaluationFromLogs(mode: string, seed: number | undefined, budget: number, requestCount: number, logs: AttackExecutionLog[], findings: Finding[], attackReady: number, executable: number, firstFindingAt: number | null): EvaluationResult {
    const unique = uniqueFindings(findings);
    const validLogs = logs.filter((log) => isValidCompletedLog(log));
    return {
        baseline: mode,
        seed: seed,
        budget: budget,
        requestsUsed: requestCount,
        requestsToFirstFinding: firstFindingAt,
        uniqueFindings: unique.length,
        uniqueVulnerableResolvers: uniqueCount(unique.map((finding) => finding.targetResolver)),
        uniqueVulnerableObjectTypes: uniqueCount(unique.map((finding) => finding.objectType)),
        uniqueTargetResolversTested: uniqueCount(logs.map((log) => log.gene.targetResolver)),
        uniqueObjectTypesTested: uniqueCount(logs.map((log) => log.gene.objectType)),
        uniqueOwaspTemplatesExercised: uniqueCount(logs.filter(usesOwaspTemplate).map((log) => log.gene.type)),
        uniqueActorRolePairsTested: uniqueCount(logs.map((log) => log.gene.owner + '->' + log.gene.attacker)),
        uniqueExecutablePaths: uniqueCount(validLogs.map((log) => sequenceIdentity(log))),
        validSequenceRatio: executable === 0 ? 0 : validLogs.length / executable,
        attackReadyRate: logs.length === 0 ? 0 : attackReady / logs.length,
        falsePositiveCount: falsePositiveCount(logs),
        coveredAttackTypes: coveredAttackTypes(unique)
    };
}

export function buildGenerationLog(runs: ExecutionLogGroup[]): GenerationLogEntry[] {
    const entries: GenerationLogEntry[] = [];
    runs.forEach((run: ExecutionLogGroup) => {
        run.logs.forEach((log: AttackExecutionLog, index: number) => {
            entries.push({
                baseline: run.mode,
                rank: index + 1,
                geneId: log.gene.id,
                attackType: log.gene.type,
                targetResolver: log.gene.targetResolver,
                objectType: log.gene.objectType,
                fitness: log.gene.fitness,
                fsmState: log.gene.fsmState,
                executedSteps: log.results.length,
                completed: log.results.length === log.sequence.length,
                findingId: log.finding ? log.finding.id : undefined
            });
        });
    });
    return entries;
}
