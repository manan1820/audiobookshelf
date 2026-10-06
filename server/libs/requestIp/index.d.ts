import { Request, RequestHandler } from 'express'

export function getClientIpFromXForwardedFor(value: string): string | null
export function getClientIp(req: Request | { headers?: Record<string, unknown>; connection?: { remoteAddress?: string }; socket?: { remoteAddress?: string }; info?: { remoteAddress?: string }; [key: string]: unknown }): string | null
export function mw(options?: { attributeName?: string }): RequestHandler
