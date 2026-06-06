import session from 'express-session';

let userId = 2;

export const sessionStore = new session.MemoryStore();

export function claimNextUserId(): number {
    const claimedUserId = userId;

    if (userId === 50) {
        userId = 2;
    }
    else {
        userId++;
    }

    return claimedUserId;
}

export function resetUserState(): void {
    userId = 2;
}

export function clearSessionStore(): Promise<void> {
    return new Promise((resolve, reject) => {
        (sessionStore.clear as any)((err?: any) => {
            if (err) {
                reject(err);
                return;
            }

            resolve();
        });
    });
}
