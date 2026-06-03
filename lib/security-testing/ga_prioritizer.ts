import {AttackGene, OperationCatalogEntry} from './types';
import {makeRng} from './baseline_planner';

function cloneGene(gene: AttackGene): AttackGene {
    return Object.assign({}, gene);
}

function deterministicShuffle(genes: AttackGene[], seed: number): AttackGene[] {
    const rng = makeRng(seed);
    const copy = genes.map(cloneGene);
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
    }
    return copy;
}

function targetId(gene: AttackGene): string {
    return [
        gene.type,
        gene.targetResolver || 'unknown-resolver',
        gene.objectType || 'unknown-type',
        gene.sensitiveField || gene.deleteResolver || gene.setupResolver || 'action'
    ].join(':');
}

function fsmProgress(gene: AttackGene): number {
    if (gene.type === 'BOLA_READ') {
        return gene.setupResolver && gene.targetResolver ? 0.8 : 0.4;
    }
    if (gene.type === 'BOLA_UPDATE_DELETE') {
        return gene.setupResolver && gene.targetResolver && gene.verifyResolver ? 0.85 : 0.65;
    }
    if (gene.type === 'STALE_OBJECT_ACCESS') {
        return gene.setupResolver && gene.deleteResolver && gene.targetResolver ? 0.85 : 0.55;
    }
    if (gene.type === 'BFLA_ADMIN_LIKE_OP') {
        return gene.targetResolver ? 0.75 : 0.35;
    }
    if (gene.type === 'BOPLA_SENSITIVE_FIELD_READ') {
        return gene.targetResolver && gene.sensitiveField ? 0.75 : 0.35;
    }
    return 0.2;
}

function securitySurfaceNovelty(gene: AttackGene, seenResolvers: string[], seenTypes: string[], seenTemplates: string[]): number {
    let score = 0;
    if (gene.targetResolver && seenResolvers.indexOf(gene.targetResolver) < 0) {
        score += 0.35;
    }
    if (gene.objectType && seenTypes.indexOf(gene.objectType) < 0) {
        score += 0.25;
    }
    if (seenTemplates.indexOf(gene.type) < 0) {
        score += 0.25;
    }
    if (gene.sensitiveField) {
        score += 0.15;
    }
    return Math.min(score, 1);
}

function executableScore(gene: AttackGene): number {
    return gene.targetResolver ? 1 : 0;
}

function oracleSignalProxy(gene: AttackGene): number {
    if (gene.type === 'BFLA_ADMIN_LIKE_OP' || gene.type === 'BOLA_UPDATE_DELETE') {
        return 0.9;
    }
    if (gene.type === 'BOLA_READ' || gene.type === 'BOPLA_SENSITIVE_FIELD_READ') {
        return 0.8;
    }
    return 0.65;
}

function scoreWithFsm(gene: AttackGene, seenResolvers: string[], seenTypes: string[], seenTemplates: string[]): number {
    return 0.45 * fsmProgress(gene)
        + 0.25 * securitySurfaceNovelty(gene, seenResolvers, seenTypes, seenTemplates)
        + 0.20 * executableScore(gene)
        + 0.10 * oracleSignalProxy(gene);
}

function scoreWithoutFsm(gene: AttackGene, seenResolvers: string[], seenTypes: string[], seenTemplates: string[]): number {
    return 0.45 * securitySurfaceNovelty(gene, seenResolvers, seenTypes, seenTemplates)
        + 0.35 * executableScore(gene)
        + 0.20 * gene.capabilities.length / 5;
}

function markSeen(gene: AttackGene, seenResolvers: string[], seenTypes: string[], seenTemplates: string[]): void {
    if (gene.targetResolver && seenResolvers.indexOf(gene.targetResolver) < 0) {
        seenResolvers.push(gene.targetResolver);
    }
    if (gene.objectType && seenTypes.indexOf(gene.objectType) < 0) {
        seenTypes.push(gene.objectType);
    }
    if (seenTemplates.indexOf(gene.type) < 0) {
        seenTemplates.push(gene.type);
    }
}

function templateOrder(population: AttackGene[]): AttackGene[] {
    return population.map((gene: AttackGene, index: number) => {
        const copy = cloneGene(gene);
        copy.fitness = population.length - index;
        copy.fsmState = 'TEMPLATE_READY';
        return copy;
    });
}

function randomAttackGeneOrder(population: AttackGene[], seed: number): AttackGene[] {
    return deterministicShuffle(population, seed).map((gene: AttackGene, index: number) => {
        const copy = cloneGene(gene);
        copy.fitness = population.length - index;
        copy.fsmState = 'RANDOM_ATTACK_GENE';
        return copy;
    });
}

function noveltyGaOrder(population: AttackGene[]): AttackGene[] {
    const remaining = population.map(cloneGene);
    const ordered: AttackGene[] = [];
    const seenResolvers: string[] = [];
    const seenTypes: string[] = [];
    const seenTemplates: string[] = [];

    while (remaining.length > 0) {
        remaining.sort((a: AttackGene, b: AttackGene) => scoreWithoutFsm(b, seenResolvers, seenTypes, seenTemplates) - scoreWithoutFsm(a, seenResolvers, seenTypes, seenTemplates));
        const selected = remaining.shift() as AttackGene;
        selected.fitness = scoreWithoutFsm(selected, seenResolvers, seenTypes, seenTemplates);
        selected.fsmState = 'GA_WITHOUT_FSM';
        ordered.push(selected);
        markSeen(selected, seenResolvers, seenTypes, seenTemplates);
    }

    return ordered;
}

function mioLiteOrder(population: AttackGene[], seed: number): AttackGene[] {
    const rng = makeRng(seed);
    const archive: {[target: string]: AttackGene[]} = {};
    population.forEach((gene: AttackGene) => {
        const key = targetId(gene);
        if (!archive[key]) {
            archive[key] = [];
        }
        archive[key].push(cloneGene(gene));
    });

    const targets = Object.keys(archive);
    targets.forEach((key: string) => {
        archive[key].sort((a: AttackGene, b: AttackGene) => fsmProgress(b) - fsmProgress(a));
        archive[key] = archive[key].slice(0, 3);
    });

    const emitted: string[] = [];
    const ordered: AttackGene[] = [];
    const seenResolvers: string[] = [];
    const seenTypes: string[] = [];
    const seenTemplates: string[] = [];

    while (ordered.length < population.length) {
        const targetScores = targets.map((key: string) => {
            const best = archive[key].filter((gene) => emitted.indexOf(gene.id) < 0)[0];
            if (!best) {
                return {key: key, score: -1};
            }
            const uncovered = ordered.some((gene) => targetId(gene) === key) ? 0 : 2.0;
            const priority = uncovered
                + 1.0 * (1 - fsmProgress(best))
                + 0.7 * securitySurfaceNovelty(best, seenResolvers, seenTypes, seenTemplates)
                + 0.5 * oracleSignalProxy(best);
            return {key: key, score: priority + rng() * 0.001};
        }).filter((item) => item.score >= 0);

        if (targetScores.length === 0) {
            break;
        }

        targetScores.sort((a, b) => b.score - a.score);
        const selectedTarget = rng() < 0.15 ? targetScores[Math.floor(rng() * targetScores.length)].key : targetScores[0].key;
        const selected = archive[selectedTarget].filter((gene) => emitted.indexOf(gene.id) < 0)[0];
        if (!selected) {
            break;
        }

        selected.fitness = scoreWithFsm(selected, seenResolvers, seenTypes, seenTemplates);
        selected.fsmState = 'MIO_FSM_ARCHIVE';
        ordered.push(selected);
        emitted.push(selected.id);
        markSeen(selected, seenResolvers, seenTypes, seenTemplates);
    }

    population.forEach((gene) => {
        if (emitted.indexOf(gene.id) < 0) {
            const copy = cloneGene(gene);
            copy.fitness = scoreWithFsm(copy, seenResolvers, seenTypes, seenTemplates);
            copy.fsmState = 'MIO_FSM_ARCHIVE';
            ordered.push(copy);
        }
    });

    return ordered;
}

export function prioritizeCandidates(population: AttackGene[], _catalog: OperationCatalogEntry[], mode: string, seed: number = 1337): AttackGene[] {
    if (mode === 'random-attack-gene' || mode === 'random') {
        return randomAttackGeneOrder(population, seed);
    }
    if (mode === 'template-only' || mode === 'template') {
        return templateOrder(population);
    }
    if (mode === 'ga-without-fsm') {
        return noveltyGaOrder(population);
    }
    if (mode === 'ours' || mode === 'ga') {
        return mioLiteOrder(population, seed);
    }
    return mioLiteOrder(population, seed);
}
