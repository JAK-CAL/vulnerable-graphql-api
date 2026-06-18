import fs from 'fs';
import path from 'path';
import {URL} from 'url';
import {ActorConfig, AuthConfig, SecurityTestConfig, TestHints} from './types';

function cleanValue(value: string): string {
    const trimmed = value.trim();
    if ((trimmed[0] === '"' && trimmed[trimmed.length - 1] === '"') || (trimmed[0] === '\'' && trimmed[trimmed.length - 1] === '\'')) {
        return trimmed.substring(1, trimmed.length - 1);
    }
    return trimmed;
}

function parseSimpleYaml(filePath: string): Partial<SecurityTestConfig> {
    const content = fs.readFileSync(filePath).toString();
    const partial: Partial<SecurityTestConfig> = {};
    const actors: ActorConfig[] = [];
    let currentActor: ActorConfig | null = null;

    content.split(/\r?\n/).forEach((line: string) => {
        const withoutComment = line.split('#')[0];
        if (!withoutComment.trim()) {
            return;
        }

        const trimmed = withoutComment.trim();
        if (trimmed.indexOf('- name:') === 0) {
            currentActor = {name: cleanValue(trimmed.substring('- name:'.length))};
            actors.push(currentActor);
            return;
        }

        const colon = trimmed.indexOf(':');
        if (colon < 0) {
            return;
        }

        const key = trimmed.substring(0, colon).trim();
        const value = cleanValue(trimmed.substring(colon + 1));

        if (currentActor && (key === 'username' || key === 'password')) {
            if (value) {
                if (key === 'username') {
                    currentActor.username = value;
                }
                else {
                    currentActor.password = value;
                }
            }
            return;
        }

        if (key === 'endpoint') {
            partial.endpoint = value;
        }
        else if (key === 'outputDir') {
            partial.outputDir = value;
        }
        else if (key === 'requestBudget') {
            partial.requestBudget = parseInt(value, 10);
        }
        else if (key === 'operationCatalogPath' || key === 'catalogPath') {
            partial.operationCatalogPath = value;
        }
        else if (key === 'groundTruthPath') {
            partial.groundTruthPath = value;
        }
        else if (key === 'hintsPath') {
            partial.hintsPath = value;
        }
        else if (key === 'schemaSource') {
            partial.schemaSource = value as any;
        }
        else if (key === 'seed') {
            partial.seed = parseInt(value, 10);
        }
    });

    if (actors.length > 0) {
        partial.actors = actors;
    }
    return partial;
}

function withAnonActor(actors: ActorConfig[]): ActorConfig[] {
    const copy = actors.slice(0);
    if (!copy.some((actor) => actor.name === 'ANON')) {
        copy.push({name: 'ANON', anonymous: true});
    }
    return copy;
}

function defaultAuthConfig(): AuthConfig {
    return {
        loginOperationName: 'Login',
        loginQuery: [
            'mutation Login($username: String, $password: String) {',
            '  login(username: $username, password: $password) { id username }',
            '}'
        ].join('\n'),
        meOperationName: 'AuthSession',
        meQuery: 'query AuthSession { me { id username firstName lastName } }',
        meResultPath: ['me']
    };
}

function loadHints(hintsPath?: string): TestHints {
    if (!hintsPath || !fs.existsSync(hintsPath)) {
        return {};
    }
    return JSON.parse(fs.readFileSync(hintsPath).toString());
}

function mergeAuth(base: AuthConfig, override?: Partial<AuthConfig>): AuthConfig {
    return {
        loginOperationName: override && override.loginOperationName ? override.loginOperationName : base.loginOperationName,
        loginQuery: override && override.loginQuery ? override.loginQuery : base.loginQuery,
        meOperationName: override && override.meOperationName ? override.meOperationName : base.meOperationName,
        meQuery: override && override.meQuery ? override.meQuery : base.meQuery,
        meResultPath: override && override.meResultPath ? override.meResultPath : base.meResultPath
    };
}

export function defaultConfig(): SecurityTestConfig {
    const auth = defaultAuthConfig();
    return {
        endpoint: 'http://localhost:3000/graphql',
        outputDir: path.join(process.cwd(), '03-independent-testing-program/03-execution-results/security-results'),
        requestBudget: 20,
        actors: withAnonActor([{name: 'A'}, {name: 'B'}]),
        schemaSource: 'endpoint',
        auth: auth,
        hints: {}
    };
}

function assertLocalhostEndpoint(endpoint: string): void {
    let parsed: URL;
    try {
        parsed = new URL(endpoint);
    }
    catch (_err) {
        throw new Error('Invalid GraphQL endpoint URL: ' + endpoint);
    }

    const hostname = parsed.hostname.toLowerCase();
    const allowedHosts = ['localhost', '127.0.0.1', '::1', '[::1]'];
    if (allowedHosts.indexOf(hostname) < 0) {
        throw new Error('Security regression tests are restricted to localhost endpoints. Refusing endpoint: ' + endpoint);
    }
}

export function loadConfig(configPath?: string): SecurityTestConfig {
    const base = defaultConfig();
    let loaded: Partial<SecurityTestConfig> = {};
    const resolved = configPath || path.join(process.cwd(), '03-independent-testing-program/02-other-server-config/config.yaml');

    if (fs.existsSync(resolved)) {
        loaded = parseSimpleYaml(resolved);
    }

    const config: SecurityTestConfig = {
        endpoint: loaded.endpoint || base.endpoint,
        outputDir: loaded.outputDir ? path.resolve(process.cwd(), loaded.outputDir) : base.outputDir,
        requestBudget: loaded.requestBudget || base.requestBudget,
        actors: withAnonActor(loaded.actors || base.actors),
        operationCatalogPath: loaded.operationCatalogPath ? path.resolve(process.cwd(), loaded.operationCatalogPath) : undefined,
        groundTruthPath: loaded.groundTruthPath ? path.resolve(process.cwd(), loaded.groundTruthPath) : undefined,
        hintsPath: loaded.hintsPath ? path.resolve(process.cwd(), loaded.hintsPath) : undefined,
        schemaSource: loaded.schemaSource || base.schemaSource,
        auth: base.auth,
        hints: {},
        seed: loaded.seed
    };
    config.hints = loadHints(config.hintsPath);
    config.auth = mergeAuth(base.auth, config.hints.auth);
    assertLocalhostEndpoint(config.endpoint);
    return config;
}

export function applyCliOverrides(config: SecurityTestConfig, args: string[]): SecurityTestConfig {
    const copy: SecurityTestConfig = {
        endpoint: config.endpoint,
        outputDir: config.outputDir,
        requestBudget: config.requestBudget,
        actors: config.actors,
        operationCatalogPath: config.operationCatalogPath,
        groundTruthPath: config.groundTruthPath,
        hintsPath: config.hintsPath,
        schemaSource: config.schemaSource,
        auth: config.auth,
        hints: config.hints,
        seed: config.seed
    };

    args.forEach((arg: string, index: number) => {
        if (arg === '--endpoint' && args[index + 1]) {
            copy.endpoint = args[index + 1];
        }
        else if (arg === '--out' && args[index + 1]) {
            copy.outputDir = path.resolve(process.cwd(), args[index + 1]);
        }
        else if (arg === '--budget' && args[index + 1]) {
            copy.requestBudget = parseInt(args[index + 1], 10);
        }
        else if (arg === '--catalog' && args[index + 1]) {
            copy.operationCatalogPath = path.resolve(process.cwd(), args[index + 1]);
        }
        else if (arg === '--ground-truth' && args[index + 1]) {
            copy.groundTruthPath = path.resolve(process.cwd(), args[index + 1]);
        }
        else if (arg === '--hints' && args[index + 1]) {
            copy.hintsPath = path.resolve(process.cwd(), args[index + 1]);
            copy.hints = loadHints(copy.hintsPath);
            copy.auth = mergeAuth(defaultAuthConfig(), copy.hints.auth);
        }
        else if (arg === '--schema-source' && args[index + 1]) {
            copy.schemaSource = args[index + 1] as any;
        }
        else if (arg === '--seed' && args[index + 1]) {
            copy.seed = parseInt(args[index + 1], 10);
        }
    });

    assertLocalhostEndpoint(copy.endpoint);
    return copy;
}

export function configPathFromArgs(args: string[]): string | undefined {
    const index = args.indexOf('--config');
    if (index >= 0 && args[index + 1]) {
        return args[index + 1];
    }
    return undefined;
}
