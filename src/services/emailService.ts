import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendPasswordResetEmail(to: string, code: string) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@potecheio.site',
    to,
    subject: 'Recuperação de senha — Pote Cheio',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Recuperação de senha</h2>
        <p>Use o código abaixo para redefinir sua senha. Ele expira em <strong>15 minutos</strong>.</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px 0">${code}</div>
        <p style="color:#888;font-size:13px">Se você não solicitou isso, ignore este e-mail.</p>
      </div>
    `,
  })
}
