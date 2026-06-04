import {buildAttackPopulation} from './attack_registry';
import {applyCliOverrides, configPathFromArgs, loadConfig} from './config';
import {MultiSessionExecutor} from './executor';
import {prioritizeCandidates} from './ga_prioritizer';
import {ObjectPool} from './object_pool';
import {evaluateGene} from './oracle';
import {COURSE_PROFILE_BUDGETS, COURSE_PROFILE_SEEDS, DEFAULT_METHODS, parseNumberList, parseStringList} from './experiment';
import {buildGenerationLog, evaluationFromLogs, isAttackReady, uniqueFindings} from './evaluation';
import {Reporter} from './reporter';
import {loadOperationCatalog} from './schema_loader';
import {lowerGeneToSequence} from './sequence_planner';
import {buildDependencyOnlyCandidates, buildPureRandomSchemaCandidates, PlannedBaselineCandidate} from './baseline_planner';
import {
    AttackExecutionLog,
    AttackGene,
    EvaluationResult,
    Finding,
    GroundTruthComparison,
    OperationCatalogEntry,
    SecurityTestConfig
} from './types';

interface ModeRun {
    mode: string;
    budget: number;
    logs: AttackExecutionLog[];
    findings: Finding[];
    pool: ObjectPool;
    evaluation: EvaluationResult;
}

interface RunOptions {
    methods: string[];
    seeds: number[];
    budgets: number[];
    profile?: string;
}

async function runPlannedBaseline(mode: string, config: SecurityTestConfig, catalog: OperationCatalogEntry[], candidates: PlannedBaselineCandidate[]): Promise<ModeRun> {
    const executor = new MultiSessionExecutor(config);
    const pool = new ObjectPool();
    const logs: AttackExecutionLog[] = [];
    const findings: Finding[] = [];
    let executable = 0;

    for (let i = 0; i < candidates.length; i++) {
        if (executor.requestCount >= config.requestBudget) {
            break;
        }
        const candidate = candidates[i];
        const results = [];
        executable += 1;
        for (let stepIndex = 0; stepIndex < candidate.sequence.length; stepIndex++) {
            if (executor.requestCount >= config.requestBudget) {
                break;
            }
            results.push(await executor.executeStep(candidate.sequence[stepIndex], pool));
        }
        logs.push({
            gene: candidate.gene,
            sequence: candidate.sequence,
            results: results
        });
    }

    return {
        mode: mode,
        budget: config.requestBudget,
        logs: logs,
        findings: findings,
        pool: pool,
        evaluation: evaluationFromLogs(mode, config.seed, config.requestBudget, executor.requestCount, logs, findings, 0, executable, null)
    };
}

async function runMode(mode: string, config: SecurityTestConfig, catalog: OperationCatalogEntry[], population: AttackGene[]): Promise<ModeRun> {
    if (mode === 'pure-random-schema') {
        const actors = config.actors.map((actor) => actor.name);
        return runPlannedBaseline(mode, config, catalog, buildPureRandomSchemaCandidates(catalog, actors, config.requestBudget, config.seed || 1));
    }
    if (mode === 'dependency-only') {
        return runPlannedBaseline(mode, config, catalog, buildDependencyOnlyCandidates(catalog, config.actors[0].name, config.seed || 1));
    }

    const executor = new MultiSessionExecutor(config);
    const pool = new ObjectPool();
    const prioritized = prioritizeCandidates(population, catalog, mode, config.seed || 1337);
    const logs: AttackExecutionLog[] = [];
    const findings: Finding[] = [];
    let attackReady = 0;
    let executable = 0;
    let firstFindingAt: number | null = null;

    for (let i = 0; i < prioritized.length; i++) {
        if (executor.requestCount >= config.requestBudget) {
            break;
        }

        const gene = prioritized[i];
        const sequence = lowerGeneToSequence(gene, catalog, config);
        if (sequence.length === 0) {
            continue;
        }

        executable += 1;
        if (isAttackReady(gene.fsmState)) {
            attackReady += 1;
        }

        const results = [];
        for (let stepIndex = 0; stepIndex < sequence.length; stepIndex++) {
            if (executor.requestCount >= config.requestBudget) {
                break;
            }
            results.push(await executor.executeStep(sequence[stepIndex], pool));
        }

        const finding = evaluateGene(gene, sequence, results, pool);
        const log: AttackExecutionLog = {
            gene: gene,
            sequence: sequence,
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

    const evaluation = evaluationFromLogs(mode, config.seed, config.requestBudget, executor.requestCount, logs, findings, attackReady, executable, firstFindingAt);

    return {
        mode: mode,
        budget: config.requestBudget,
        logs: logs,
        findings: uniqueFindings(findings),
        pool: pool,
        evaluation: evaluation
    };
}

function parseRunOptions(args: string[]): RunOptions {
    let methods = DEFAULT_METHODS.slice(0);
    let seeds: number[] = [];
    let budgets: number[] = [];
    let profile: string | undefined;

    args.forEach((arg: string, index: number) => {
        if (arg === '--method' && args[index + 1]) {
            methods = parseStringList(args[index + 1]);
        }
        else if (arg === '--profile' && args[index + 1]) {
            profile = args[index + 1];
        }
        else if (arg === '--seeds' && args[index + 1]) {
            seeds = parseNumberList(args[index + 1]);
        }
        else if (arg === '--budgets' && args[index + 1]) {
            budgets = parseNumberList(args[index + 1]);
        }
    });

    if (profile === 'course') {
        if (seeds.length === 0) {
            seeds = COURSE_PROFILE_SEEDS.slice(0);
        }
        if (budgets.length === 0) {
            budgets = COURSE_PROFILE_BUDGETS.slice(0);
        }
    }

    return {
        methods: methods,
        seeds: seeds,
        budgets: budgets,
        profile: profile
    };
}

function withSeedAndBudget(config: SecurityTestConfig, seed: number | undefined, budget: number): SecurityTestConfig {
    return {
        endpoint: config.endpoint,
        outputDir: config.outputDir,
        requestBudget: budget,
        actors: config.actors,
        operationCatalogPath: config.operationCatalogPath,
        groundTruthPath: config.groundTruthPath,
        hintsPath: config.hintsPath,
        schemaSource: config.schemaSource,
        auth: config.auth,
        hints: config.hints,
        seed: seed
    };
}

async function runSecurityRegression(config: SecurityTestConfig, options: RunOptions): Promise<void> {
    const catalog = await loadOperationCatalog(config);
    const reporter = new Reporter(config);
    reporter.writeCatalog(catalog);

    if (config.actors.length < 2) {
        throw new Error('At least two actor sessions are required.');
    }

    const owner = config.actors[0].name;
    const attacker = config.actors[1].name;
    const population = buildAttackPopulation(catalog, owner, attacker);
    const seeds = options.seeds.length > 0 ? options.seeds : [config.seed || 1];
    const budgets = options.budgets.length > 0 ? options.budgets : [config.requestBudget];
    const runs: ModeRun[] = [];

    for (let budgetIndex = 0; budgetIndex < budgets.length; budgetIndex++) {
        for (let seedIndex = 0; seedIndex < seeds.length; seedIndex++) {
            for (let i = 0; i < options.methods.length; i++) {
                const seedConfig = withSeedAndBudget(config, seeds[seedIndex], budgets[budgetIndex]);
                const run = await runMode(options.methods[i], seedConfig, catalog, population);
                const labels: string[] = [];
                if (budgets.length > 1) {
                    labels.push('budget' + budgets[budgetIndex]);
                }
                if (seeds.length > 1) {
                    labels.push('seed' + seeds[seedIndex]);
                }
                if (labels.length > 0) {
                    run.mode = run.mode + '@' + labels.join('@');
                    run.evaluation.baseline = run.mode;
                }
                runs.push(run);
            }
        }
    }

    const gaRuns = runs.filter((run) => run.mode === 'ours' || run.mode.indexOf('ours@') === 0);
    const ga = gaRuns.sort((a: ModeRun, b: ModeRun) => {
        if (b.findings.length !== a.findings.length) {
            return b.findings.length - a.findings.length;
        }
        return b.budget - a.budget;
    })[0] || runs[runs.length - 1];
    reporter.writeObjectPool(ga.pool);
    reporter.writeAttackLog(ga.logs);
    reporter.writeFindings(ga.findings);
    const evaluations = runs.map((run) => run.evaluation);
    const groundTruth = reporter.loadGroundTruth();
    const comparisons: GroundTruthComparison[] = runs.map((run: ModeRun) => {
        return reporter.compareFindingsWithGroundTruth(run.mode, run.findings, groundTruth);
    });
    reporter.writeEvaluation(evaluations);
    reporter.writeGenerationLog(buildGenerationLog(runs));
    reporter.writeGroundTruthComparison(comparisons);
    reporter.writeBudgetCurve(evaluations, comparisons);
    reporter.writeRunReport(evaluations, comparisons, groundTruth);
    reporter.writeFeedback(evaluations, comparisons);

    console.log('GraphQL security regression complete.');
    console.log('Endpoint:', config.endpoint);
    if (config.operationCatalogPath) {
        console.log('Catalog:', config.operationCatalogPath);
    }
    else {
        console.log('Schema source:', config.schemaSource);
    }
    console.log('Output:', config.outputDir);
    console.log('Selected findings:', ga.findings.length);
    ga.findings.forEach((finding: Finding) => {
        console.log('-', finding.owaspType, finding.targetResolver, finding.objectType, finding.severity);
    });
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const command = args[0] || 'run';
    const config = applyCliOverrides(loadConfig(configPathFromArgs(args)), args);
    const options = parseRunOptions(args);
    const reporter = new Reporter(config);

    if (command === 'catalog') {
        const catalog = await loadOperationCatalog(config);
        const filePath = reporter.writeCatalog(catalog);
        console.log('Wrote operation catalog:', filePath);
        return;
    }

    if (command === 'run' || command === 'eval') {
        await runSecurityRegression(config, options);
        return;
    }

    console.log('Usage: npm run security:fuzz -- [catalog|run|eval] [--config config.yaml] [--catalog op_catalog.json] [--ground-truth ground_truth.json] [--hints security_hints.json] [--schema-source endpoint|local|static] [--profile course] [--method ours] [--seed 1] [--seeds 1,2,3] [--budgets 20,40,50,80] [--endpoint URL] [--out DIR] [--budget N]');
}

main().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
});
