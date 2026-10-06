import type { Request } from 'express'

export interface RequestLike {
  secure?: boolean
  get(header: string): string | string[] | undefined | null
}

export type ValidProtocol = 'https' | 'http'

export interface RequestOrigin {
  protocol: ValidProtocol
  host: string | undefined
  origin: string
}

/**
 * Whether the request was made over HTTPS.
 * Uses Express `req.secure` and `x-forwarded-proto`
 */
export function isRequestSecure(req: Request | RequestLike): boolean {
  if (req.secure) return true
  const protoHeader = req.get('x-forwarded-proto')
  const protoStr = Array.isArray(protoHeader) ? protoHeader.join(',') : protoHeader || ''
  const xfp = protoStr.toLowerCase()
  // Nginx Proxy Manager sends "http, https"; see https://github.com/advplyr/audiobookshelf/pull/4635
  return (
    xfp === 'https' ||
    xfp
      .split(',')
      .map((s) => s.trim())
      .includes('https')
  )
}

export function getRequestProtocol(req: Request | RequestLike): ValidProtocol {
  return isRequestSecure(req) ? 'https' : 'http'
}

export function getRequestOrigin(req: Request | RequestLike): RequestOrigin {
  const protocol = getRequestProtocol(req)
  const rawHost = req.get('host')
  const host = Array.isArray(rawHost) ? rawHost[0] : (rawHost ?? undefined)
  return { protocol, host, origin: `${protocol}://${host}` }
}
