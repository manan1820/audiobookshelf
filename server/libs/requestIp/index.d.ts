export function getClientIp(req: unknown): string | null

declare const requestIp: {
  getClientIp: typeof getClientIp
}

export default requestIp
export = requestIp
