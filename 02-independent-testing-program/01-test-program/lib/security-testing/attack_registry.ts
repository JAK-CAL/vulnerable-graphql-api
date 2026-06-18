import {AttackGene, AttackType, OperationCatalogEntry} from './types';
import {findByTag, sameReturnType} from './static_classifier';

export interface AttackTemplate {
    type: AttackType;
    requiredCapabilities: string[];
    fsm: string[];
}

export const AttackTemplates: AttackTemplate[] = [
    {
        type: 'BOLA_READ',
        requiredCapabilities: ['AUTH(A)', 'AUTH(B)', 'OWN_OBJECT(A,T,id)', 'READ_BY_ID_OP(T)'],
        fsm: ['INIT', 'SINGLE_SESSION', 'DUAL_SESSION', 'OWN_OBJECT_AVAILABLE', 'FOREIGN_REFERENCE_AVAILABLE', 'ATTACK_READY', 'ATTACK_EXECUTED', 'FOUND']
    },
    {
        type: 'BOLA_UPDATE_DELETE',
        requiredCapabilities: ['BOLA_READ', 'UPDATE_OR_DELETE_OP(T)', 'SIDE_EFFECT_CONFIRMATION'],
        fsm: ['INIT', 'BOLA_READ_READY', 'MUTATION_READY', 'ATTACK_EXECUTED', 'FOUND']
    },
    {
        type: 'STALE_OBJECT_ACCESS',
        requiredCapabilities: ['AUTH', 'CREATE_OP', 'DELETE_OP', 'READ_OR_UPDATE_OP', 'DELETED_OBJECT_ID'],
        fsm: ['INIT', 'OBJECT_CREATED', 'OBJECT_DELETED', 'STALE_REFERENCE_READY', 'ATTACK_EXECUTED', 'FOUND']
    },
    {
        type: 'BFLA_ADMIN_LIKE_OP',
        requiredCapabilities: ['LOW_PRIV_SESSION', 'ADMIN_LIKE_OP'],
        fsm: ['INIT', 'LOW_PRIV_SESSION', 'ADMIN_OP_AVAILABLE', 'ATTACK_READY', 'ATTACK_EXECUTED', 'FOUND']
    },
    {
        type: 'BOPLA_SENSITIVE_FIELD_READ',
        requiredCapabilities: ['LOW_PRIV_SESSION', 'SENSITIVE_FIELD', 'READ_OP'],
        fsm: ['INIT', 'LOW_PRIV_SESSION', 'SENSITIVE_FIELD_SELECTED', 'ATTACK_READY', 'ATTACK_EXECUTED', 'FOUND']
    }
];

function baseGene(type: AttackType, index: number, owner: string, attacker: string): AttackGene {
    return {
        id: type + '-' + index,
        type: type,
        owner: owner,
        attacker: attacker,
        fitness: 0,
        fsmState: 'INIT',
        capabilities: []
    };
}

const DefaultSensitiveFields = ['resetToken', 'internalNote', 'moderationNote'];

function unique(items: string[]): string[] {
    return items.filter((item, index) => items.indexOf(item) === index);
}

function scalarSelection(fields: string[], extraSensitiveFields: string[] = []): string {
    const allowedNames = unique(['id', 'title', 'content', 'public', 'deleted', 'body', 'username', 'firstName', 'lastName', 'stdout', 'stderr'].concat(DefaultSensitiveFields).concat(extraSensitiveFields));
    const allowed = fields.filter((field) => allowedNames.indexOf(field) >= 0);
    if (allowed.length === 0) {
        return 'id';
    }
    return allowed.join(' ');
}

function postSelection(): string {
    return 'id title content public deleted internalNote author { id username }';
}

function commentSelection(): string {
    return 'id body public deleted moderationNote author { id username }';
}

function selectionForType(typeName: string, fields: string[], extraSensitiveFields: string[] = []): string {
    if (typeName === 'Post') {
        return postSelection();
    }
    if (typeName === 'Comment') {
        return commentSelection();
    }
    return scalarSelection(fields, extraSensitiveFields);
}

function sensitiveFields(fields: string[], extraSensitiveFields: string[] = []): string[] {
    const names = unique(DefaultSensitiveFields.concat(extraSensitiveFields));
    return fields.filter((field) => names.indexOf(field) >= 0);
}

export function buildAttackPopulation(catalog: OperationCatalogEntry[], owner: string, attacker: string, extraSensitiveFields: string[] = []): AttackGene[] {
    const genes: AttackGene[] = [];
    const creates = findByTag(catalog, 'create');
    const reads = findByTag(catalog, 'read_by_id');
    const updates = findByTag(catalog, 'update');
    const deletes = findByTag(catalog, 'delete');
    const admins = findByTag(catalog, 'admin_like');
    const sensitiveOps = findByTag(catalog, 'sensitive_surface');

    creates.forEach((createOp: OperationCatalogEntry) => {
        reads.forEach((readOp: OperationCatalogEntry) => {
            if (!sameReturnType(createOp, readOp)) {
                return;
            }
            const gene = baseGene('BOLA_READ', genes.length + 1, owner, attacker);
            gene.objectType = createOp.namedReturnType;
            gene.setupResolver = createOp.name;
            gene.targetResolver = readOp.name;
            gene.selectionSet = selectionForType(createOp.namedReturnType, readOp.fields.map((field) => field.name), extraSensitiveFields);
            gene.capabilities = ['AUTH(A)', 'AUTH(B)', 'OWN_OBJECT(A,T,id)', 'READ_BY_ID_OP(T)'];
            genes.push(gene);
        });
    });

    creates.forEach((createOp: OperationCatalogEntry) => {
        updates.forEach((updateOp: OperationCatalogEntry) => {
            if (!sameReturnType(createOp, updateOp)) {
                return;
            }
            const gene = baseGene('BOLA_UPDATE_DELETE', genes.length + 1, owner, attacker);
            gene.objectType = createOp.namedReturnType;
            gene.setupResolver = createOp.name;
            gene.targetResolver = updateOp.name;
            const verifyRead = reads.filter((readOp) => sameReturnType(createOp, readOp))[0];
            gene.verifyResolver = verifyRead ? verifyRead.name : undefined;
            gene.selectionSet = selectionForType(createOp.namedReturnType, updateOp.fields.map((field) => field.name), extraSensitiveFields);
            gene.capabilities = ['AUTH(A)', 'AUTH(B)', 'OWN_OBJECT(A,T,id)', 'UPDATE_OR_DELETE_OP(T)', 'SIDE_EFFECT_CONFIRMATION'];
            genes.push(gene);
        });

        deletes.forEach((deleteOp: OperationCatalogEntry) => {
            if (!sameReturnType(createOp, deleteOp)) {
                return;
            }
            const gene = baseGene('BOLA_UPDATE_DELETE', genes.length + 1, owner, attacker);
            gene.objectType = createOp.namedReturnType;
            gene.setupResolver = createOp.name;
            gene.targetResolver = deleteOp.name;
            const verifyRead = reads.filter((readOp) => sameReturnType(createOp, readOp))[0];
            gene.verifyResolver = verifyRead ? verifyRead.name : undefined;
            gene.selectionSet = selectionForType(createOp.namedReturnType, deleteOp.fields.map((field) => field.name), extraSensitiveFields);
            gene.capabilities = ['AUTH(A)', 'AUTH(B)', 'OWN_OBJECT(A,T,id)', 'UPDATE_OR_DELETE_OP(T)', 'SIDE_EFFECT_CONFIRMATION'];
            genes.push(gene);
        });

        deletes.forEach((deleteOp: OperationCatalogEntry) => {
            const readOp = reads.filter((candidate) => sameReturnType(createOp, candidate))[0];
            if (!sameReturnType(createOp, deleteOp) || !readOp) {
                return;
            }
            const gene = baseGene('STALE_OBJECT_ACCESS', genes.length + 1, owner, attacker);
            gene.objectType = createOp.namedReturnType;
            gene.setupResolver = createOp.name;
            gene.deleteResolver = deleteOp.name;
            gene.targetResolver = readOp.name;
            gene.selectionSet = selectionForType(createOp.namedReturnType, readOp.fields.map((field) => field.name), extraSensitiveFields);
            gene.capabilities = ['AUTH', 'CREATE_OP', 'DELETE_OP', 'READ_OR_UPDATE_OP', 'DELETED_OBJECT_ID'];
            genes.push(gene);
        });
    });

    admins.forEach((adminOp: OperationCatalogEntry) => {
        const gene = baseGene('BFLA_ADMIN_LIKE_OP', genes.length + 1, owner, attacker);
        gene.targetResolver = adminOp.name;
        gene.objectType = adminOp.namedReturnType;
        gene.selectionSet = scalarSelection(adminOp.fields.map((field) => field.name), extraSensitiveFields);
        gene.capabilities = ['LOW_PRIV_SESSION', 'ADMIN_LIKE_OP'];
        genes.push(gene);
    });

    sensitiveOps.forEach((op: OperationCatalogEntry) => {
        const fields = sensitiveFields(op.fields.map((field) => field.name), extraSensitiveFields);
        fields.forEach((fieldName: string) => {
            const gene = baseGene('BOPLA_SENSITIVE_FIELD_READ', genes.length + 1, owner, attacker);
            gene.targetResolver = op.name;
            gene.objectType = op.namedReturnType;
            gene.sensitiveField = fieldName;
            gene.selectionSet = scalarSelection(op.fields.map((field) => field.name), extraSensitiveFields);
            gene.capabilities = ['LOW_PRIV_SESSION', 'SENSITIVE_FIELD', 'READ_OP'];
            genes.push(gene);
        });
    });

    return genes;
}
