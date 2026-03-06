/**
 * Serviço de e-mail transacional via Amazon SES (AWS SDK)
 * Não usa SMTP — usa API oficial da AWS
 */
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'no-reply@varvos.com';
const AWS_REGION = process.env.AWS_REGION || 'eu-north-1';

let sesClient = null;

function getSesClient() {
  if (!sesClient) {
    const accessKey = process.env.AWS_ACCESS_KEY_ID;
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (!accessKey || !secretKey) {
      return null;
    }
    sesClient = new SESClient({
      region: AWS_REGION,
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
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
export async function sendEmail({ to, subject, html, text }) {
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

  try {
    const command = new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: body,
      },
    });

    const response = await client.send(command);
    const messageId = response.MessageId;

    return { success: true, messageId };
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
