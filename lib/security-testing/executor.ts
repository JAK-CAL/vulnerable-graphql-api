import axios from 'axios';
import {ActorConfig, GraphQLExecutionResult, SequenceStep, SecurityTestConfig} from './types';
import {ObjectPool} from './object_pool';

interface ActorSession {
    config: ActorConfig;
    cookieHeader: string;
    currentUser: any;
}

function mergeCookies(previous: string, setCookie: any): string {
    const jar: {[key: string]: string} = {};
    if (previous) {
        previous.split(';').forEach((part: string) => {
            const trimmed = part.trim();
            const eq = trimmed.indexOf('=');
            if (eq > 0) {
                jar[trimmed.substring(0, eq)] = trimmed.substring(eq + 1);
            }
        });
    }

    const cookies: string[] = Array.isArray(setCookie) ? setCookie : (setCookie ? [setCookie] : []);
    cookies.forEach((raw: string) => {
        const pair = raw.split(';')[0];
        const eq = pair.indexOf('=');
        if (eq > 0) {
            jar[pair.substring(0, eq)] = pair.substring(eq + 1);
        }
    });

    return Object.keys(jar).map((key: string) => key + '=' + jar[key]).join('; ');
}

export class MultiSessionExecutor {
    private config: SecurityTestConfig;
    private sessions: {[key: string]: ActorSession} = {};
    requestCount = 0;

    constructor(config: SecurityTestConfig) {
        this.config = config;
        config.actors.forEach((actor: ActorConfig) => {
            this.sessions[actor.name] = {
                config: actor,
                cookieHeader: '',
                currentUser: null
            };
        });
    }

    async ensureActor(actorName: string): Promise<void> {
        const actor = this.sessions[actorName];
        if (!actor) {
            throw new Error('Unknown actor: ' + actorName);
        }
        if (actor.currentUser) {
            return;
        }

        if (actor.config.username && actor.config.password) {
            await this.executeRaw(actorName, 'Login', [
                'mutation Login($username: String, $password: String) {',
                '  login(username: $username, password: $password) { id username }',
                '}'
            ].join('\n'), {
                username: actor.config.username,
                password: actor.config.password
            });
        }

        const me = await this.executeRaw(actorName, 'Me', 'query Me { me { id username firstName lastName } }', {});
        if (me.data && me.data.me) {
            actor.currentUser = me.data.me;
        }
    }

    async executeStep(step: SequenceStep, pool: ObjectPool): Promise<GraphQLExecutionResult> {
        if (step.operationName !== 'AuthSession') {
            await this.ensureActor(step.actor);
        }
        const variables = pool.substitutePlaceholders(step.variables);
        const result = await this.executeRaw(step.actor, step.operationName, step.query, variables);
        if (step.operationName === 'AuthSession' && result.data && result.data.me) {
            this.sessions[step.actor].currentUser = result.data.me;
        }
        pool.capture(result, step.captures);
        return result;
    }

    getCurrentUser(actorName: string): any {
        const actor = this.sessions[actorName];
        return actor ? actor.currentUser : null;
    }

    private async executeRaw(actorName: string, operationName: string, query: string, variables: any): Promise<GraphQLExecutionResult> {
        const actor = this.sessions[actorName];
        if (!actor) {
            throw new Error('Unknown actor: ' + actorName);
        }

        this.requestCount += 1;
        const headers: any = {'Content-Type': 'application/json'};
        if (actor.cookieHeader) {
            headers.Cookie = actor.cookieHeader;
        }

        try {
            const response: any = await axios.post(this.config.endpoint, {
                query: query,
                variables: variables
            }, {
                headers: headers,
                validateStatus: () => true
            });

            actor.cookieHeader = mergeCookies(actor.cookieHeader, response.headers ? response.headers['set-cookie'] : null);

            return {
                actor: actorName,
                operationName: operationName,
                query: query,
                variables: variables,
                status: response.status,
                data: response.data ? response.data.data : null,
                errors: response.data && response.data.errors ? response.data.errors : [],
                headers: response.headers
            };
        }
        catch (err) {
            const message = err && err.message ? err.message : String(err);
            return {
                actor: actorName,
                operationName: operationName,
                query: query,
                variables: variables,
                status: 0,
                data: null,
                errors: [{message: message}],
                headers: {}
            };
        }
    }
}
