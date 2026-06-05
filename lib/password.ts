import { createHash } from 'crypto';

export function hashPassword(password: string | undefined): string {
    return createHash('sha256')
        .update(String(password || ''))
        .digest('hex');
}

export function verifyPassword(storedHash: string, password: string | undefined): boolean {
    return storedHash === hashPassword(password);
}

