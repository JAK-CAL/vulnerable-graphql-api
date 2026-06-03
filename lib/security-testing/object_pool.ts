import {CaptureRule, GraphQLExecutionResult, ObjectPoolEntry} from './types';

function readPath(value: any, path: string[]): any {
    let current = value;
    for (let i = 0; i < path.length; i++) {
        if (current === undefined || current === null) {
            return undefined;
        }
        current = current[path[i]];
    }
    return current;
}

export class ObjectPool {
    private entries: ObjectPoolEntry[] = [];

    add(entry: ObjectPoolEntry): void {
        const existing = this.entries.find((item) => item.key === entry.key);
        if (existing) {
            existing.id = entry.id;
            existing.lifecycleState = entry.lifecycleState;
            existing.evidence = entry.evidence;
            existing.sourceResolver = entry.sourceResolver;
            return;
        }
        this.entries.push(entry);
    }

    capture(result: GraphQLExecutionResult, rules?: CaptureRule[]): void {
        if (!rules) {
            return;
        }

        rules.forEach((rule: CaptureRule) => {
            const evidence = readPath(result.data, rule.path);
            if (!evidence || evidence.id === undefined || evidence.id === null) {
                return;
            }

            this.add({
                key: rule.poolKey,
                ownerActor: rule.ownerActor,
                objectType: rule.objectType,
                id: String(evidence.id),
                lifecycleState: rule.lifecycleState,
                sourceResolver: result.operationName,
                evidence: evidence
            });
        });
    }

    find(key: string): ObjectPoolEntry | undefined {
        return this.entries.find((entry) => entry.key === key);
    }

    firstOwnedBy(ownerActor: string, objectType: string): ObjectPoolEntry | undefined {
        return this.entries.find((entry) => entry.ownerActor === ownerActor && entry.objectType === objectType);
    }

    all(): ObjectPoolEntry[] {
        return this.entries.slice(0);
    }

    substitutePlaceholders(value: any): any {
        if (typeof value === 'string') {
            const match = value.match(/^\$\{pool\.([^}]+)\.id\}$/);
            if (match) {
                const entry = this.find(match[1]);
                return entry ? entry.id : value;
            }
            const evidenceMatch = value.match(/^\$\{pool\.(.+)\.evidence\.([^}.]+)\}$/);
            if (evidenceMatch) {
                const entry = this.find(evidenceMatch[1]);
                const evidenceValue = entry && entry.evidence ? entry.evidence[evidenceMatch[2]] : undefined;
                return evidenceValue !== undefined && evidenceValue !== null ? evidenceValue : value;
            }
            return value;
        }

        if (Array.isArray(value)) {
            return value.map((item) => this.substitutePlaceholders(item));
        }

        if (value && typeof value === 'object') {
            const copy: any = {};
            Object.keys(value).forEach((key: string) => {
                copy[key] = this.substitutePlaceholders(value[key]);
            });
            return copy;
        }

        return value;
    }
}
