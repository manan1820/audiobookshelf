/**
 * Handle timeouts greater than 32-bit signed integer
 */
class LongTimeout {
  timeout: number
  timer: NodeJS.Timeout | null

  constructor() {
    this.timeout = 0
    this.timer = null
  }

  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  set(fn: () => void, timeout: number): void {
    const maxValue = 2147483647

    const handleTimeout = (): void => {
      if (this.timeout > 0) {
        const delay = Math.min(this.timeout, maxValue)
        this.timeout = this.timeout - delay
        this.timer = setTimeout(handleTimeout, delay)
        return
      }
      fn()
    }

    this.timeout = timeout
    handleTimeout()
  }
}

export = LongTimeout
