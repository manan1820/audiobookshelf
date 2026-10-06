declare module 'nodemailer' {
  export interface SendMailOptions {
    from?: string | null
    to?: string | null
    subject?: string
    text?: string
    html?: string
    attachments?: Array<{
      filename: string
      path: string
    }>
  }

  export interface SentMessageInfo {
    messageId?: string
    response?: string
    accepted?: string[]
    rejected?: string[]
    [key: string]: unknown
  }

  export interface Transporter {
    verify(): Promise<boolean>
    sendMail(options: SendMailOptions): Promise<SentMessageInfo>
  }

  export function createTransport(options: unknown): Transporter
}
