declare module '*/libs/uaParser' {
  interface UaResult {
    browser?: {
      name?: string
      version?: string
    }
    os?: {
      name?: string
      version?: string
    }
    device?: {
      type?: string
      model?: string
      vendor?: string
    }
  }
  function uaParser(userAgent?: string | null): UaResult
  export default uaParser
  export = uaParser
}
