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
    authenticate,
    AuditLogRecord,
    createAuditLog,
    createPaste,
    createUser,
    deleteAuditRecord,
    deletePasteRecord,
    getAuditLog,
    getPaste,
    getUserById,
    getUserByUsername,
    GraphQLContext,
    PasteRecord,
    resetState,
    updateAuditRecord,
    updatePasteRecord,
    UserRecord
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

function sanitizedPaste(paste: PasteRecord | undefined, context: GraphQLContext): any {
    const visible = visiblePaste(paste, context);
    if (!visible) {
        return undefined;
    }
    return Object.assign({}, visible, {internalNote: null, ownerSecret: null});
}

function sanitizedAudit(audit: AuditLogRecord | undefined, context: GraphQLContext): any {
    const visible = visibleAudit(audit, context);
    if (!visible) {
        return undefined;
    }
    return Object.assign({}, visible, {moderationNote: null, reviewToken: null});
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
                .map((paste) => Object.assign({}, paste, {internalNote: null, ownerSecret: null}))
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
                    .map((paste) => Object.assign({}, paste, {internalNote: null, ownerSecret: null}));
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
                    .map((paste) => Object.assign({}, paste, {internalNote: null, ownerSecret: null}));
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
                .map((audit) => Object.assign({}, audit, {moderationNote: null, reviewToken: null}))
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
                    .map((audit) => Object.assign({}, audit, {moderationNote: null, reviewToken: null}));
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
                const current = requireUser(context);
                const paste = getPaste(args.id);
                if (!paste || paste.ownerId !== current.id || paste.deleted) {
                    throw new Error('Paste not found');
                }
                return Object.assign({}, updatePasteRecord(paste, args.title, args.content, args.public), {internalNote: null, ownerSecret: null});
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
                const current = requireUser(context);
                const paste = getPaste(args.id);
                if (!paste || paste.ownerId !== current.id || paste.deleted) {
                    throw new Error('Paste not found');
                }
                return Object.assign({}, deletePasteRecord(paste), {internalNote: null, ownerSecret: null});
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
                const current = requireUser(context);
                const audit = getAuditLog(args.id);
                if (!audit || audit.ownerId !== current.id || audit.deleted) {
                    throw new Error('Audit log not found');
                }
                return Object.assign({}, updateAuditRecord(audit, args.title, args.content, args.public), {moderationNote: null, reviewToken: null});
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
                const current = requireUser(context);
                const audit = getAuditLog(args.id);
                if (!audit || audit.ownerId !== current.id || audit.deleted) {
                    throw new Error('Audit log not found');
                }
                return Object.assign({}, deleteAuditRecord(audit), {moderationNote: null, reviewToken: null});
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
