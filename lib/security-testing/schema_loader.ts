import {
    GraphQLArgument,
    GraphQLField,
    GraphQLList,
    GraphQLNamedType,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLType,
    isObjectType
} from 'graphql';
import fs from 'fs';

import {classifyOperation} from './static_classifier';
import {ArgDef, FieldDef, OperationCatalogEntry, OperationKind} from './types';

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

function loadCatalogFile(catalogPath: string): OperationCatalogEntry[] {
    const raw = JSON.parse(fs.readFileSync(catalogPath).toString());
    const operations = Array.isArray(raw) ? raw : raw.operations;
    if (!Array.isArray(operations)) {
        throw new Error('Operation catalog must be an array or an object with an operations array: ' + catalogPath);
    }

    return operations.map((entry: OperationCatalogEntry) => {
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
    });
}

export function loadOperationCatalog(catalogPath?: string): OperationCatalogEntry[] {
    if (catalogPath) {
        return loadCatalogFile(catalogPath);
    }

    let localSchema: any;
    try {
        localSchema = require('../gql/schema').schema;
    }
    catch (_err) {
        return loadStaticVulnerableApiCatalog();
    }

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

    return catalog;
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

    return [
        staticEntry('query', 'me', [], 'User', 'User', false, userFields),
        staticEntry('query', 'allUsers', [], '[User]', 'User', true, userFields),
        staticEntry('query', 'user', [arg('id', 'ID', 'ID', false)], 'User', 'User', false, userFields),
        staticEntry('query', 'post', [arg('id', 'ID', 'ID', false)], 'Post', 'Post', false, postFields),
        staticEntry('query', 'securePost', [arg('id', 'ID', 'ID', false)], 'Post', 'Post', false, postFields),
        staticEntry('query', 'search', [arg('query', 'String', 'String', false)], '[Post]', 'Post', true, postFields),
        staticEntry('query', 'comment', [arg('id', 'ID', 'ID', false)], 'Comment', 'Comment', false, commentFields),
        staticEntry('query', 'allComments', [], '[Comment]', 'Comment', true, commentFields),
        staticEntry('query', 'adminUsers', [], '[User]', 'User', true, userFields),
        staticEntry('query', 'health', [], 'String', 'String', false, []),
        staticEntry('query', 'publicFeed', [], 'String', 'String', false, []),
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
        staticEntry('mutation', 'superSecretPrivateMutation', [arg('command', 'String', 'String', false)], 'CommandOutput', 'CommandOutput', false, commandOutputFields)
    ];
}

export function operationCatalogAsJson(catalog: OperationCatalogEntry[]): string {
    return JSON.stringify({
        generatedAt: new Date().toISOString(),
        source: 'local GraphQLSchema from lib/gql/schema.ts',
        operations: catalog
    }, null, 2);
}
