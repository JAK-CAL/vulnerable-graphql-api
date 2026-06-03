export const DEFAULT_METHODS = [
    'pure-random-schema',
    'dependency-only',
    'template-only',
    'random-attack-gene',
    'ga-without-fsm',
    'ours'
];

export const COURSE_PROFILE_SEEDS = [1, 2, 3];
export const COURSE_PROFILE_BUDGETS = [20, 40, 50];

export function parseNumberList(value: string): number[] {
    return value.split(',')
        .map((item) => parseInt(item.trim(), 10))
        .filter((item) => !isNaN(item));
}

export function parseStringList(value: string): string[] {
    return value.split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
}

export function baseMethodName(label: string): string {
    return label.split('@')[0];
}
