import fs from 'fs';
import path from 'path';
import {
    AttackExecutionLog,
    BudgetCurveRow,
    EvaluationResult,
    Finding,
    GenerationLogEntry,
    GroundTruth,
    GroundTruthComparison,
    GroundTruthEntry,
    OperationCatalogEntry,
    SecurityTestConfig
} from './types';
import {ObjectPool} from './object_pool';
import {baseMethodName} from './experiment';

function ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
}

function writeJson(filePath: string, value: any): void {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function entryKey(entry: GroundTruthEntry): string {
    return entry.owasp + ':' + entry.resolver + ':' + entry.objectType;
}

function findingEntry(finding: Finding): GroundTruthEntry {
    return {
        owasp: finding.owaspType,
        resolver: finding.targetResolver,
        objectType: finding.objectType
    };
}

function uniqueEntries(entries: GroundTruthEntry[]): GroundTruthEntry[] {
    const seen: string[] = [];
    const unique: GroundTruthEntry[] = [];
    entries.forEach((entry: GroundTruthEntry) => {
        const key = entryKey(entry);
        if (seen.indexOf(key) < 0) {
            seen.push(key);
            unique.push(entry);
        }
    });
    return unique;
}

function defaultGroundTruth(): GroundTruth {
    return {
        vulnerable: [
            {owasp: 'BOLA_READ', resolver: 'post', objectType: 'Post'},
            {owasp: 'BOLA_READ', resolver: 'comment', objectType: 'Comment'},
            {owasp: 'BOLA_UPDATE_DELETE', resolver: 'updatePost', objectType: 'Post'},
            {owasp: 'BOLA_UPDATE_DELETE', resolver: 'deletePost', objectType: 'Post'},
            {owasp: 'BOLA_UPDATE_DELETE', resolver: 'updateComment', objectType: 'Comment'},
            {owasp: 'BOLA_UPDATE_DELETE', resolver: 'deleteComment', objectType: 'Comment'},
            {owasp: 'STALE_OBJECT_ACCESS', resolver: 'post', objectType: 'Post'},
            {owasp: 'STALE_OBJECT_ACCESS', resolver: 'comment', objectType: 'Comment'},
            {owasp: 'BFLA_ADMIN_LIKE_OP', resolver: 'adminUsers', objectType: 'User'},
            {owasp: 'BFLA_ADMIN_LIKE_OP', resolver: 'superSecretPrivateMutation', objectType: 'CommandOutput'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'me', objectType: 'User'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'user', objectType: 'User'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'allUsers', objectType: 'User'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'adminUsers', objectType: 'User'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'register', objectType: 'User'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'passwordReset', objectType: 'User'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'post', objectType: 'Post'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'search', objectType: 'Post'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'createPost', objectType: 'Post'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'updatePost', objectType: 'Post'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'deletePost', objectType: 'Post'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'comment', objectType: 'Comment'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'allComments', objectType: 'Comment'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'createComment', objectType: 'Comment'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'updateComment', objectType: 'Comment'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'deleteComment', objectType: 'Comment'}
        ],
        secure: [
            {owasp: 'BOLA_READ', resolver: 'securePost', objectType: 'Post'},
            {owasp: 'BOLA_READ', resolver: 'secureComment', objectType: 'Comment'},
            {owasp: 'BOLA_UPDATE_DELETE', resolver: 'secureUpdatePost', objectType: 'Post'},
            {owasp: 'BOLA_UPDATE_DELETE', resolver: 'secureDeletePost', objectType: 'Post'},
            {owasp: 'BOLA_UPDATE_DELETE', resolver: 'secureUpdateComment', objectType: 'Comment'},
            {owasp: 'BOLA_UPDATE_DELETE', resolver: 'secureDeleteComment', objectType: 'Comment'},
            {owasp: 'BFLA_ADMIN_LIKE_OP', resolver: 'internalStats', objectType: 'InternalStats'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'securePost', objectType: 'Post'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'publicPosts', objectType: 'Post'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'secureSearch', objectType: 'Post'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'secureUpdatePost', objectType: 'Post'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'secureDeletePost', objectType: 'Post'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'secureComment', objectType: 'Comment'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'publicComments', objectType: 'Comment'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'secureUpdateComment', objectType: 'Comment'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'secureDeleteComment', objectType: 'Comment'},
            {owasp: 'BOPLA_SENSITIVE_FIELD_READ', resolver: 'internalStats', objectType: 'InternalStats'}
        ]
    };
}

function formatNullableNumber(value: number | null): string {
    return value === null ? 'n/a' : String(value);
}

function formatRate(value: number): string {
    return (Math.round(value * 1000) / 10).toFixed(1) + '%';
}

function comparisonFor(baseline: string, comparisons: GroundTruthComparison[]): GroundTruthComparison | undefined {
    return comparisons.filter((item) => item.baseline === baseline)[0];
}

function mean(values: number[]): number {
    if (values.length === 0) {
        return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function ratio(numerator: number, denominator: number): number | null {
    if (denominator === 0) {
        return null;
    }
    return round2(numerator / denominator);
}

function formatOptionalNumber(value: number | null): string {
    return value === null ? 'n/a' : String(value);
}

function formatOptionalRate(value: number | null): string {
    return value === null ? 'n/a' : formatRate(value);
}

function aggregateBudgetCurve(evaluations: EvaluationResult[], comparisons: GroundTruthComparison[]): BudgetCurveRow[] {
    const groups: {[key: string]: {method: string; budget: number; rows: {evaluation: EvaluationResult; comparison?: GroundTruthComparison}[]}} = {};
    evaluations.forEach((evaluation: EvaluationResult) => {
        const method = baseMethodName(evaluation.baseline);
        const budget = evaluation.budget || 0;
        const key = method + ':' + budget;
        if (!groups[key]) {
            groups[key] = {
                method: method,
                budget: budget,
                rows: []
            };
        }
        groups[key].rows.push({
            evaluation: evaluation,
            comparison: comparisonFor(evaluation.baseline, comparisons)
        });
    });

    return Object.keys(groups).map((key: string) => {
        const group = groups[key];
        const rows = group.rows;
        const firstFindingValues = rows
            .map((row) => row.evaluation.requestsToFirstFinding)
            .filter((value): value is number => value !== null);
        const meanTp = round2(mean(rows.map((row) => row.comparison ? row.comparison.truePositiveCount : 0)));
        const meanFp = round2(mean(rows.map((row) => row.comparison ? row.comparison.falsePositiveCount : 0)));
        const meanFn = round2(mean(rows.map((row) => row.comparison ? row.comparison.falseNegativeCount : 0)));
        const precision = ratio(meanTp, meanTp + meanFp);
        const recall = ratio(meanTp, meanTp + meanFn);
        const f1 = precision === null || recall === null || precision + recall === 0 ? null : round2(2 * precision * recall / (precision + recall));
        return {
            method: group.method,
            budget: group.budget,
            runs: rows.length,
            meanRequestsUsed: round2(mean(rows.map((row) => row.evaluation.requestsUsed))),
            meanRequestsToFirstFinding: firstFindingValues.length === 0 ? null : round2(mean(firstFindingValues)),
            detectionRate: round2(firstFindingValues.length / rows.length),
            meanUniqueFindings: round2(mean(rows.map((row) => row.evaluation.uniqueFindings))),
            meanTruePositives: meanTp,
            meanFalsePositives: meanFp,
            meanFalseNegatives: meanFn,
            precision: precision,
            recall: recall,
            f1: f1,
            meanValidSequenceRatio: round2(mean(rows.map((row) => row.evaluation.validSequenceRatio))),
            meanAttackReadyRate: round2(mean(rows.map((row) => row.evaluation.attackReadyRate)))
        };
    }).sort((a, b) => {
        if (a.budget !== b.budget) {
            return a.budget - b.budget;
        }
        return a.method.localeCompare(b.method);
    });
}

function feedbackMarkdown(evaluations: EvaluationResult[], comparisons: GroundTruthComparison[]): string {
    const lines: string[] = [];
    const curve = aggregateBudgetCurve(evaluations, comparisons);
    lines.push('# GraphQL Security Regression Feedback');
    lines.push('');
    lines.push('## 안전한 범위');
    lines.push('');
    lines.push('이 harness는 local/owned vulnerable GraphQL lab에 대한 authorization regression check로 해석해야 한다. 외부 endpoint 스캔, credential attack, stealth, persistence, bypass, data exfiltration은 scope 밖이다.');
    lines.push('');
    lines.push('## Baseline 요약');
    lines.push('');
    lines.push('| Method | Budget | Requests | First Finding | Unique Findings | TP | FP | FN | Templates | Valid Seq | Attack-ready |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    evaluations.forEach((evaluation: EvaluationResult) => {
        const comparison = comparisonFor(evaluation.baseline, comparisons);
        lines.push([
            '| ' + evaluation.baseline,
            evaluation.budget !== undefined ? String(evaluation.budget) : 'n/a',
            String(evaluation.requestsUsed),
            formatNullableNumber(evaluation.requestsToFirstFinding),
            String(evaluation.uniqueFindings),
            comparison ? String(comparison.truePositiveCount) : 'n/a',
            comparison ? String(comparison.falsePositiveCount) : 'n/a',
            comparison ? String(comparison.falseNegativeCount) : 'n/a',
            String(evaluation.uniqueOwaspTemplatesExercised),
            formatRate(evaluation.validSequenceRatio),
            formatRate(evaluation.attackReadyRate) + ' |'
        ].join(' | '));
    });
    lines.push('');
    if (curve.some((row) => row.runs > 1) || curve.length < evaluations.length) {
        lines.push('## Seed 평균 / Budget Curve');
        lines.push('');
        lines.push('| Method | Budget | Runs | Mean TP | Mean FP | Mean FN | Precision | Recall | F1 | Mean First |');
        lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
        curve.forEach((row) => {
            lines.push([
                '| ' + row.method,
                String(row.budget),
                String(row.runs),
                String(row.meanTruePositives),
                String(row.meanFalsePositives),
            String(row.meanFalseNegatives),
            formatOptionalRate(row.precision),
            formatOptionalRate(row.recall),
            formatOptionalRate(row.f1),
            (row.meanRequestsToFirstFinding === null ? 'n/a' : String(row.meanRequestsToFirstFinding)) + ' |'
        ].join(' | '));
        });
        lines.push('');
    }
    lines.push('## 해석');
    lines.push('');
    lines.push('- `requests-to-first-finding`, `unique true findings`, `unique vulnerable resolvers/object types`, `OWASP templates covered`, `FP/FN`을 primary metric으로 본다.');
    lines.push('- `valid sequence ratio`, `attack-ready rate`, `unique executable paths`는 harness 내부 품질을 설명하는 secondary metric이다.');
    lines.push('- `pure-random-schema`는 schema operation만 보고 raw 요청을 만든다. authorization template, dependency/FSM, object-pool guidance가 없으므로 낮은 valid-sequence ratio가 정상적인 baseline signal이다.');
    lines.push('- `dependency-only`는 input/output dependency와 object pool만 사용한다. OWASP template 없이 실행 가능성만 높인 비교군이다.');
    lines.push('- `template-only`, `random-attack-gene`, `ga-without-fsm`, `ours`는 같은 predefined AttackGene 후보군을 서로 다른 ordering policy로 평가한다.');
    lines.push('- `securePost`, `secureComment`, `secureUpdate*`, `secureDelete*`, `public*`, `internalStats`는 secure/public/decoy ground-truth 항목이다. FP가 0이면 harness가 secure resolver를 취약점으로 과대보고하지 않았다는 신호다.');
    lines.push('- finding 수가 같거나 비슷하면 “GA가 항상 빠르다”라고 주장하지 않는다. 대신 제한된 request budget에서 security-relevant surface에 budget을 어떻게 배분했는지 비교한다.');
    lines.push('');
    lines.push('## 안전한 Claim');
    lines.push('');
    lines.push('현재 구현은 local vulnerable GraphQL lab에서 schema-only, dependency-only, template-only, random AttackGene, GA-without-FSM, FSM-guided GA-style prioritization을 같은 budget/seed 조건으로 비교하고, 실행 결과를 JSON report와 ground-truth comparison으로 남기는 end-to-end regression testing MVP다.');
    lines.push('');
    lines.push('## 피해야 할 Claim');
    lines.push('');
    lines.push('현재 결과만으로 “FSM-guided GA가 random보다 항상 빠르다”거나 “실제 서비스 exploit에 바로 적용 가능하다”고 말하면 안 된다.');
    lines.push('');
    return lines.join('\n');
}

function bestRowsByBudget(curve: BudgetCurveRow[]): BudgetCurveRow[] {
    const byBudget: {[budget: string]: BudgetCurveRow[]} = {};
    curve.forEach((row) => {
        const key = String(row.budget);
        if (!byBudget[key]) {
            byBudget[key] = [];
        }
        byBudget[key].push(row);
    });
    return Object.keys(byBudget).sort((a, b) => Number(a) - Number(b)).map((budget) => {
        return byBudget[budget].slice(0).sort((a, b) => {
            if (b.meanTruePositives !== a.meanTruePositives) {
                return b.meanTruePositives - a.meanTruePositives;
            }
            const aFirst = a.meanRequestsToFirstFinding === null ? Number.MAX_SAFE_INTEGER : a.meanRequestsToFirstFinding;
            const bFirst = b.meanRequestsToFirstFinding === null ? Number.MAX_SAFE_INTEGER : b.meanRequestsToFirstFinding;
            return aFirst - bFirst;
        })[0];
    });
}

function runReportMarkdown(evaluations: EvaluationResult[], comparisons: GroundTruthComparison[], groundTruth: GroundTruth): string {
    const curve = aggregateBudgetCurve(evaluations, comparisons);
    const bestRows = bestRowsByBudget(curve);
    const lines: string[] = [];
    lines.push('# GraphQL Authorization Regression Testing Report');
    lines.push('');
    lines.push('## Project Goal');
    lines.push('');
    lines.push('이 프로젝트는 owned local vulnerable GraphQL lab에 대해 authorization regression tests를 자동 생성/실행하고, baseline ordering과 GA-style prioritization을 비교하는 automated testing harness다.');
    lines.push('');
    lines.push('## Experiment Design');
    lines.push('');
    lines.push('- Scope: localhost-only lab server');
    lines.push('- Vulnerable ground-truth entries: ' + groundTruth.vulnerable.length);
    lines.push('- Secure/decoy ground-truth entries: ' + groundTruth.secure.length);
    lines.push('- Evaluated runs: ' + evaluations.length);
    lines.push('- Primary metrics: TP, FP, FN, precision, recall, F1, requests-to-first-finding');
    lines.push('- Secondary metrics: valid sequence ratio, attack-ready rate, executable paths');
    lines.push('');
    lines.push('## Budget Curve Summary');
    lines.push('');
    lines.push('| Budget | Best Method | Mean TP | Mean FP | Mean FN | F1 | Mean First |');
    lines.push('| ---: | --- | ---: | ---: | ---: | ---: | ---: |');
    bestRows.forEach((row) => {
        lines.push([
            '| ' + row.budget,
            row.method,
            String(row.meanTruePositives),
            String(row.meanFalsePositives),
            String(row.meanFalseNegatives),
            formatOptionalNumber(row.f1),
            (row.meanRequestsToFirstFinding === null ? 'n/a' : String(row.meanRequestsToFirstFinding)) + ' |'
        ].join(' | '));
    });
    lines.push('');
    lines.push('## Full Aggregated Results');
    lines.push('');
    lines.push('| Method | Budget | Runs | Mean TP | Mean FP | Mean FN | Precision | Recall | F1 | Mean First |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    curve.forEach((row) => {
        lines.push([
            '| ' + row.method,
            String(row.budget),
            String(row.runs),
            String(row.meanTruePositives),
            String(row.meanFalsePositives),
            String(row.meanFalseNegatives),
            formatOptionalRate(row.precision),
            formatOptionalRate(row.recall),
            formatOptionalRate(row.f1),
            (row.meanRequestsToFirstFinding === null ? 'n/a' : String(row.meanRequestsToFirstFinding)) + ' |'
        ].join(' | '));
    });
    lines.push('');
    lines.push('## Interpretation');
    lines.push('');
    lines.push('- 낮은 budget에서는 ordering 자체가 테스트 효과를 결정한다. 후보군 전체를 실행하는 큰 budget보다 budget curve가 프로젝트 주장을 더 잘 보여준다.');
    lines.push('- secure/public/decoy resolver가 포함되어 FP를 함께 평가한다. FP가 0이면 안전한 resolver를 취약점으로 과대보고하지 않았다는 근거가 된다.');
    lines.push('- 결과는 local lab regression testing에 대한 것이며, 외부 시스템 테스트나 실제 공격 성능을 주장하지 않는다.');
    lines.push('');
    return lines.join('\n');
}

export class Reporter {
    private config: SecurityTestConfig;

    constructor(config: SecurityTestConfig) {
        this.config = config;
        ensureDir(config.outputDir);
    }

    writeCatalog(catalog: OperationCatalogEntry[]): string {
        const filePath = path.join(this.config.outputDir, 'op_catalog.json');
        writeJson(filePath, {
            generatedAt: new Date().toISOString(),
            endpoint: this.config.endpoint,
            operations: catalog
        });
        return filePath;
    }

    writeObjectPool(pool: ObjectPool): string {
        const filePath = path.join(this.config.outputDir, 'object_pool.json');
        writeJson(filePath, {
            generatedAt: new Date().toISOString(),
            objects: pool.all()
        });
        return filePath;
    }

    writeAttackLog(logs: AttackExecutionLog[]): string {
        const filePath = path.join(this.config.outputDir, 'attack_execution_log.json');
        writeJson(filePath, {
            generatedAt: new Date().toISOString(),
            executions: logs
        });
        return filePath;
    }

    writeFindings(findings: Finding[]): string {
        const filePath = path.join(this.config.outputDir, 'findings.json');
        writeJson(filePath, {
            generatedAt: new Date().toISOString(),
            findings: findings
        });
        return filePath;
    }

    writeEvaluation(results: EvaluationResult[]): string {
        const filePath = path.join(this.config.outputDir, 'evaluation_result.json');
        writeJson(filePath, {
            generatedAt: new Date().toISOString(),
            metrics: results
        });
        return filePath;
    }

    writeBudgetCurve(evaluations: EvaluationResult[], comparisons: GroundTruthComparison[]): string {
        const filePath = path.join(this.config.outputDir, 'budget_curve.json');
        writeJson(filePath, {
            generatedAt: new Date().toISOString(),
            note: 'Aggregated by base method and budget. Means are computed across seeds/runs.',
            curve: aggregateBudgetCurve(evaluations, comparisons)
        });
        return filePath;
    }

    writeRunReport(evaluations: EvaluationResult[], comparisons: GroundTruthComparison[], groundTruth: GroundTruth): string {
        const filePath = path.join(this.config.outputDir, 'run_report.md');
        fs.writeFileSync(filePath, runReportMarkdown(evaluations, comparisons, groundTruth));
        return filePath;
    }

    loadGroundTruth(): GroundTruth {
        if (this.config.groundTruthPath && fs.existsSync(this.config.groundTruthPath)) {
            const raw = JSON.parse(fs.readFileSync(this.config.groundTruthPath).toString());
            return {
                vulnerable: raw.vulnerable || [],
                secure: raw.secure || []
            };
        }
        return defaultGroundTruth();
    }

    compareFindingsWithGroundTruth(baseline: string, findings: Finding[], groundTruth: GroundTruth): GroundTruthComparison {
        const found = uniqueEntries(findings.map(findingEntry));
        const vulnerableKeys = groundTruth.vulnerable.map(entryKey);
        const secureKeys = groundTruth.secure.map(entryKey);
        const foundKeys = found.map(entryKey);

        const truePositives = found.filter((entry: GroundTruthEntry) => vulnerableKeys.indexOf(entryKey(entry)) >= 0);
        const falsePositives = found.filter((entry: GroundTruthEntry) => {
            const key = entryKey(entry);
            return vulnerableKeys.indexOf(key) < 0 || secureKeys.indexOf(key) >= 0;
        });
        const falseNegatives = groundTruth.vulnerable.filter((entry: GroundTruthEntry) => foundKeys.indexOf(entryKey(entry)) < 0);

        return {
            baseline: baseline,
            truePositiveCount: truePositives.length,
            falsePositiveCount: falsePositives.length,
            falseNegativeCount: falseNegatives.length,
            truePositives: truePositives,
            falsePositives: falsePositives,
            falseNegatives: falseNegatives
        };
    }

    writeGroundTruthComparison(comparisons: GroundTruthComparison[]): string {
        const filePath = path.join(this.config.outputDir, 'ground_truth_comparison.json');
        writeJson(filePath, {
            generatedAt: new Date().toISOString(),
            groundTruthSource: this.config.groundTruthPath || 'default vulnerable-graphql-api lab ground truth',
            comparisons: comparisons
        });
        return filePath;
    }

    writeGenerationLog(entries: GenerationLogEntry[]): string {
        const filePath = path.join(this.config.outputDir, 'generation_log.json');
        writeJson(filePath, {
            generatedAt: new Date().toISOString(),
            note: 'Deterministic candidate ordering and execution log. GA entries represent prioritized AttackGene candidates for this MVP.',
            entries: entries
        });
        return filePath;
    }

    writeFeedback(evaluations: EvaluationResult[], comparisons: GroundTruthComparison[]): string {
        const filePath = path.join(this.config.outputDir, 'feedback.md');
        fs.writeFileSync(filePath, feedbackMarkdown(evaluations, comparisons));
        return filePath;
    }
}
