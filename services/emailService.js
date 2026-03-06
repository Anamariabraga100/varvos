/**
 * Serviço centralizado de e-mail transacional via Amazon SES (AWS SDK)
 * Não usa SMTP — usa API oficial da AWS
 *
 * Remetentes preparados (domínio @varvos.com):
 * - no-reply@varvos.com (padrão)
 * - support@varvos.com
 * - billing@varvos.com
 */
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ALLOWED_DOMAIN = 'varvos.com';
const DEFAULT_FROM = 'no-reply@varvos.com';

/** Remetentes permitidos — apenas @varvos.com */
export const EMAIL_SENDERS = {
  NO_REPLY: 'no-reply@varvos.com',
  SUPPORT: 'support@varvos.com',
  BILLING: 'billing@varvos.com',
};

function getFromEmail(override) {
  const env = process.env.EMAIL_FROM || process.env.SES_FROM_EMAIL || DEFAULT_FROM;
  const from = (override || env || DEFAULT_FROM).trim().toLowerCase();
  if (!from.endsWith(`@${ALLOWED_DOMAIN}`)) {
    console.warn('[emailService] Remetente deve ser @varvos.com. Usando padrão.');
    return DEFAULT_FROM;
  }
  return from;
}

let sesClient = null;

function getSesClient() {
  if (!sesClient) {
    const accessKey = process.env.AWS_ACCESS_KEY_ID;
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || 'eu-north-1';
    if (!accessKey || !secretKey) {
      return null;
    }
    sesClient = new SESClient({
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
    });
  }
  return sesClient;
}

/**
 * Envia e-mail via Amazon SES
 * @param {Object} params
 * @param {string} params.to - Destinatário
 * @param {string} params.subject - Assunto
 * @param {string} [params.html] - Corpo HTML
 * @param {string} [params.text] - Corpo texto puro (fallback)
 * @param {string} [params.from] - Remetente (opcional, usa EMAIL_FROM por padrão; deve ser @varvos.com)
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
export async function sendEmail({ to, subject, html, text, from }) {
  if (!to || !subject) {
    return { success: false, error: 'to e subject são obrigatórios' };
  }

  const client = getSesClient();
  if (!client) {
    console.warn('[emailService] AWS SES não configurado (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY). E-mail não enviado.');
    return { success: false, error: 'SES não configurado' };
  }

  const body = {};
  if (html) body.Html = { Data: html, Charset: 'UTF-8' };
  if (text) body.Text = { Data: text, Charset: 'UTF-8' };
  if (!body.Html && !body.Text) {
    return { success: false, error: 'html ou text é obrigatório' };
  }

  const source = getFromEmail(from);

  try {
    const command = new SendEmailCommand({
      Source: source,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: body,
      },
    });

    const response = await client.send(command);
    return { success: true, messageId: response.MessageId };
  } catch (err) {
    const errorMsg = err?.message || String(err);
    console.error('[emailService] Falha ao enviar e-mail:', {
      to,
      subject: subject?.substring(0, 50),
      error: errorMsg,
    });
    return { success: false, error: errorMsg };
  }
}
