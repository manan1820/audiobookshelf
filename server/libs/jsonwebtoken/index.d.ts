declare module 'jsonwebtoken' {
  export interface SignOptions {
    expiresIn?: string | number
    notBefore?: string | number
    audience?: string | string[]
    algorithm?: string
    header?: Record<string, unknown>
    encoding?: string
    issuer?: string
    subject?: string
    jwtid?: string
    noTimestamp?: boolean
    keyid?: string
    mutatePayload?: boolean
    allowInsecureKeySizes?: boolean
    allowInvalidAsymmetricKeyTypes?: boolean
    [key: string]: unknown
  }

  export interface VerifyOptions {
    algorithms?: string[]
    audience?: string | RegExp | Array<string | RegExp>
    complete?: boolean
    issuer?: string | string[]
    jwtid?: string
    ignoreExpiration?: boolean
    ignoreNotBefore?: boolean
    subject?: string
    clockTolerance?: number
    maxAge?: string | number
    clockTimestamp?: number
    nonce?: string
    allowInvalidAsymmetricKeyTypes?: boolean
    [key: string]: unknown
  }

  export type SignCallback = (err: Error | null, encoded: string | undefined) => void
  export type VerifyCallback = (err: Error | null, decoded: unknown) => void

  export function sign(payload: string | Buffer | Record<string, unknown>, secretOrPrivateKey: string | Buffer, options?: SignOptions): string
  export function sign(payload: string | Buffer | Record<string, unknown>, secretOrPrivateKey: string | Buffer, callback: SignCallback): void
  export function sign(payload: string | Buffer | Record<string, unknown>, secretOrPrivateKey: string | Buffer, options: SignOptions, callback: SignCallback): void

  export function verify(token: string, secretOrPublicKey: string | Buffer, options?: VerifyOptions): unknown
  export function verify(token: string, secretOrPublicKey: string | Buffer, callback: VerifyCallback): void
  export function verify(token: string, secretOrPublicKey: string | Buffer, options: VerifyOptions, callback: VerifyCallback): void

  export function decode(token: string, options?: Record<string, unknown>): unknown

  const jwt: {
    sign: typeof sign
    verify: typeof verify
    decode: typeof decode
  }

  export default jwt
}
