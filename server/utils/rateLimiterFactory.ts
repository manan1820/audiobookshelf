import { rateLimit, RateLimitRequestHandler } from 'express-rate-limit'
import type { Request, Response, NextFunction } from 'express'
import Logger from '../Logger'
import requestIp from '../libs/requestIp'

/**
 * Factory for creating authentication rate limiters
 */
class RateLimiterFactory {
  static readonly DEFAULT_WINDOW_MS = 10 * 60 * 1000 // 10 minutes
  static readonly DEFAULT_MAX = 40 // 40 attempts

  authRateLimiter: RateLimitRequestHandler | ((req: Request, res: Response, next: NextFunction) => void) | null

  constructor() {
    this.authRateLimiter = null
  }

  /**
   * Get the authentication rate limiter
   */
  getAuthRateLimiter(): RateLimitRequestHandler | ((req: Request, res: Response, next: NextFunction) => void) {
    if (this.authRateLimiter) {
      return this.authRateLimiter
    }

    // Disable by setting max to 0
    if (process.env.RATE_LIMIT_AUTH_MAX === '0') {
      this.authRateLimiter = (_req: Request, _res: Response, next: NextFunction): void => next()
      Logger.info('[RateLimiterFactory] Authentication rate limiting disabled by ENV variable')
      return this.authRateLimiter
    }

    let windowMs = RateLimiterFactory.DEFAULT_WINDOW_MS
    const envWindow = process.env.RATE_LIMIT_AUTH_WINDOW
    if (envWindow && parseInt(envWindow) > 0) {
      windowMs = parseInt(envWindow)
      if (windowMs !== RateLimiterFactory.DEFAULT_WINDOW_MS) {
        Logger.info(`[RateLimiterFactory] Authentication rate limiting window set to ${windowMs}ms by ENV variable`)
      }
    }

    let max = RateLimiterFactory.DEFAULT_MAX
    const envMax = process.env.RATE_LIMIT_AUTH_MAX
    if (envMax && parseInt(envMax) > 0) {
      max = parseInt(envMax)
      if (max !== RateLimiterFactory.DEFAULT_MAX) {
        Logger.info(`[RateLimiterFactory] Authentication rate limiting max set to ${max} by ENV variable`)
      }
    }

    let message = 'Too many authentication requests'
    if (process.env.RATE_LIMIT_AUTH_MESSAGE) {
      message = process.env.RATE_LIMIT_AUTH_MESSAGE
    }

    this.authRateLimiter = rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: Request): string => {
        // Override keyGenerator to handle proxy IPs
        return requestIp.getClientIp(req) || req.ip || ''
      },
      handler: (req: Request, res: Response): void => {
        const userAgent = req.get('User-Agent') || 'Unknown'
        const endpoint = req.path
        const method = req.method
        const ip = requestIp.getClientIp(req) || req.ip || ''

        Logger.warn(`[RateLimiter] Rate limit exceeded - IP: ${ip}, Endpoint: ${method} ${endpoint}, User-Agent: ${userAgent}`)

        res.status(429).json({
          error: message
        })
      }
    })

    Logger.debug(`[RateLimiterFactory] Created auth rate limiter: ${max} attempts per ${windowMs / 1000 / 60} minutes`)

    return this.authRateLimiter
  }
}

const rateLimiterFactory = new RateLimiterFactory()
export = rateLimiterFactory
