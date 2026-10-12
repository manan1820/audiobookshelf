import uaParserJs from '../../libs/uaParser'

interface ParsedUserAgent {
  browserName?: string
  browserVersion?: string
  osName?: string
  osVersion?: string
  deviceType?: string
  model?: string
  vendor?: string
}

function parseUserAgent(userAgent?: string | null): ParsedUserAgent | null {
  if (!userAgent) return null

  const ua = uaParserJs(userAgent)
  const deviceInfo: ParsedUserAgent = {
    browserName: ua?.browser?.name || undefined,
    browserVersion: ua?.browser?.version || undefined,
    osName: ua?.os?.name || undefined,
    osVersion: ua?.os?.version || undefined,
    deviceType: ua?.device?.type || undefined,
    model: ua?.device?.model || undefined,
    vendor: ua?.device?.vendor || undefined
  }

  const record = deviceInfo as { [key: string]: string | undefined }
  for (const key in record) {
    if (record[key] === undefined) delete record[key]
  }

  return Object.keys(deviceInfo).length ? deviceInfo : null
}

export = parseUserAgent
