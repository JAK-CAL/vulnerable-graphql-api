export type OperationKind = 'query' | 'mutation';

export interface ArgDef {
    name: string;
    type: string;
    namedType: string;
    required: boolean;
}

export interface FieldDef {
    name: string;
    type: string;
    namedType: string;
    isList: boolean;
}

export interface OperationCatalogEntry {
    name: string;
    kind: OperationKind;
    args: ArgDef[];
    returnType: string;
    namedReturnType: string;
    isList: boolean;
    fields: FieldDef[];
    classification: string[];
}

export interface ActorConfig {
    name: string;
    username?: string;
    password?: string;
    anonymous?: boolean;
}

export interface AuthConfig {
    loginOperationName: string;
    loginQuery: string;
    meOperationName: string;
    meQuery: string;
    meResultPath: string[];
}

export interface TestHints {
    auth?: Partial<AuthConfig>;
    actorLoginVariables?: {[actorName: string]: any};
    operationTags?: {[operationName: string]: string[]};
}

export interface SecurityTestConfig {
    endpoint: string;
    outputDir: string;
    requestBudget: number;
    actors: ActorConfig[];
    operationCatalogPath?: string;
    groundTruthPath?: string;
    hintsPath?: string;
    schemaSource: 'endpoint' | 'local' | 'static';
    auth: AuthConfig;
    hints: TestHints;
    seed?: number;
}

export interface GraphQLExecutionResult {
    actor: string;
    operationName: string;
    query: string;
    variables: any;
    status: number;
    data: any;
    errors: any[];
    headers: any;
}

export type AttackType = 'BOLA_READ' | 'BOLA_UPDATE_DELETE' | 'STALE_OBJECT_ACCESS' | 'BFLA_ADMIN_LIKE_OP' | 'BOPLA_SENSITIVE_FIELD_READ';

export interface AttackGene {
    id: string;
    type: AttackType;
    owner: string;
    attacker: string;
    objectType?: string;
    targetResolver?: string;
    setupResolver?: string;
    deleteResolver?: string;
    verifyResolver?: string;
    selectionSet?: string;
    sensitiveField?: string;
    fitness: number;
    fsmState: string;
    capabilities: string[];
}

export interface SequenceStep {
    actor: string;
    operationName: string;
    query: string;
    variables: any;
    purpose: string;
    captures?: CaptureRule[];
}

export interface CaptureRule {
    poolKey: string;
    path: string[];
    ownerActor: string;
    objectType: string;
    lifecycleState: string;
}

export interface ObjectPoolEntry {
    key: string;
    ownerActor: string;
    objectType: string;
    id: string;
    lifecycleState: string;
    sourceResolver: string;
    evidence: any;
}

export interface Finding {
    id: string;
    owaspType: AttackType;
    targetResolver: string;
    objectType: string;
    actorPair: {
        owner: string;
        attacker: string;
    };
    severity: 'low' | 'medium' | 'high';
    evidence: any;
    replaySequence: SequenceStep[];
}

export interface AttackExecutionLog {
    gene: AttackGene;
    sequence: SequenceStep[];
    results: GraphQLExecutionResult[];
    finding?: Finding;
}

export interface EvaluationResult {
    baseline: string;
    seed?: number;
    budget?: number;
    requestsUsed: number;
    requestsToFirstFinding: number | null;
    uniqueFindings: number;
    uniqueVulnerableResolvers: number;
    uniqueVulnerableObjectTypes: number;
    uniqueTargetResolversTested: number;
    uniqueObjectTypesTested: number;
    uniqueOwaspTemplatesExercised: number;
    uniqueActorRolePairsTested: number;
    uniqueExecutablePaths: number;
    validSequenceRatio: number;
    attackReadyRate: number;
    falsePositiveCount: number;
    coveredAttackTypes: string[];
}

export interface GroundTruthEntry {
    owasp: AttackType;
    resolver: string;
    objectType: string;
}

export interface GroundTruth {
    vulnerable: GroundTruthEntry[];
    secure: GroundTruthEntry[];
}

export interface GroundTruthComparison {
    baseline: string;
    truePositiveCount: number;
    falsePositiveCount: number;
    falseNegativeCount: number;
    truePositives: GroundTruthEntry[];
    falsePositives: GroundTruthEntry[];
    falseNegatives: GroundTruthEntry[];
}

export interface BudgetCurveRow {
    method: string;
    budget: number;
    runs: number;
    meanRequestsUsed: number;
    meanRequestsToFirstFinding: number | null;
    detectionRate: number;
    meanUniqueFindings: number;
    meanTruePositives: number;
    meanFalsePositives: number;
    meanFalseNegatives: number;
    precision: number | null;
    recall: number | null;
    f1: number | null;
    meanValidSequenceRatio: number;
    meanAttackReadyRate: number;
}

export interface GenerationLogEntry {
    baseline: string;
    rank: number;
    geneId: string;
    attackType: AttackType;
    targetResolver?: string;
    objectType?: string;
    fitness: number;
    fsmState: string;
    executedSteps: number;
    completed: boolean;
    findingId?: string;
}
