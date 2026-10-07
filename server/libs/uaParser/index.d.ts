export interface UaResult {
  browser: { name?: string; version?: string; major?: string }
  device: { model?: string; type?: string; vendor?: string }
  os: { name?: string; version?: string }
  cpu: { architecture?: string }
  engine: { name?: string; version?: string }
  ua: string
  [key: string]: unknown
}

declare function uaParserJs(uastring?: string | null): UaResult

export default uaParserJs
export = uaParserJs
