import {AttackExecutionLog, AttackGene, Finding, GraphQLExecutionResult, ObjectPoolEntry, SequenceStep} from './types';
import {ObjectPool} from './object_pool';

function hasErrors(result: GraphQLExecutionResult | undefined): boolean {
    return !result || (result.errors && result.errors.length > 0) || result.status >= 400 || result.status === 0;
}

function resolverData(result: GraphQLExecutionResult | undefined, resolver?: string): any {
    if (!result || !resolver || !result.data) {
        return null;
    }
    return result.data[resolver];
}

function makeFindingId(gene: AttackGene): string {
    return gene.type + ':' + (gene.targetResolver || 'unknown') + ':' + (gene.objectType || 'unknown');
}

function cloneValue(value: any): any {
    return JSON.parse(JSON.stringify(value));
}

export function evaluateGene(gene: AttackGene, sequence: SequenceStep[], results: GraphQLExecutionResult[], pool: ObjectPool): Finding | undefined {
    if (gene.type === 'BOLA_READ') {
        return evaluateBolaRead(gene, sequence, results, pool);
    }
    if (gene.type === 'BOLA_UPDATE_DELETE') {
        return evaluateBolaUpdateDelete(gene, sequence, results, pool);
    }
    if (gene.type === 'STALE_OBJECT_ACCESS') {
        return evaluateStaleObjectAccess(gene, sequence, results, pool);
    }
    if (gene.type === 'BFLA_ADMIN_LIKE_OP') {
        return evaluateBfla(gene, sequence, results);
    }
    if (gene.type === 'BOPLA_SENSITIVE_FIELD_READ') {
        return evaluateBopla(gene, sequence, results);
    }
    return undefined;
}

function evaluateBolaRead(gene: AttackGene, sequence: SequenceStep[], results: GraphQLExecutionResult[], pool: ObjectPool): Finding | undefined {
    if (!gene.objectType || !gene.targetResolver) {
        return undefined;
    }

    const object: ObjectPoolEntry | undefined = pool.firstOwnedBy(gene.owner, gene.objectType);
    const attackResult = results.find((result) => result.operationName.indexOf('ReadForeign') === 0);
    const baselineResult = results.find((result) => result.operationName.indexOf('UnauthBaseline') === 0);
    const attackData = resolverData(attackResult, gene.targetResolver);
    const baselineData = resolverData(baselineResult, gene.targetResolver);

    if (!object || hasErrors(attackResult) || !attackData || String(attackData.id) !== object.id) {
        return undefined;
    }

    const objectWasPrivate = attackData.public === false || (object.evidence && object.evidence.public === false);
    const baselineAlsoReadable = !!baselineData && !hasErrors(baselineResult);

    if (!objectWasPrivate && baselineAlsoReadable) {
        return undefined;
    }

    return {
        id: makeFindingId(gene),
        owaspType: 'BOLA_READ',
        targetResolver: gene.targetResolver,
        objectType: gene.objectType,
        actorPair: {
            owner: gene.owner,
            attacker: gene.attacker
        },
        severity: baselineAlsoReadable ? 'high' : 'medium',
        evidence: {
            objectPoolEntry: cloneValue(object),
            attackerReadData: attackData,
            attackerErrors: attackResult ? attackResult.errors : [],
            unauthenticatedBaselineReadable: baselineAlsoReadable,
            unauthenticatedBaselineData: baselineData,
            oracle: 'Attacker received owner private object by id without an authorization error.'
        },
        replaySequence: sequence
    };
}

function evaluateBfla(gene: AttackGene, sequence: SequenceStep[], results: GraphQLExecutionResult[]): Finding | undefined {
    if (!gene.targetResolver) {
        return undefined;
    }
    const result = results.find((item) => item.operationName === 'LowPrivAdminLikeOperation');
    const data = resolverData(result, gene.targetResolver);
    if (hasErrors(result) || !data) {
        return undefined;
    }

    return {
        id: makeFindingId(gene),
        owaspType: 'BFLA_ADMIN_LIKE_OP',
        targetResolver: gene.targetResolver,
        objectType: gene.objectType || 'Unknown',
        actorPair: {
            owner: gene.owner,
            attacker: gene.attacker
        },
        severity: 'high',
        evidence: {
            lowPrivilegeResult: data,
            errors: result ? result.errors : [],
            oracle: 'Low-privilege actor executed an admin-like resolver successfully.'
        },
        replaySequence: sequence
    };
}

function evaluateBolaUpdateDelete(gene: AttackGene, sequence: SequenceStep[], results: GraphQLExecutionResult[], pool: ObjectPool): Finding | undefined {
    if (!gene.objectType || !gene.targetResolver) {
        return undefined;
    }

    const object: ObjectPoolEntry | undefined = pool.firstOwnedBy(gene.owner, gene.objectType);
    const attackResult = results.find((result) => result.operationName.indexOf('ModifyForeign') === 0);
    const attackData = resolverData(attackResult, gene.targetResolver);
    if (!object || hasErrors(attackResult) || !attackData || String(attackData.id) !== object.id) {
        return undefined;
    }

    return {
        id: makeFindingId(gene),
        owaspType: 'BOLA_UPDATE_DELETE',
        targetResolver: gene.targetResolver,
        objectType: gene.objectType,
        actorPair: {
            owner: gene.owner,
            attacker: gene.attacker
        },
        severity: 'high',
        evidence: {
            objectPoolEntry: cloneValue(object),
            attackerMutationData: attackData,
            errors: attackResult ? attackResult.errors : [],
            oracle: 'Attacker modified or deleted owner object by id without an authorization error.'
        },
        replaySequence: sequence
    };
}

function evaluateStaleObjectAccess(gene: AttackGene, sequence: SequenceStep[], results: GraphQLExecutionResult[], pool: ObjectPool): Finding | undefined {
    if (!gene.objectType || !gene.targetResolver) {
        return undefined;
    }

    const object: ObjectPoolEntry | undefined = pool.firstOwnedBy(gene.owner, gene.objectType);
    const deleteResult = results.find((result) => result.operationName.indexOf('DeleteStaleTarget') === 0);
    const readResult = results.find((result) => result.operationName.indexOf('ReadDeleted') === 0);
    const readData = resolverData(readResult, gene.targetResolver);

    if (!object || hasErrors(deleteResult) || hasErrors(readResult) || !readData || String(readData.id) !== object.id) {
        return undefined;
    }

    if (readData.deleted !== true) {
        return undefined;
    }

    return {
        id: makeFindingId(gene),
        owaspType: 'STALE_OBJECT_ACCESS',
        targetResolver: gene.targetResolver,
        objectType: gene.objectType,
        actorPair: {
            owner: gene.owner,
            attacker: gene.attacker
        },
        severity: 'medium',
        evidence: {
            objectPoolEntry: cloneValue(object),
            deletedReadData: readData,
            oracle: 'Deleted object remains readable by id after delete operation.'
        },
        replaySequence: sequence
    };
}

function findSensitiveValue(data: any, resolver: string | undefined, field: string | undefined): any {
    if (!data || !resolver || !field) {
        return undefined;
    }
    const value = data[resolver];
    if (Array.isArray(value)) {
        const item = value.filter((entry) => entry && entry[field] !== undefined && entry[field] !== null)[0];
        return item ? item[field] : undefined;
    }
    if (value && value[field] !== undefined && value[field] !== null) {
        return value[field];
    }
    return undefined;
}

function evaluateBopla(gene: AttackGene, sequence: SequenceStep[], results: GraphQLExecutionResult[]): Finding | undefined {
    if (!gene.targetResolver || !gene.objectType || !gene.sensitiveField) {
        return undefined;
    }

    const result = results.find((item) => item.operationName.indexOf('ReadSensitive') === 0);
    const sensitiveValue = findSensitiveValue(result ? result.data : null, gene.targetResolver, gene.sensitiveField);
    if (hasErrors(result) || sensitiveValue === undefined) {
        return undefined;
    }

    return {
        id: makeFindingId(gene) + ':' + gene.sensitiveField,
        owaspType: 'BOPLA_SENSITIVE_FIELD_READ',
        targetResolver: gene.targetResolver,
        objectType: gene.objectType,
        actorPair: {
            owner: gene.owner,
            attacker: gene.attacker
        },
        severity: 'medium',
        evidence: {
            sensitiveField: gene.sensitiveField,
            sensitiveValueSample: String(sensitiveValue).substring(0, 12),
            oracle: 'Low-privilege actor received a sensitive object property in the GraphQL selection set.'
        },
        replaySequence: sequence
    };
}

export function falsePositiveCount(logs: AttackExecutionLog[]): number {
    return logs.filter((log) => {
        return log.gene.type === 'BOLA_READ'
            && !!log.finding
            && !!log.finding.evidence
            && log.finding.evidence.objectPoolEntry
            && log.finding.evidence.objectPoolEntry.evidence
            && log.finding.evidence.objectPoolEntry.evidence.public === true;
    }).length;
}
