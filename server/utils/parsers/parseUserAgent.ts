import uaParserJs from '../../libs/uaParser'
import type { ParsedDeviceInfo } from '../../types'

function parseUserAgent(userAgent: string | null | undefined): ParsedDeviceInfo | null {
  if (!userAgent) return null

  const ua = uaParserJs(userAgent)
  const deviceInfo: ParsedDeviceInfo = {
    browserName: ua?.browser?.name || undefined,
    browserVersion: ua?.browser?.version || undefined,
    osName: ua?.os?.name || undefined,
    osVersion: ua?.os?.version || undefined,
    deviceType: ua?.device?.type || undefined,
    model: ua?.device?.model || undefined,
    vendor: ua?.device?.vendor || undefined
  }

  let hasKeys = false
  const keys = Object.keys(deviceInfo) as (keyof ParsedDeviceInfo)[]
  for (const key of keys) {
    if (deviceInfo[key] === undefined) {
      delete deviceInfo[key]
    } else {
      hasKeys = true
    }
  }

  return hasKeys ? deviceInfo : null
}

export = parseUserAgent
