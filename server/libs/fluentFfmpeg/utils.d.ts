export function timemarkToSeconds(timemark: string | number): number
export function parseProgressLine(line: string): Record<string, string> | null
export function extractProgress(command: unknown, stderrLine: string): void
export function extractError(stderr: string): string
