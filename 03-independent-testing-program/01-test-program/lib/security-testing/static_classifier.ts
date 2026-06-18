import {OperationCatalogEntry} from './types';

function hasArg(entry: OperationCatalogEntry, argName: string): boolean {
    return entry.args.some((arg) => arg.name.toLowerCase() === argName.toLowerCase());
}

function hasAnyField(entry: OperationCatalogEntry, names: string[]): boolean {
    const lowered = names.map((name) => name.toLowerCase());
    return entry.fields.some((field) => lowered.indexOf(field.name.toLowerCase()) >= 0);
}

function includesAny(value: string, terms: string[]): boolean {
    const lowered = value.toLowerCase();
    return terms.some((term) => lowered.indexOf(term) >= 0);
}

export function classifyOperation(entry: OperationCatalogEntry): string[] {
    const tags: string[] = [];
    const name = entry.name.toLowerCase();

    if (entry.kind === 'mutation' && includesAny(name, ['login', 'signin', 'authenticate'])) {
        tags.push('login');
    }

    if (entry.kind === 'mutation' && includesAny(name, ['create', 'new', 'add'])) {
        tags.push('create');
    }

    if (entry.kind === 'query' && hasArg(entry, 'id') && !entry.isList) {
        tags.push('read_by_id');
    }

    if (entry.kind === 'mutation' && includesAny(name, ['update', 'edit', 'patch'])) {
        tags.push('update');
    }

    if (entry.kind === 'mutation' && includesAny(name, ['delete', 'remove', 'destroy'])) {
        tags.push('delete');
    }

    if (entry.kind === 'query' && entry.isList) {
        tags.push('list');
    }

    if (includesAny(name, ['admin', 'super', 'secret', 'private', 'internal'])) {
        tags.push('admin_like');
    }

    if (includesAny(name, ['secure', 'safe', 'sanitized'])) {
        tags.push('secure_hint');
    }

    if (includesAny(name, ['public', 'health', 'echo', 'time', 'feed'])) {
        tags.push('decoy_or_public_hint');
    }

    if (hasAnyField(entry, ['password', 'resetToken', 'token', 'secret', 'internalNote', 'moderationNote', 'command', 'stderr', 'stdout'])) {
        tags.push('sensitive_surface');
    }

    if (entry.kind === 'query' && includesAny(name, ['search', 'find'])) {
        tags.push('search');
    }

    if (tags.length === 0) {
        tags.push('unclassified');
    }

    return tags;
}

export function findByTag(catalog: OperationCatalogEntry[], tag: string): OperationCatalogEntry[] {
    return catalog.filter((entry) => entry.classification.indexOf(tag) >= 0);
}

export function sameReturnType(a: OperationCatalogEntry, b: OperationCatalogEntry): boolean {
    return a.namedReturnType === b.namedReturnType;
}
