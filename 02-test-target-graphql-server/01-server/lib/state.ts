export type Role = 'user' | 'admin';

export interface UserRecord {
    id: string;
    username: string;
    password: string;
    firstName: string;
    lastName: string;
    email: string;
    role: Role;
    resetToken: string;
    apiKey: string;
    debugToken: string;
}

export interface PasteRecord {
    id: string;
    title: string;
    content: string;
    public: boolean;
    deleted: boolean;
    internalNote: string;
    ownerSecret: string;
    ownerId: string;
    importedFrom?: string;
}

export interface AuditLogRecord {
    id: string;
    title: string;
    content: string;
    public: boolean;
    deleted: boolean;
    moderationNote: string;
    reviewToken: string;
    ownerId: string;
}

export interface SystemReportRecord {
    id: string;
    title: string;
    content: string;
    public: boolean;
    deleted: boolean;
    internalNote: string;
    debugToken: string;
}

interface LabState {
    users: UserRecord[];
    pastes: PasteRecord[];
    auditLogs: AuditLogRecord[];
    systemReports: SystemReportRecord[];
    nextUserId: number;
    nextPasteId: number;
    nextAuditId: number;
}

export interface GraphQLContext {
    user?: UserRecord | null;
    session?: any;
}

let state: LabState;

function token(prefix: string, id: string): string {
    return prefix + '-' + id + '-reset-token';
}

export function resetState(): void {
    state = {
        users: [
            {
                id: '1',
                username: 'userA',
                password: 'passwordA',
                firstName: 'Alice',
                lastName: 'Analyst',
                email: 'alice@example.test',
                role: 'user',
                resetToken: token('alice', '1'),
                apiKey: 'ak-alice-local-1',
                debugToken: 'dbg-alice-session-1'
            },
            {
                id: '2',
                username: 'userB',
                password: 'passwordB',
                firstName: 'Bob',
                lastName: 'Builder',
                email: 'bob@example.test',
                role: 'user',
                resetToken: token('bob', '2'),
                apiKey: 'ak-bob-local-2',
                debugToken: 'dbg-bob-session-2'
            },
            {
                id: '3',
                username: 'admin',
                password: 'admin-password',
                firstName: 'Ada',
                lastName: 'Admin',
                email: 'admin@example.test',
                role: 'admin',
                resetToken: token('admin', '3'),
                apiKey: 'ak-admin-local-3',
                debugToken: 'dbg-admin-session-3'
            }
        ],
        pastes: [
            {
                id: '1',
                title: 'Public welcome paste',
                content: 'This paste is intentionally public.',
                public: true,
                deleted: false,
                internalNote: 'public-seed-note',
                ownerSecret: 'owner-public-paste-1',
                ownerId: '1'
            },
            {
                id: '2',
                title: 'Private incident draft',
                content: 'Contains a draft incident timeline.',
                public: false,
                deleted: false,
                internalNote: 'triage-key-paste-2',
                ownerSecret: 'owner-secret-paste-2',
                ownerId: '1'
            },
            {
                id: '3',
                title: 'Private token checklist',
                content: 'Rotate service account credentials.',
                public: false,
                deleted: false,
                internalNote: 'service-token-paste-3',
                ownerSecret: 'owner-secret-paste-3',
                ownerId: '2'
            },
            {
                id: '4',
                title: 'Public import note',
                content: 'A second public paste keeps search fixtures stable.',
                public: true,
                deleted: false,
                internalNote: 'public-import-note-4',
                ownerSecret: 'owner-public-paste-4',
                ownerId: '2'
            }
        ],
        auditLogs: [
            {
                id: '1',
                title: 'login',
                content: 'userA login from local workstation',
                public: true,
                deleted: false,
                moderationNote: 'public-audit-note',
                reviewToken: 'review-public-audit-1',
                ownerId: '1'
            },
            {
                id: '2',
                title: 'token-export',
                content: 'userA exported a private token list',
                public: false,
                deleted: false,
                moderationNote: 'investigate-export-audit-2',
                reviewToken: 'review-private-audit-2',
                ownerId: '1'
            },
            {
                id: '3',
                title: 'paste-import',
                content: 'userB imported remote paste metadata',
                public: false,
                deleted: false,
                moderationNote: 'review-import-audit-3',
                reviewToken: 'review-private-audit-3',
                ownerId: '2'
            }
        ],
        systemReports: [
            {
                id: '1',
                title: 'private diagnostics',
                content: 'cluster version and local health snapshot',
                public: false,
                deleted: false,
                internalNote: 'admin-only-diagnostics',
                debugToken: 'system-debug-token-1'
            }
        ],
        nextUserId: 4,
        nextPasteId: 5,
        nextAuditId: 4
    };
}

resetState();

export function allUsers(): UserRecord[] {
    return state.users;
}

export function getUserById(id: string | undefined): UserRecord | undefined {
    return state.users.find((user) => user.id === String(id));
}

export function getUserByUsername(username: string | undefined): UserRecord | undefined {
    return state.users.find((user) => user.username === username);
}

export function createUser(username: string, password: string, firstName: string, lastName: string): UserRecord {
    const id = String(state.nextUserId++);
    const user: UserRecord = {
        id: id,
        username: username,
        password: password,
        firstName: firstName,
        lastName: lastName,
        email: username + '@example.test',
        role: 'user',
        resetToken: token(username, id),
        apiKey: 'ak-' + username + '-' + id,
        debugToken: 'dbg-' + username + '-' + id
    };
    state.users.push(user);
    return user;
}

export function authenticate(username: string | undefined, password: string | undefined): UserRecord | undefined {
    return state.users.find((user) => user.username === username && user.password === password);
}

export function allPastes(): PasteRecord[] {
    return state.pastes;
}

export function getPaste(id: string | undefined): PasteRecord | undefined {
    return state.pastes.find((paste) => paste.id === String(id));
}

export function createPaste(ownerId: string, title: string, content: string, isPublic: boolean, importedFrom?: string): PasteRecord {
    const paste: PasteRecord = {
        id: String(state.nextPasteId++),
        title: title,
        content: content,
        public: isPublic,
        deleted: false,
        internalNote: 'owner-' + ownerId + '-paste-review-' + state.nextPasteId,
        ownerSecret: 'owner-' + ownerId + '-secret-' + state.nextPasteId,
        ownerId: ownerId,
        importedFrom: importedFrom
    };
    state.pastes.push(paste);
    return paste;
}

export function updatePasteRecord(paste: PasteRecord, title?: string, content?: string, isPublic?: boolean): PasteRecord {
    if (title !== undefined && title !== null) {
        paste.title = title;
    }
    if (content !== undefined && content !== null) {
        paste.content = content;
    }
    if (isPublic !== undefined && isPublic !== null) {
        paste.public = isPublic;
    }
    return paste;
}

export function deletePasteRecord(paste: PasteRecord): PasteRecord {
    paste.deleted = true;
    return paste;
}

export function allAuditLogs(): AuditLogRecord[] {
    return state.auditLogs;
}

export function getAuditLog(id: string | undefined): AuditLogRecord | undefined {
    return state.auditLogs.find((audit) => audit.id === String(id));
}

export function createAuditLog(ownerId: string, title: string, content: string, isPublic: boolean): AuditLogRecord {
    const audit: AuditLogRecord = {
        id: String(state.nextAuditId++),
        title: title,
        content: content,
        public: isPublic,
        deleted: false,
        moderationNote: 'owner-' + ownerId + '-audit-review-' + state.nextAuditId,
        reviewToken: 'owner-' + ownerId + '-review-token-' + state.nextAuditId,
        ownerId: ownerId
    };
    state.auditLogs.push(audit);
    return audit;
}

export function updateAuditRecord(audit: AuditLogRecord, title?: string, content?: string, isPublic?: boolean): AuditLogRecord {
    if (title !== undefined && title !== null) {
        audit.title = title;
    }
    if (content !== undefined && content !== null) {
        audit.content = content;
    }
    if (isPublic !== undefined && isPublic !== null) {
        audit.public = isPublic;
    }
    return audit;
}

export function deleteAuditRecord(audit: AuditLogRecord): AuditLogRecord {
    audit.deleted = true;
    return audit;
}

export function allSystemReports(): SystemReportRecord[] {
    return state.systemReports;
}
