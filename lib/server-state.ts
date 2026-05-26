import session from 'express-session';

export const sessionStore = new session.MemoryStore();

let nextUserId = 2;

export function claimNextUserId() {
    const current = nextUserId;

    if (nextUserId === 50) {
        nextUserId = 2;
    } else {
        nextUserId += 1;
    }

    return current;
}

export function resetUserState() {
    nextUserId = 2;
}

export function clearSessionStore(): Promise<void> {
    return new Promise((resolve, reject) => {
        const store = sessionStore as any;

        store.clear((err: Error | null) => {
            if (err) {
                reject(err);
                return;
            }

            resolve();
        });
    });
}
