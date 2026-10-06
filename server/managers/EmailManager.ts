import nodemailer, { Transporter } from 'nodemailer'
import type { Response } from 'express'
import Database from '../Database'
import Logger from '../Logger'
import type { EreaderDeviceObject } from '../types'

interface EbookFileLike {
  metadata: {
    filename: string
    path: string
  }
}

class EmailManager {
  constructor() {}

  getTransporter(): Transporter {
    return nodemailer.createTransport(Database.emailSettings.getTransportObject())
  }

  async sendTest(res: Response): Promise<Response | void> {
    Logger.info(`[EmailManager] Sending test email`)
    const transporter = this.getTransporter()

    const success = await transporter.verify().catch((error: unknown) => {
      Logger.error(`[EmailManager] Failed to verify SMTP connection config`, error)
      return false
    })

    if (!success) {
      return res.status(400).send('Failed to verify SMTP connection configuration')
    }

    transporter
      .sendMail({
        from: Database.emailSettings.fromAddress,
        to: Database.emailSettings.testAddress || Database.emailSettings.fromAddress,
        subject: 'Test email from Audiobookshelf',
        text: 'Success!'
      })
      .then((result) => {
        Logger.info(`[EmailManager] Test email sent successfully`, result)
        res.sendStatus(200)
      })
      .catch((error: unknown) => {
        Logger.error(`[EmailManager] Failed to send test email`, error)
        const errorMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Failed to send test email'
        res.status(400).send(errorMessage)
      })
  }

  async sendEBookToDevice(ebookFile: EbookFileLike, device: EreaderDeviceObject, res: Response): Promise<Response | void> {
    Logger.info(`[EmailManager] Sending ebook "${ebookFile.metadata.filename}" to device "${device.name}"/"${device.email}"`)
    const transporter = this.getTransporter()

    const success = await transporter.verify().catch((error: unknown) => {
      Logger.error(`[EmailManager] Failed to verify SMTP connection config`, error)
      return false
    })

    if (!success) {
      return res.status(400).send('Failed to verify SMTP connection configuration')
    }

    transporter
      .sendMail({
        from: Database.emailSettings.fromAddress,
        to: device.email,
        subject: 'Here is your Ebook!',
        html: '<div dir="auto"></div>',
        attachments: [
          {
            filename: ebookFile.metadata.filename,
            path: ebookFile.metadata.path
          }
        ]
      })
      .then((result) => {
        Logger.info(`[EmailManager] Ebook sent to device successfully`, result)
        res.sendStatus(200)
      })
      .catch((error: unknown) => {
        Logger.error(`[EmailManager] Failed to send ebook to device`, error)
        const errorMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Failed to send ebook to device'
        res.status(400).send(errorMessage)
      })
  }
}

export = EmailManager
