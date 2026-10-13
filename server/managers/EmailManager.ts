import type { Response } from 'express'
import nodemailer, { Transporter } from 'nodemailer'
import Database from '../Database'
import Logger from '../Logger'
import type { EBookFileObject, EreaderDeviceObject } from '../types'

class EmailManager {
  getTransporter(): Transporter | null {
    if (!Database.emailSettings) return null
    return nodemailer.createTransport(Database.emailSettings.getTransportObject())
  }

  async sendTest(res: Response): Promise<Response | void> {
    Logger.info('[EmailManager] Sending test email')
    const emailSettings = Database.emailSettings
    if (!emailSettings) {
      return res.status(500).send('Email settings not configured')
    }
    const transporter = this.getTransporter()
    if (!transporter) {
      return res.status(500).send('Failed to initialize email transporter')
    }

    const success = await transporter.verify().catch((error: unknown) => {
      Logger.error('[EmailManager] Failed to verify SMTP connection config', error)
      return false
    })

    if (!success) {
      return res.status(400).send('Failed to verify SMTP connection configuration')
    }

    return transporter
      .sendMail({
        from: emailSettings.fromAddress ?? undefined,
        to: emailSettings.testAddress || emailSettings.fromAddress || undefined,
        subject: 'Test email from Audiobookshelf',
        text: 'Success!'
      })
      .then((result) => {
        Logger.info('[EmailManager] Test email sent successfully', result)
        res.sendStatus(200)
      })
      .catch((error: unknown) => {
        Logger.error('[EmailManager] Failed to send test email', error)
        const errMsg = error instanceof Error ? error.message : 'Failed to send test email'
        res.status(400).send(errMsg)
      })
  }

  async sendEBookToDevice(
    ebookFile: EBookFileObject,
    device: EreaderDeviceObject,
    res: Response
  ): Promise<Response | void> {
    Logger.info(`[EmailManager] Sending ebook "${ebookFile.metadata.filename}" to device "${device.name}"/"${device.email}"`)
    const emailSettings = Database.emailSettings
    if (!emailSettings) {
      return res.status(500).send('Email settings not configured')
    }
    const transporter = this.getTransporter()
    if (!transporter) {
      return res.status(500).send('Failed to initialize email transporter')
    }

    const success = await transporter.verify().catch((error: unknown) => {
      Logger.error('[EmailManager] Failed to verify SMTP connection config', error)
      return false
    })

    if (!success) {
      return res.status(400).send('Failed to verify SMTP connection configuration')
    }

    return transporter
      .sendMail({
        from: emailSettings.fromAddress ?? undefined,
        to: device.email,
        subject: 'Here is your Ebook!',
        html: '<div dir="auto"></div>',
        attachments: [
          {
            filename: ebookFile.metadata.filename ?? undefined,
            path: ebookFile.metadata.path ?? undefined
          }
        ]
      })
      .then((result) => {
        Logger.info('[EmailManager] Ebook sent to device successfully', result)
        res.sendStatus(200)
      })
      .catch((error: unknown) => {
        Logger.error('[EmailManager] Failed to send ebook to device', error)
        const errMsg = error instanceof Error ? error.message : 'Failed to send ebook to device'
        res.status(400).send(errMsg)
      })
  }
}

namespace EmailManager {
  export type EmailManagerInstance = EmailManager
}

export = EmailManager
