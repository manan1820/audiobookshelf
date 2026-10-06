import { rateLimit, RateLimitRequestHandler } from 'express-rate-limit'
import { RequestHandler, Request, Response } from 'express'
import Logger from '../Logger'
import * as requestIp from '../libs/requestIp'

/**
 * Factory for creating authentication rate limiters
 */
class RateLimiterFactory {
  static DEFAULT_WINDOW_MS = 10 * 60 * 1000 // 10 minutes
  static DEFAULT_MAX = 40 // 40 attempts

  private authRateLimiter: RateLimitRequestHandler | RequestHandler | null = null

  /**
   * Get the authentication rate limiter
   */
  getAuthRateLimiter(): RateLimitRequestHandler | RequestHandler {
    if (this.authRateLimiter) {
      return this.authRateLimiter
    }

    // Disable by setting max to 0
    if (process.env.RATE_LIMIT_AUTH_MAX === '0') {
      this.authRateLimiter = (_req, _res, next) => next()
      Logger.info(`[RateLimiterFactory] Authentication rate limiting disabled by ENV variable`)
      return this.authRateLimiter
    }

    let windowMs = RateLimiterFactory.DEFAULT_WINDOW_MS
    const envWindow = process.env.RATE_LIMIT_AUTH_WINDOW ? parseInt(process.env.RATE_LIMIT_AUTH_WINDOW) : 0
    if (envWindow > 0) {
      windowMs = envWindow
      if (windowMs !== RateLimiterFactory.DEFAULT_WINDOW_MS) {
        Logger.info(`[RateLimiterFactory] Authentication rate limiting window set to ${windowMs}ms by ENV variable`)
      }
    }

    let max = RateLimiterFactory.DEFAULT_MAX
    const envMax = process.env.RATE_LIMIT_AUTH_MAX ? parseInt(process.env.RATE_LIMIT_AUTH_MAX) : 0
    if (envMax > 0) {
      max = envMax
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
      keyGenerator: (req: Request) => {
        // Override keyGenerator to handle proxy IPs
        return requestIp.getClientIp(req) || req.ip || ''
      },
      handler: (req: Request, res: Response) => {
        const userAgent = req.get('User-Agent') || 'Unknown'
        const endpoint = req.path
        const method = req.method
        const ip = requestIp.getClientIp(req) || req.ip

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

export = new RateLimiterFactory()
