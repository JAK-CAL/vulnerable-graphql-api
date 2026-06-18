import {
    GraphQLBoolean,
    GraphQLFieldConfigMap,
    GraphQLList,
    GraphQLObjectType,
    GraphQLSchema,
    GraphQLString
} from 'graphql';
import GraphQLJSON from 'graphql-type-json';

import {
    allAuditLogs,
    allPastes,
    allSystemReports,
    allUsers,
    allWorkspaces,
    authenticate,
    AuditLogRecord,
    createAuditLog,
    createPaste,
    createUser,
    createWorkspace,
    deleteAuditRecord,
    deletePasteRecord,
    deleteWorkspaceRecord,
    getAuditLog,
    getPaste,
    getUserById,
    getUserByUsername,
    getWorkspace,
    GraphQLContext,
    joinWorkspaceByInvite,
    PasteRecord,
    resetState,
    updateAuditRecord,
    updatePasteRecord,
    updateWorkspaceRecord,
    UserRecord,
    WorkspaceRecord
} from './state';

function requireUser(context: GraphQLContext): UserRecord {
    if (!context.user) {
        throw new Error('Authentication required');
    }
    return context.user;
}

function requireAdmin(context: GraphQLContext): UserRecord {
    const user = requireUser(context);
    if (user.role !== 'admin') {
        throw new Error('Admin privileges required');
    }
    return user;
}

function ownsRecord(record: {ownerId: string}, context: GraphQLContext): boolean {
    return !!context.user && record.ownerId === context.user.id;
}

function visiblePaste(paste: PasteRecord | undefined, context: GraphQLContext): PasteRecord | undefined {
    if (!paste || paste.deleted) {
        return undefined;
    }
    if (paste.public || ownsRecord(paste, context)) {
        return paste;
    }
    return undefined;
}

function visibleAudit(audit: AuditLogRecord | undefined, context: GraphQLContext): AuditLogRecord | undefined {
    if (!audit || audit.deleted) {
        return undefined;
    }
    if (audit.public || ownsRecord(audit, context)) {
        return audit;
    }
    return undefined;
}

function redactPaste(paste: PasteRecord): any {
    return Object.assign({}, paste, {internalNote: null, ownerSecret: null});
}

function redactAudit(audit: AuditLogRecord): any {
    return Object.assign({}, audit, {moderationNote: null, reviewToken: null});
}

function redactWorkspace(workspace: WorkspaceRecord): any {
    return Object.assign({}, workspace, {inviteCode: null, internalNote: null});
}

function requireOwnedActiveRecord<T extends {ownerId: string; deleted: boolean}>(record: T | undefined, context: GraphQLContext, message: string): T {
    const current = requireUser(context);
    if (!record || record.ownerId !== current.id || record.deleted) {
        throw new Error(message);
    }
    return record;
}

function sanitizedPaste(paste: PasteRecord | undefined, context: GraphQLContext): any {
    const visible = visiblePaste(paste, context);
    if (!visible) {
        return undefined;
    }
    return redactPaste(visible);
}

function sanitizedAudit(audit: AuditLogRecord | undefined, context: GraphQLContext): any {
    const visible = visibleAudit(audit, context);
    if (!visible) {
        return undefined;
    }
    return redactAudit(visible);
}

function sanitizedWorkspace(workspace: WorkspaceRecord | undefined, context: GraphQLContext): any {
    if (!workspace || workspace.deleted) {
        return undefined;
    }
    if (!context.user || (workspace.ownerId !== context.user.id && workspace.memberIds.indexOf(context.user.id) < 0)) {
        return undefined;
    }
    return redactWorkspace(workspace);
}

function queryLooksInjected(value: string | undefined): boolean {
    if (!value) {
        return false;
    }
    const lowered = value.toLowerCase();
    return lowered.indexOf("' or 1=1") >= 0 || lowered.indexOf('or 1=1--') >= 0;
}

const UserType: GraphQLObjectType = new GraphQLObjectType({
    name: 'User',
    fields: (): GraphQLFieldConfigMap<any, GraphQLContext> => ({
        id: {type: GraphQLString},
        username: {type: GraphQLString},
        firstName: {type: GraphQLString},
        lastName: {type: GraphQLString},
        email: {type: GraphQLString},
        role: {type: GraphQLString},
        resetToken: {type: GraphQLString},
        apiKey: {type: GraphQLString},
        debugToken: {type: GraphQLString}
    })
});

const UserSessionType: GraphQLObjectType = new GraphQLObjectType({
    name: 'UserSession',
    fields: (): GraphQLFieldConfigMap<any, GraphQLContext> => ({
        id: {type: GraphQLString},
        username: {type: GraphQLString},
        firstName: {type: GraphQLString},
        lastName: {type: GraphQLString},
        role: {type: GraphQLString}
    })
});

const PasteType: GraphQLObjectType = new GraphQLObjectType({
    name: 'Paste',
    fields: (): GraphQLFieldConfigMap<any, GraphQLContext> => ({
        id: {type: GraphQLString},
        title: {type: GraphQLString},
        content: {type: GraphQLString},
        public: {type: GraphQLBoolean},
        deleted: {type: GraphQLBoolean},
        internalNote: {type: GraphQLString},
        ownerSecret: {type: GraphQLString},
        importedFrom: {type: GraphQLString},
        owner: {
            type: UserType,
            resolve: (paste: PasteRecord) => getUserById(paste.ownerId)
        }
    })
});

const PasteViewType: GraphQLObjectType = new GraphQLObjectType({
    name: 'PasteView',
    fields: (): GraphQLFieldConfigMap<any, GraphQLContext> => ({
        id: {type: GraphQLString},
        title: {type: GraphQLString},
        content: {type: GraphQLString},
        public: {type: GraphQLBoolean},
        deleted: {type: GraphQLBoolean},
        importedFrom: {type: GraphQLString},
        owner: {
            type: UserSessionType,
            resolve: (paste: PasteRecord) => getUserById(paste.ownerId)
        }
    })
});

const AuditLogType: GraphQLObjectType = new GraphQLObjectType({
    name: 'AuditLog',
    fields: (): GraphQLFieldConfigMap<any, GraphQLContext> => ({
        id: {type: GraphQLString},
        title: {type: GraphQLString},
        content: {type: GraphQLString},
        public: {type: GraphQLBoolean},
        deleted: {type: GraphQLBoolean},
        moderationNote: {type: GraphQLString},
        reviewToken: {type: GraphQLString},
        owner: {
            type: UserType,
            resolve: (audit: AuditLogRecord) => getUserById(audit.ownerId)
        }
    })
});

const AuditLogViewType: GraphQLObjectType = new GraphQLObjectType({
    name: 'AuditLogView',
    fields: (): GraphQLFieldConfigMap<any, GraphQLContext> => ({
        id: {type: GraphQLString},
        title: {type: GraphQLString},
        content: {type: GraphQLString},
        public: {type: GraphQLBoolean},
        deleted: {type: GraphQLBoolean},
        owner: {
            type: UserSessionType,
            resolve: (audit: AuditLogRecord) => getUserById(audit.ownerId)
        }
    })
});

const WorkspaceType: GraphQLObjectType = new GraphQLObjectType({
    name: 'Workspace',
    fields: (): GraphQLFieldConfigMap<any, GraphQLContext> => ({
        id: {type: GraphQLString},
        name: {type: GraphQLString},
        archived: {type: GraphQLBoolean},
        deleted: {type: GraphQLBoolean},
        owner: {
            type: UserType,
            resolve: (workspace: WorkspaceRecord) => getUserById(workspace.ownerId)
        },
        members: {
            type: new GraphQLList(UserSessionType),
            resolve: (workspace: WorkspaceRecord) => workspace.memberIds.map((id) => getUserById(id)).filter(Boolean)
        }
    })
});

const WorkspaceViewType: GraphQLObjectType = new GraphQLObjectType({
    name: 'WorkspaceView',
    fields: (): GraphQLFieldConfigMap<any, GraphQLContext> => ({
        id: {type: GraphQLString},
        name: {type: GraphQLString},
        archived: {type: GraphQLBoolean},
        deleted: {type: GraphQLBoolean},
        owner: {
            type: UserSessionType,
            resolve: (workspace: WorkspaceRecord) => getUserById(workspace.ownerId)
        },
        members: {
            type: new GraphQLList(UserSessionType),
            resolve: (workspace: WorkspaceRecord) => workspace.memberIds.map((id) => getUserById(id)).filter(Boolean)
        }
    })
});

const SystemReportType: GraphQLObjectType = new GraphQLObjectType({
    name: 'SystemReport',
    fields: (): GraphQLFieldConfigMap<any, GraphQLContext> => ({
        id: {type: GraphQLString},
        title: {type: GraphQLString},
        content: {type: GraphQLString},
        public: {type: GraphQLBoolean},
        deleted: {type: GraphQLBoolean},
        internalNote: {type: GraphQLString},
        debugToken: {type: GraphQLString}
    })
});

const SystemStatusType: GraphQLObjectType = new GraphQLObjectType({
    name: 'SystemStatus',
    fields: (): GraphQLFieldConfigMap<any, GraphQLContext> => ({
        status: {type: GraphQLString},
        message: {type: GraphQLString}
    })
});

const CommandOutputType: GraphQLObjectType = new GraphQLObjectType({
    name: 'CommandOutput',
    fields: (): GraphQLFieldConfigMap<any, GraphQLContext> => ({
        stdout: {type: GraphQLString},
        stderr: {type: GraphQLString}
    })
});

const QueryType: GraphQLObjectType = new GraphQLObjectType({
    name: 'Query',
    fields: (): GraphQLFieldConfigMap<any, GraphQLContext> => ({
        me: {
            type: UserType,
            resolve: (_source, _args, context) => context.user || null
        },
        user: {
            type: UserType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args) => getUserById(args.id)
        },
        allUsers: {
            type: new GraphQLList(UserType),
            resolve: () => allUsers()
        },
        adminUsers: {
            type: new GraphQLList(UserType),
            resolve: () => allUsers()
        },
        adminSafeDirectory: {
            type: new GraphQLList(UserSessionType),
            resolve: (_source, _args, context) => {
                requireAdmin(context);
                return allUsers();
            }
        },
        paste: {
            type: PasteType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args) => getPaste(args.id)
        },
        securePaste: {
            type: PasteViewType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args, context) => sanitizedPaste(getPaste(args.id), context)
        },
        pastePreview: {
            type: PasteViewType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args, context) => sanitizedPaste(getPaste(args.id), context)
        },
        publicPastes: {
            type: new GraphQLList(PasteViewType),
            resolve: () => allPastes()
                .filter((paste) => paste.public && !paste.deleted)
                .map(redactPaste)
        },
        ownerPasteHistory: {
            type: new GraphQLList(PasteViewType),
            args: {id: {type: GraphQLString}},
            resolve: (_source, args, context) => {
                const current = requireUser(context);
                if (current.id !== String(args.id)) {
                    return [];
                }
                return allPastes()
                    .filter((paste) => paste.ownerId === current.id && !paste.deleted)
                    .map(redactPaste);
            }
        },
        entry: {
            type: PasteType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args) => getPaste(args.id)
        },
        workspaceSummary: {
            type: PasteViewType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args, context) => sanitizedPaste(getPaste(args.id), context)
        },
        searchPastes: {
            type: new GraphQLList(PasteType),
            args: {query: {type: GraphQLString}},
            resolve: (_source, args) => {
                if (queryLooksInjected(args.query)) {
                    return allPastes().filter((paste) => !paste.deleted);
                }
                const needle = String(args.query || '').toLowerCase();
                return allPastes().filter((paste) => !paste.deleted && paste.public && (
                    paste.title.toLowerCase().indexOf(needle) >= 0 ||
                    paste.content.toLowerCase().indexOf(needle) >= 0 ||
                    needle === 'security-fuzz'
                ));
            }
        },
        secureSearchPastes: {
            type: new GraphQLList(PasteViewType),
            args: {query: {type: GraphQLString}},
            resolve: (_source, args) => {
                const needle = String(args.query || '').toLowerCase().replace(/['";-]/g, '');
                return allPastes()
                    .filter((paste) => !paste.deleted && paste.public && (
                        paste.title.toLowerCase().indexOf(needle) >= 0 ||
                        paste.content.toLowerCase().indexOf(needle) >= 0 ||
                        needle === 'securityfuzz'
                    ))
                    .map(redactPaste);
            }
        },
        auditLog: {
            type: AuditLogType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args) => getAuditLog(args.id)
        },
        secureAuditLog: {
            type: AuditLogViewType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args, context) => sanitizedAudit(getAuditLog(args.id), context)
        },
        auditPreview: {
            type: AuditLogViewType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args, context) => sanitizedAudit(getAuditLog(args.id), context)
        },
        record: {
            type: AuditLogType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args) => getAuditLog(args.id)
        },
        allAuditLogs: {
            type: new GraphQLList(AuditLogType),
            resolve: () => allAuditLogs()
        },
        publicAuditLogs: {
            type: new GraphQLList(AuditLogViewType),
            resolve: () => allAuditLogs()
                .filter((audit) => audit.public && !audit.deleted)
                .map(redactAudit)
        },
        ownerAuditHistory: {
            type: new GraphQLList(AuditLogViewType),
            args: {id: {type: GraphQLString}},
            resolve: (_source, args, context) => {
                const current = requireUser(context);
                if (current.id !== String(args.id)) {
                    return [];
                }
                return allAuditLogs()
                    .filter((audit) => audit.ownerId === current.id && !audit.deleted)
                    .map(redactAudit);
            }
        },
        workspace: {
            type: WorkspaceType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args) => getWorkspace(args.id)
        },
        secureWorkspace: {
            type: WorkspaceViewType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args, context) => sanitizedWorkspace(getWorkspace(args.id), context)
        },
        myWorkspaces: {
            type: new GraphQLList(WorkspaceViewType),
            resolve: (_source, _args, context) => {
                const current = requireUser(context);
                return allWorkspaces()
                    .filter((workspace) => !workspace.deleted && workspace.memberIds.indexOf(current.id) >= 0)
                    .map(redactWorkspace);
            }
        },
        privateSystemReport: {
            type: SystemReportType,
            resolve: (_source, _args, context) => {
                requireAdmin(context);
                return allSystemReports()[0];
            }
        },
        internalStats: {
            type: SystemReportType,
            resolve: (_source, _args, context) => {
                requireAdmin(context);
                return Object.assign({}, allSystemReports()[0], {internalNote: null});
            }
        },
        systemHealth: {
            type: SystemStatusType,
            resolve: () => ({status: 'ok', message: 'public health check'})
        }
    })
});

const MutationType: GraphQLObjectType = new GraphQLObjectType({
    name: 'Mutation',
    fields: (): GraphQLFieldConfigMap<any, GraphQLContext> => ({
        login: {
            type: UserSessionType,
            args: {
                username: {type: GraphQLString},
                password: {type: GraphQLString}
            },
            resolve: (_source, args, context) => {
                const user = authenticate(args.username, args.password);
                if (!user) {
                    throw new Error('Invalid username or password');
                }
                if (context.session) {
                    context.session.userId = user.id;
                }
                return Object.assign({}, user, {resetToken: null});
            }
        },
        register: {
            type: UserType,
            args: {
                username: {type: GraphQLString},
                password: {type: GraphQLString},
                firstName: {type: GraphQLString},
                lastName: {type: GraphQLString}
            },
            resolve: (_source, args) => {
                const username = args.username || 'user-' + Date.now();
                return createUser(username, args.password || 'password', args.firstName || 'First', args.lastName || 'Last');
            }
        },
        passwordReset: {
            type: UserType,
            args: {input: {type: GraphQLJSON}},
            resolve: (_source, args) => {
                const input = args.input || {};
                const user = getUserByUsername(input.username);
                if (!user || user.resetToken !== input.reset_token) {
                    throw new Error('Invalid password reset token');
                }
                user.password = input.new_password || user.password;
                return user;
            }
        },
        createPaste: {
            type: PasteType,
            args: {
                title: {type: GraphQLString},
                content: {type: GraphQLString},
                public: {type: GraphQLBoolean}
            },
            resolve: (_source, args, context) => {
                const current = requireUser(context);
                return createPaste(current.id, args.title || 'Untitled paste', args.content || '', Boolean(args.public));
            }
        },
        updatePaste: {
            type: PasteType,
            args: {
                id: {type: GraphQLString},
                title: {type: GraphQLString},
                content: {type: GraphQLString},
                public: {type: GraphQLBoolean}
            },
            resolve: (_source, args, context) => {
                requireUser(context);
                const paste = getPaste(args.id);
                if (!paste) {
                    throw new Error('Paste not found');
                }
                return updatePasteRecord(paste, args.title, args.content, args.public);
            }
        },
        secureUpdatePaste: {
            type: PasteViewType,
            args: {
                id: {type: GraphQLString},
                title: {type: GraphQLString},
                content: {type: GraphQLString},
                public: {type: GraphQLBoolean}
            },
            resolve: (_source, args, context) => {
                const paste = requireOwnedActiveRecord(getPaste(args.id), context, 'Paste not found');
                return redactPaste(updatePasteRecord(paste, args.title, args.content, args.public));
            }
        },
        reviseEntry: {
            type: PasteType,
            args: {
                id: {type: GraphQLString},
                title: {type: GraphQLString},
                content: {type: GraphQLString},
                public: {type: GraphQLBoolean}
            },
            resolve: (_source, args, context) => {
                requireUser(context);
                const paste = getPaste(args.id);
                if (!paste) {
                    throw new Error('Entry not found');
                }
                return updatePasteRecord(paste, args.title, args.content, args.public);
            }
        },
        deletePaste: {
            type: PasteType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args, context) => {
                requireUser(context);
                const paste = getPaste(args.id);
                if (!paste) {
                    throw new Error('Paste not found');
                }
                return deletePasteRecord(paste);
            }
        },
        secureDeletePaste: {
            type: PasteViewType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args, context) => {
                const paste = requireOwnedActiveRecord(getPaste(args.id), context, 'Paste not found');
                return redactPaste(deletePasteRecord(paste));
            }
        },
        retireEntry: {
            type: PasteType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args, context) => {
                requireUser(context);
                const paste = getPaste(args.id);
                if (!paste) {
                    throw new Error('Entry not found');
                }
                return deletePasteRecord(paste);
            }
        },
        importRemotePaste: {
            type: PasteType,
            args: {
                host: {type: GraphQLString},
                path: {type: GraphQLString},
                scheme: {type: GraphQLString}
            },
            resolve: (_source, args, context) => {
                const current = requireUser(context);
                const scheme = args.scheme || 'https';
                const host = args.host || 'example.test';
                const path = args.path || '/paste';
                const commandLikeSource = scheme + '://' + host + path;
                return createPaste(current.id, 'Imported paste', 'Fetched from ' + commandLikeSource, false, commandLikeSource);
            }
        },
        uploadPaste: {
            type: PasteType,
            args: {
                filename: {type: GraphQLString},
                content: {type: GraphQLString}
            },
            resolve: (_source, args, context) => {
                const current = requireUser(context);
                const filename = args.filename || 'note.txt';
                return createPaste(current.id, 'Uploaded ' + filename, args.content || '', false, '/uploads/' + filename);
            }
        },
        createAuditLog: {
            type: AuditLogType,
            args: {
                title: {type: GraphQLString},
                content: {type: GraphQLString},
                public: {type: GraphQLBoolean}
            },
            resolve: (_source, args, context) => {
                const current = requireUser(context);
                return createAuditLog(current.id, args.title || 'event', args.content || 'event content', Boolean(args.public));
            }
        },
        updateAuditLog: {
            type: AuditLogType,
            args: {
                id: {type: GraphQLString},
                title: {type: GraphQLString},
                content: {type: GraphQLString},
                public: {type: GraphQLBoolean}
            },
            resolve: (_source, args, context) => {
                requireUser(context);
                const audit = getAuditLog(args.id);
                if (!audit) {
                    throw new Error('Audit log not found');
                }
                return updateAuditRecord(audit, args.title, args.content, args.public);
            }
        },
        secureUpdateAuditLog: {
            type: AuditLogViewType,
            args: {
                id: {type: GraphQLString},
                title: {type: GraphQLString},
                content: {type: GraphQLString},
                public: {type: GraphQLBoolean}
            },
            resolve: (_source, args, context) => {
                const audit = requireOwnedActiveRecord(getAuditLog(args.id), context, 'Audit log not found');
                return redactAudit(updateAuditRecord(audit, args.title, args.content, args.public));
            }
        },
        reviseRecord: {
            type: AuditLogType,
            args: {
                id: {type: GraphQLString},
                title: {type: GraphQLString},
                content: {type: GraphQLString},
                public: {type: GraphQLBoolean}
            },
            resolve: (_source, args, context) => {
                requireUser(context);
                const audit = getAuditLog(args.id);
                if (!audit) {
                    throw new Error('Record not found');
                }
                return updateAuditRecord(audit, args.title, args.content, args.public);
            }
        },
        deleteAuditLog: {
            type: AuditLogType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args, context) => {
                requireUser(context);
                const audit = getAuditLog(args.id);
                if (!audit) {
                    throw new Error('Audit log not found');
                }
                return deleteAuditRecord(audit);
            }
        },
        secureDeleteAuditLog: {
            type: AuditLogViewType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args, context) => {
                const audit = requireOwnedActiveRecord(getAuditLog(args.id), context, 'Audit log not found');
                return redactAudit(deleteAuditRecord(audit));
            }
        },
        retireRecord: {
            type: AuditLogType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args, context) => {
                requireUser(context);
                const audit = getAuditLog(args.id);
                if (!audit) {
                    throw new Error('Record not found');
                }
                return deleteAuditRecord(audit);
            }
        },
        createWorkspace: {
            type: WorkspaceType,
            args: {name: {type: GraphQLString}},
            resolve: (_source, args, context) => {
                const current = requireUser(context);
                return createWorkspace(current.id, args.name || 'Security workspace');
            }
        },
        updateWorkspace: {
            type: WorkspaceType,
            args: {
                id: {type: GraphQLString},
                name: {type: GraphQLString},
                archived: {type: GraphQLBoolean}
            },
            resolve: (_source, args, context) => {
                requireUser(context);
                const workspace = getWorkspace(args.id);
                if (!workspace) {
                    throw new Error('Workspace not found');
                }
                return updateWorkspaceRecord(workspace, args.name, args.archived);
            }
        },
        secureUpdateWorkspace: {
            type: WorkspaceViewType,
            args: {
                id: {type: GraphQLString},
                name: {type: GraphQLString},
                archived: {type: GraphQLBoolean}
            },
            resolve: (_source, args, context) => {
                const workspace = requireOwnedActiveRecord(getWorkspace(args.id), context, 'Workspace not found');
                return redactWorkspace(updateWorkspaceRecord(workspace, args.name, args.archived));
            }
        },
        deleteWorkspace: {
            type: WorkspaceType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args, context) => {
                requireUser(context);
                const workspace = getWorkspace(args.id);
                if (!workspace) {
                    throw new Error('Workspace not found');
                }
                return deleteWorkspaceRecord(workspace);
            }
        },
        secureDeleteWorkspace: {
            type: WorkspaceViewType,
            args: {id: {type: GraphQLString}},
            resolve: (_source, args, context) => {
                const workspace = requireOwnedActiveRecord(getWorkspace(args.id), context, 'Workspace not found');
                return redactWorkspace(deleteWorkspaceRecord(workspace));
            }
        },
        joinWorkspace: {
            type: WorkspaceViewType,
            args: {inviteCode: {type: GraphQLString}},
            resolve: (_source, args, context) => {
                const current = requireUser(context);
                const workspace = joinWorkspaceByInvite(current.id, args.inviteCode);
                if (!workspace) {
                    throw new Error('Workspace invite not found');
                }
                return redactWorkspace(workspace);
            }
        },
        adminCommand: {
            type: CommandOutputType,
            args: {command: {type: GraphQLString}},
            resolve: (_source, args, context) => {
                requireUser(context);
                return {
                    stdout: 'simulated command output: ' + (args.command || 'id'),
                    stderr: ''
                };
            }
        },
        secureAdminCommand: {
            type: CommandOutputType,
            args: {command: {type: GraphQLString}},
            resolve: (_source, args, context) => {
                requireAdmin(context);
                return {
                    stdout: 'admin command accepted: ' + (args.command || 'id'),
                    stderr: ''
                };
            }
        },
        maintenanceTask: {
            type: CommandOutputType,
            args: {command: {type: GraphQLString}},
            resolve: (_source, args, context) => {
                requireUser(context);
                return {
                    stdout: 'maintenance task accepted: ' + (args.command || 'status'),
                    stderr: ''
                };
            }
        },
        resetServer: {
            type: CommandOutputType,
            resolve: () => {
                resetState();
                return {stdout: 'reset', stderr: ''};
            }
        }
    })
});

export const schema: GraphQLSchema = new GraphQLSchema({
    query: QueryType,
    mutation: MutationType
});
