import {AttackGene, OperationCatalogEntry, SequenceStep} from './types';

function findOperation(catalog: OperationCatalogEntry[], name?: string): OperationCatalogEntry | undefined {
    if (!name) {
        return undefined;
    }
    return catalog.find((entry) => entry.name === name);
}

function variableDefinitions(op: OperationCatalogEntry): string {
    return op.args.map((arg) => '$' + arg.name + ': ' + arg.type).join(', ');
}

function argumentBindings(op: OperationCatalogEntry): string {
    return op.args.map((arg) => arg.name + ': $' + arg.name).join(', ');
}

function operationHeader(keyword: string, name: string, varDefs: string): string {
    return keyword + ' ' + name + (varDefs ? '(' + varDefs + ')' : '') + ' {';
}

function fieldCall(name: string, args: string): string {
    return name + (args ? '(' + args + ')' : '');
}

function createVariables(op: OperationCatalogEntry, owner: string): any {
    const variables: any = {};
    op.args.forEach((arg) => {
        if (arg.name === 'title') {
            variables[arg.name] = 'security-fuzz-' + owner;
        }
        else if (arg.name === 'content') {
            variables[arg.name] = 'private object created by GraphQL security regression test';
        }
        else if (arg.name === 'public') {
            variables[arg.name] = false;
        }
        else if (arg.name === 'postId') {
            variables[arg.name] = '1';
        }
        else if (arg.namedType === 'String') {
            variables[arg.name] = 'security-fuzz';
        }
        else if (arg.namedType === 'Boolean') {
            variables[arg.name] = false;
        }
        else {
            variables[arg.name] = null;
        }
    });
    return variables;
}

function authStep(actor: string): SequenceStep {
    return {
        actor: actor,
        operationName: 'AuthSession',
        query: 'query AuthSession { me { id username firstName lastName } }',
        variables: {},
        purpose: 'AUTH(' + actor + '): establish or verify actor session'
    };
}

export function lowerGeneToSequence(gene: AttackGene, catalog: OperationCatalogEntry[]): SequenceStep[] {
    if (gene.type === 'BOLA_READ') {
        return lowerBolaRead(gene, catalog);
    }
    if (gene.type === 'BOLA_UPDATE_DELETE') {
        return lowerBolaUpdateDelete(gene, catalog);
    }
    if (gene.type === 'STALE_OBJECT_ACCESS') {
        return lowerStaleObjectAccess(gene, catalog);
    }
    if (gene.type === 'BFLA_ADMIN_LIKE_OP') {
        return lowerBfla(gene, catalog);
    }
    if (gene.type === 'BOPLA_SENSITIVE_FIELD_READ') {
        return lowerBopla(gene, catalog);
    }
    return [];
}

function lowerBolaRead(gene: AttackGene, catalog: OperationCatalogEntry[]): SequenceStep[] {
    const createOp = findOperation(catalog, gene.setupResolver);
    const readOp = findOperation(catalog, gene.targetResolver);
    if (!createOp || !readOp || !gene.objectType || !gene.selectionSet) {
        return [];
    }

    const createVarDefs = variableDefinitions(createOp);
    const createArgs = argumentBindings(createOp);
    const readVarDefs = variableDefinitions(readOp);
    const readArgs = argumentBindings(readOp);
    const poolKey = gene.owner + '.' + gene.objectType;

    const sequence: SequenceStep[] = [
        authStep(gene.owner),
        {
            actor: gene.owner,
            operationName: 'CreateOwned' + gene.objectType,
            query: [
                'mutation CreateOwned' + gene.objectType + '(' + createVarDefs + ') {',
                '  ' + createOp.name + '(' + createArgs + ') { ' + gene.selectionSet + ' }',
                '}'
            ].join('\n'),
            variables: createVariables(createOp, gene.owner),
            purpose: 'OWN_OBJECT(' + gene.owner + ',' + gene.objectType + ',id)',
            captures: [{
                poolKey: poolKey,
                path: [createOp.name],
                ownerActor: gene.owner,
                objectType: gene.objectType,
                lifecycleState: 'created'
            }]
        },
        authStep(gene.attacker),
        {
            actor: gene.attacker,
            operationName: 'ReadForeign' + gene.objectType,
            query: [
                'query ReadForeign' + gene.objectType + '(' + readVarDefs + ') {',
                '  ' + readOp.name + '(' + readArgs + ') { ' + gene.selectionSet + ' }',
                '}'
            ].join('\n'),
            variables: {id: '${pool.' + poolKey + '.id}'},
            purpose: 'BOLA_READ attack: attacker reads owner object id'
        },
        {
            actor: 'ANON',
            operationName: 'UnauthBaseline' + gene.objectType,
            query: [
                'query UnauthBaseline' + gene.objectType + '(' + readVarDefs + ') {',
                '  ' + readOp.name + '(' + readArgs + ') { ' + gene.selectionSet + ' }',
                '}'
            ].join('\n'),
            variables: {id: '${pool.' + poolKey + '.id}'},
            purpose: 'Differential oracle baseline for public-object false positive control'
        }
    ];

    return sequence;
}

function lowerBfla(gene: AttackGene, catalog: OperationCatalogEntry[]): SequenceStep[] {
    const adminOp = findOperation(catalog, gene.targetResolver);
    if (!adminOp || !gene.selectionSet) {
        return [];
    }

    const varDefs = variableDefinitions(adminOp);
    const args = argumentBindings(adminOp);
    const variables: any = {};
    adminOp.args.forEach((arg) => {
        variables[arg.name] = arg.name === 'command' ? 'echo graphql-security-fuzz' : 'security-fuzz';
    });

    return [
        authStep(gene.attacker),
        {
            actor: gene.attacker,
            operationName: 'LowPrivAdminLikeOperation',
            query: [
                operationHeader(adminOp.kind === 'mutation' ? 'mutation' : 'query', 'LowPrivAdminLikeOperation', varDefs),
                '  ' + fieldCall(adminOp.name, args) + ' { ' + gene.selectionSet + ' }',
                '}'
            ].join('\n'),
            variables: variables,
            purpose: 'BFLA_ADMIN_LIKE_OP attack: low-privilege actor executes admin-like resolver'
        }
    ];
}

function mutationVariables(op: OperationCatalogEntry, poolKey: string, typeName: string): any {
    const variables: any = {};
    op.args.forEach((arg) => {
        if (arg.name === 'id') {
            variables[arg.name] = '${pool.' + poolKey + '.id}';
        }
        else if (arg.name === 'title') {
            variables[arg.name] = 'cross-actor-updated-title';
        }
        else if (arg.name === 'content') {
            variables[arg.name] = 'cross-actor updated content';
        }
        else if (arg.name === 'body') {
            variables[arg.name] = 'cross-actor updated comment body';
        }
        else if (arg.name === 'public') {
            variables[arg.name] = false;
        }
        else if (arg.name === 'postId') {
            variables[arg.name] = '1';
        }
        else if (arg.namedType === 'String') {
            variables[arg.name] = 'security-fuzz-' + typeName;
        }
        else if (arg.namedType === 'Boolean') {
            variables[arg.name] = false;
        }
        else {
            variables[arg.name] = null;
        }
    });
    return variables;
}

function lowerBolaUpdateDelete(gene: AttackGene, catalog: OperationCatalogEntry[]): SequenceStep[] {
    const createOp = findOperation(catalog, gene.setupResolver);
    const targetOp = findOperation(catalog, gene.targetResolver);
    const verifyOp = findOperation(catalog, gene.verifyResolver);
    if (!createOp || !targetOp || !gene.objectType || !gene.selectionSet) {
        return [];
    }

    const createVarDefs = variableDefinitions(createOp);
    const createArgs = argumentBindings(createOp);
    const targetVarDefs = variableDefinitions(targetOp);
    const targetArgs = argumentBindings(targetOp);
    const poolKey = gene.owner + '.' + gene.objectType;
    const sequence: SequenceStep[] = [
        authStep(gene.owner),
        {
            actor: gene.owner,
            operationName: 'CreateOwned' + gene.objectType,
            query: [
                'mutation CreateOwned' + gene.objectType + '(' + createVarDefs + ') {',
                '  ' + createOp.name + '(' + createArgs + ') { ' + gene.selectionSet + ' }',
                '}'
            ].join('\n'),
            variables: createVariables(createOp, gene.owner),
            purpose: 'OWN_OBJECT(' + gene.owner + ',' + gene.objectType + ',id)',
            captures: [{
                poolKey: poolKey,
                path: [createOp.name],
                ownerActor: gene.owner,
                objectType: gene.objectType,
                lifecycleState: 'created'
            }]
        },
        authStep(gene.attacker),
        {
            actor: gene.attacker,
            operationName: 'ModifyForeign' + gene.objectType,
            query: [
                'mutation ModifyForeign' + gene.objectType + '(' + targetVarDefs + ') {',
                '  ' + targetOp.name + '(' + targetArgs + ') { ' + gene.selectionSet + ' }',
                '}'
            ].join('\n'),
            variables: mutationVariables(targetOp, poolKey, gene.objectType),
            purpose: 'BOLA_UPDATE_DELETE attack: attacker modifies owner object id'
        }
    ];

    if (verifyOp) {
        const verifyVarDefs = variableDefinitions(verifyOp);
        const verifyArgs = argumentBindings(verifyOp);
        sequence.push({
            actor: gene.owner,
            operationName: 'VerifyModified' + gene.objectType,
            query: [
                'query VerifyModified' + gene.objectType + '(' + verifyVarDefs + ') {',
                '  ' + verifyOp.name + '(' + verifyArgs + ') { ' + gene.selectionSet + ' }',
                '}'
            ].join('\n'),
            variables: {id: '${pool.' + poolKey + '.id}'},
            purpose: 'Side-effect confirmation after cross-actor modification'
        });
    }

    return sequence;
}

function lowerStaleObjectAccess(gene: AttackGene, catalog: OperationCatalogEntry[]): SequenceStep[] {
    const createOp = findOperation(catalog, gene.setupResolver);
    const deleteOp = findOperation(catalog, gene.deleteResolver);
    const readOp = findOperation(catalog, gene.targetResolver);
    if (!createOp || !deleteOp || !readOp || !gene.objectType || !gene.selectionSet) {
        return [];
    }

    const createVarDefs = variableDefinitions(createOp);
    const createArgs = argumentBindings(createOp);
    const deleteVarDefs = variableDefinitions(deleteOp);
    const deleteArgs = argumentBindings(deleteOp);
    const readVarDefs = variableDefinitions(readOp);
    const readArgs = argumentBindings(readOp);
    const poolKey = gene.owner + '.' + gene.objectType;

    return [
        authStep(gene.owner),
        {
            actor: gene.owner,
            operationName: 'CreateStaleTarget' + gene.objectType,
            query: [
                'mutation CreateStaleTarget' + gene.objectType + '(' + createVarDefs + ') {',
                '  ' + createOp.name + '(' + createArgs + ') { ' + gene.selectionSet + ' }',
                '}'
            ].join('\n'),
            variables: createVariables(createOp, gene.owner),
            purpose: 'CREATE_OP for stale object access',
            captures: [{
                poolKey: poolKey,
                path: [createOp.name],
                ownerActor: gene.owner,
                objectType: gene.objectType,
                lifecycleState: 'created'
            }]
        },
        {
            actor: gene.owner,
            operationName: 'DeleteStaleTarget' + gene.objectType,
            query: [
                'mutation DeleteStaleTarget' + gene.objectType + '(' + deleteVarDefs + ') {',
                '  ' + deleteOp.name + '(' + deleteArgs + ') { ' + gene.selectionSet + ' }',
                '}'
            ].join('\n'),
            variables: mutationVariables(deleteOp, poolKey, gene.objectType),
            purpose: 'DELETE_OP marks object deleted'
        },
        {
            actor: gene.owner,
            operationName: 'ReadDeleted' + gene.objectType,
            query: [
                'query ReadDeleted' + gene.objectType + '(' + readVarDefs + ') {',
                '  ' + readOp.name + '(' + readArgs + ') { ' + gene.selectionSet + ' }',
                '}'
            ].join('\n'),
            variables: {id: '${pool.' + poolKey + '.id}'},
            purpose: 'STALE_OBJECT_ACCESS attack: read deleted object id'
        }
    ];
}

function lowerBopla(gene: AttackGene, catalog: OperationCatalogEntry[]): SequenceStep[] {
    const op = findOperation(catalog, gene.targetResolver);
    if (!op || !gene.selectionSet) {
        return [];
    }

    if (op.name === 'passwordReset') {
        return lowerPasswordResetBopla(gene, catalog, op);
    }

    const varDefs = variableDefinitions(op);
    const args = argumentBindings(op);
    const variables: any = {};
    op.args.forEach((arg) => {
        if (arg.name === 'id') {
            variables[arg.name] = '1';
        }
        else if (arg.namedType === 'String') {
            variables[arg.name] = 'security-fuzz';
        }
    });

    const opKeyword = op.kind === 'mutation' ? 'mutation' : 'query';
    const operationName = 'ReadSensitive' + (gene.objectType || 'Object');
    return [
        authStep(gene.attacker),
        {
            actor: gene.attacker,
            operationName: operationName,
            query: [
                operationHeader(opKeyword, operationName, varDefs),
                '  ' + fieldCall(op.name, args) + ' { ' + gene.selectionSet + ' }',
                '}'
            ].join('\n'),
            variables: variables,
            purpose: 'BOPLA_SENSITIVE_FIELD_READ attack: low-privilege actor requests sensitive field'
        }
    ];
}

function lowerPasswordResetBopla(gene: AttackGene, catalog: OperationCatalogEntry[], resetOp: OperationCatalogEntry): SequenceStep[] {
    const registerOp = findOperation(catalog, 'register');
    if (!registerOp || !gene.selectionSet) {
        return [];
    }

    const registerVarDefs = variableDefinitions(registerOp);
    const registerArgs = argumentBindings(registerOp);
    const resetVarDefs = variableDefinitions(resetOp);
    const resetArgs = argumentBindings(resetOp);
    const poolKey = gene.attacker + '.PasswordResetUser';
    const username = 'security-fuzz-reset-' + gene.id + '-' + gene.attacker;
    const opKeyword = resetOp.kind === 'mutation' ? 'mutation' : 'query';

    return [
        authStep(gene.attacker),
        {
            actor: gene.attacker,
            operationName: 'RegisterPasswordResetUser',
            query: [
                'mutation RegisterPasswordResetUser(' + registerVarDefs + ') {',
                '  ' + registerOp.name + '(' + registerArgs + ') { ' + gene.selectionSet + ' }',
                '}'
            ].join('\n'),
            variables: {
                username: username,
                password: 'security-fuzz-password',
                firstName: 'security',
                lastName: 'fuzz'
            },
            purpose: 'BOPLA setup: create a local user and capture its resetToken from the intentionally vulnerable response',
            captures: [{
                poolKey: poolKey,
                path: [registerOp.name],
                ownerActor: gene.attacker,
                objectType: gene.objectType || 'User',
                lifecycleState: 'created'
            }]
        },
        {
            actor: gene.attacker,
            operationName: 'ReadSensitive' + (gene.objectType || 'Object'),
            query: [
                operationHeader(opKeyword, 'ReadSensitive' + (gene.objectType || 'Object'), resetVarDefs),
                '  ' + fieldCall(resetOp.name, resetArgs) + ' { ' + gene.selectionSet + ' }',
                '}'
            ].join('\n'),
            variables: {
                input: {
                    username: '${pool.' + poolKey + '.evidence.username}',
                    reset_token: '${pool.' + poolKey + '.evidence.resetToken}',
                    new_password: 'security-fuzz-new-password'
                }
            },
            purpose: 'BOPLA_SENSITIVE_FIELD_READ attack: passwordReset returns User fields including resetToken'
        }
    ];
}
