import {
    buildClientSchema,
    GraphQLArgument,
    GraphQLField,
    GraphQLList,
    GraphQLNamedType,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLType,
    getIntrospectionQuery,
    isObjectType
} from 'graphql';
import axios from 'axios';
import fs from 'fs';

import {classifyOperation} from './static_classifier';
import {ArgDef, FieldDef, OperationCatalogEntry, OperationKind, SecurityTestConfig, TestHints} from './types';

function unwrapType(type: GraphQLType): { printable: string, namedType: string, required: boolean, isList: boolean } {
    let current: GraphQLType = type;
    let required = false;
    let isList = false;

    if (current instanceof GraphQLNonNull) {
        required = true;
        current = current.ofType;
    }

    if (current instanceof GraphQLList) {
        isList = true;
        current = current.ofType;
        if (current instanceof GraphQLNonNull) {
            current = current.ofType;
        }
    }

    let named = current as GraphQLNamedType;
    return {
        printable: type.toString(),
        namedType: named.name,
        required: required,
        isList: isList
    };
}

function describeArgs(args: GraphQLArgument[]): ArgDef[] {
    return args.map((arg: GraphQLArgument) => {
        const unwrapped = unwrapType(arg.type);
        return {
            name: arg.name,
            type: unwrapped.printable,
            namedType: unwrapped.namedType,
            required: unwrapped.required
        };
    });
}

function describeReturnFields(localSchema: any, typeName: string): FieldDef[] {
    const type = localSchema.getType(typeName);
    if (!type || !isObjectType(type)) {
        return [];
    }

    const fields = (type as GraphQLObjectType).getFields();
    return Object.keys(fields).map((fieldName: string) => {
        const field = fields[fieldName];
        const unwrapped = unwrapType(field.type);
        return {
            name: fieldName,
            type: unwrapped.printable,
            namedType: unwrapped.namedType,
            isList: unwrapped.isList
        };
    });
}

function describeOperation(localSchema: any, kind: OperationKind, fieldName: string, field: GraphQLField<any, any>): OperationCatalogEntry {
    const returnType = unwrapType(field.type);
    const entry: OperationCatalogEntry = {
        name: fieldName,
        kind: kind,
        args: describeArgs(field.args),
        returnType: returnType.printable,
        namedReturnType: returnType.namedType,
        isList: returnType.isList,
        fields: describeReturnFields(localSchema, returnType.namedType),
        classification: []
    };
    entry.classification = classifyOperation(entry);
    return entry;
}

function applyHints(catalog: OperationCatalogEntry[], hints: TestHints): OperationCatalogEntry[] {
    const operationTags = hints.operationTags || {};
    const hintedSensitiveFields = (hints.sensitiveFields || []).map((field) => field.toLowerCase());
    return catalog.map((entry) => {
        const hinted = operationTags[entry.name] || [];
        hinted.forEach((tag) => {
            if (entry.classification.indexOf(tag) < 0) {
                entry.classification.push(tag);
            }
        });
        const hasHintedSensitiveField = entry.fields.some((field) => hintedSensitiveFields.indexOf(field.name.toLowerCase()) >= 0);
        if (hasHintedSensitiveField && entry.classification.indexOf('sensitive_surface') < 0) {
            entry.classification.push('sensitive_surface');
        }
        return entry;
    });
}

function loadCatalogFile(catalogPath: string, hints: TestHints): OperationCatalogEntry[] {
    const raw = JSON.parse(fs.readFileSync(catalogPath).toString());
    const operations = Array.isArray(raw) ? raw : raw.operations;
    if (!Array.isArray(operations)) {
        throw new Error('Operation catalog must be an array or an object with an operations array: ' + catalogPath);
    }

    return applyHints(operations.map((entry: OperationCatalogEntry) => {
        const copy: OperationCatalogEntry = {
            name: entry.name,
            kind: entry.kind,
            args: entry.args || [],
            returnType: entry.returnType,
            namedReturnType: entry.namedReturnType,
            isList: !!entry.isList,
            fields: entry.fields || [],
            classification: entry.classification || []
        };
        if (copy.classification.length === 0) {
            copy.classification = classifyOperation(copy);
        }
        return copy;
    }), hints);
}

function catalogFromSchema(localSchema: any, hints: TestHints): OperationCatalogEntry[] {
    const catalog: OperationCatalogEntry[] = [];
    const queryType = localSchema.getQueryType();
    const mutationType = localSchema.getMutationType();

    if (queryType) {
        const fields = queryType.getFields();
        Object.keys(fields).forEach((fieldName: string) => {
            catalog.push(describeOperation(localSchema, 'query', fieldName, fields[fieldName]));
        });
    }

    if (mutationType) {
        const fields = mutationType.getFields();
        Object.keys(fields).forEach((fieldName: string) => {
            catalog.push(describeOperation(localSchema, 'mutation', fieldName, fields[fieldName]));
        });
    }

    return applyHints(catalog, hints);
}

async function loadEndpointCatalog(config: SecurityTestConfig): Promise<OperationCatalogEntry[]> {
    const response: any = await axios.post(config.endpoint, {
        query: getIntrospectionQuery()
    }, {
        headers: {'Content-Type': 'application/json'},
        validateStatus: () => true
    });

    if (response.status >= 400 || !response.data || response.data.errors || !response.data.data) {
        throw new Error('GraphQL introspection failed for endpoint ' + config.endpoint + '. Provide --catalog or set --schema-source local/static for this lab.');
    }

    const schema = buildClientSchema(response.data.data);
    return catalogFromSchema(schema, config.hints);
}

export async function loadOperationCatalog(config: SecurityTestConfig): Promise<OperationCatalogEntry[]> {
    if (config.operationCatalogPath) {
        return loadCatalogFile(config.operationCatalogPath, config.hints);
    }

    if (config.schemaSource === 'endpoint') {
        return loadEndpointCatalog(config);
    }

    if (config.schemaSource === 'local') {
        const localSchema = require('../../../../01-test-target-graphql-server/01-server/lib/gql/schema').schema;
        return catalogFromSchema(localSchema, config.hints);
    }

    return applyHints(loadStaticVulnerableApiCatalog(), config.hints);
}

function field(name: string, type: string, namedType: string, isList: boolean): FieldDef {
    return {name: name, type: type, namedType: namedType, isList: isList};
}

function arg(name: string, type: string, namedType: string, required: boolean): ArgDef {
    return {name: name, type: type, namedType: namedType, required: required};
}

function staticEntry(kind: OperationKind, name: string, args: ArgDef[], returnType: string, namedReturnType: string, isList: boolean, fields: FieldDef[]): OperationCatalogEntry {
    const entry: OperationCatalogEntry = {
        name: name,
        kind: kind,
        args: args,
        returnType: returnType,
        namedReturnType: namedReturnType,
        isList: isList,
        fields: fields,
        classification: []
    };
    entry.classification = classifyOperation(entry);
    return entry;
}

function loadStaticVulnerableApiCatalog(): OperationCatalogEntry[] {
    const userFields = [
        field('id', 'ID', 'ID', false),
        field('username', 'String', 'String', false),
        field('firstName', 'String', 'String', false),
        field('lastName', 'String', 'String', false),
        field('resetToken', 'String', 'String', false),
        field('posts', '[Post]', 'Post', true)
    ];
    const postFields = [
        field('id', 'ID', 'ID', false),
        field('title', 'String', 'String', false),
        field('content', 'String', 'String', false),
        field('public', 'Boolean', 'Boolean', false),
        field('deleted', 'Boolean', 'Boolean', false),
        field('internalNote', 'String', 'String', false),
        field('author', 'User', 'User', false)
    ];
    const commentFields = [
        field('id', 'ID', 'ID', false),
        field('body', 'String', 'String', false),
        field('public', 'Boolean', 'Boolean', false),
        field('deleted', 'Boolean', 'Boolean', false),
        field('moderationNote', 'String', 'String', false),
        field('author', 'User', 'User', false)
    ];
    const commandOutputFields = [
        field('stdout', 'String', 'String', false),
        field('stderr', 'String', 'String', false)
    ];
    const internalStatsFields = [
        field('id', 'ID', 'ID', false),
        field('summary', 'String', 'String', false),
        field('internalNote', 'String', 'String', false)
    ];

    return [
        staticEntry('query', 'me', [], 'User', 'User', false, userFields),
        staticEntry('query', 'allUsers', [], '[User]', 'User', true, userFields),
        staticEntry('query', 'user', [arg('id', 'ID', 'ID', false)], 'User', 'User', false, userFields),
        staticEntry('query', 'post', [arg('id', 'ID', 'ID', false)], 'Post', 'Post', false, postFields),
        staticEntry('query', 'securePost', [arg('id', 'ID', 'ID', false)], 'Post', 'Post', false, postFields),
        staticEntry('query', 'publicPosts', [], '[Post]', 'Post', true, postFields),
        staticEntry('query', 'search', [arg('query', 'String', 'String', false)], '[Post]', 'Post', true, postFields),
        staticEntry('query', 'secureSearch', [arg('query', 'String', 'String', false)], '[Post]', 'Post', true, postFields),
        staticEntry('query', 'comment', [arg('id', 'ID', 'ID', false)], 'Comment', 'Comment', false, commentFields),
        staticEntry('query', 'secureComment', [arg('id', 'ID', 'ID', false)], 'Comment', 'Comment', false, commentFields),
        staticEntry('query', 'allComments', [], '[Comment]', 'Comment', true, commentFields),
        staticEntry('query', 'publicComments', [], '[Comment]', 'Comment', true, commentFields),
        staticEntry('query', 'adminUsers', [], '[User]', 'User', true, userFields),
        staticEntry('query', 'internalStats', [], 'InternalStats', 'InternalStats', false, internalStatsFields),
        staticEntry('query', 'health', [], 'String', 'String', false, []),
        staticEntry('query', 'publicFeed', [], 'String', 'String', false, []),
        staticEntry('query', 'serverTime', [], 'String', 'String', false, []),
        staticEntry('query', 'echo', [arg('message', 'String', 'String', false)], 'String', 'String', false, []),
        staticEntry('query', 'getAsset', [arg('name', 'String', 'String', false)], 'String', 'String', false, []),
        staticEntry('mutation', 'register', [
            arg('username', 'String', 'String', false),
            arg('password', 'String', 'String', false),
            arg('firstName', 'String', 'String', false),
            arg('lastName', 'String', 'String', false)
        ], 'User', 'User', false, userFields),
        staticEntry('mutation', 'login', [
            arg('username', 'String', 'String', false),
            arg('password', 'String', 'String', false)
        ], 'User', 'User', false, userFields),
        staticEntry('mutation', 'passwordReset', [arg('input', 'JSON', 'JSON', false)], 'User', 'User', false, userFields),
        staticEntry('mutation', 'createPost', [
            arg('title', 'String', 'String', false),
            arg('content', 'String', 'String', false),
            arg('public', 'Boolean', 'Boolean', false)
        ], 'Post', 'Post', false, postFields),
        staticEntry('mutation', 'updatePost', [
            arg('id', 'ID', 'ID', false),
            arg('title', 'String', 'String', false),
            arg('content', 'String', 'String', false),
            arg('public', 'Boolean', 'Boolean', false)
        ], 'Post', 'Post', false, postFields),
        staticEntry('mutation', 'deletePost', [arg('id', 'ID', 'ID', false)], 'Post', 'Post', false, postFields),
        staticEntry('mutation', 'secureUpdatePost', [
            arg('id', 'ID', 'ID', false),
            arg('title', 'String', 'String', false),
            arg('content', 'String', 'String', false),
            arg('public', 'Boolean', 'Boolean', false)
        ], 'Post', 'Post', false, postFields),
        staticEntry('mutation', 'secureDeletePost', [arg('id', 'ID', 'ID', false)], 'Post', 'Post', false, postFields),
        staticEntry('mutation', 'createComment', [
            arg('postId', 'ID', 'ID', false),
            arg('body', 'String', 'String', false),
            arg('public', 'Boolean', 'Boolean', false)
        ], 'Comment', 'Comment', false, commentFields),
        staticEntry('mutation', 'updateComment', [
            arg('id', 'ID', 'ID', false),
            arg('body', 'String', 'String', false),
            arg('public', 'Boolean', 'Boolean', false)
        ], 'Comment', 'Comment', false, commentFields),
        staticEntry('mutation', 'deleteComment', [arg('id', 'ID', 'ID', false)], 'Comment', 'Comment', false, commentFields),
        staticEntry('mutation', 'secureUpdateComment', [
            arg('id', 'ID', 'ID', false),
            arg('body', 'String', 'String', false),
            arg('public', 'Boolean', 'Boolean', false)
        ], 'Comment', 'Comment', false, commentFields),
        staticEntry('mutation', 'secureDeleteComment', [arg('id', 'ID', 'ID', false)], 'Comment', 'Comment', false, commentFields),
        staticEntry('mutation', 'superSecretPrivateMutation', [arg('command', 'String', 'String', false)], 'CommandOutput', 'CommandOutput', false, commandOutputFields)
    ];
}

export function operationCatalogAsJson(catalog: OperationCatalogEntry[]): string {
    return JSON.stringify({
        generatedAt: new Date().toISOString(),
        source: 'local GraphQLSchema from 01-test-target-graphql-server/01-server/lib/gql/schema.ts',
        operations: catalog
    }, null, 2);
}
