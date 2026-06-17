declare module 'argon2' {
    export function hash(password: string): Promise<string>;
    export function verify(hash: string, password: string): Promise<boolean>;
}
