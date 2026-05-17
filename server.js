import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import { Resend } from 'resend';
import { z } from 'zod';

const fastify = Fastify({ logger: true });
await fastify.register(helmet);

const resend = new Resend(process.env.RESEND_API_KEY);

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const TO_EMAIL = process.env.TO_EMAIL;
const FROM_EMAIL = process.env.FROM_EMAIL;

const OnboardingPayload = z.object({
  submission_id: z.string().min(1),
  client_name: z.string().min(1),
  client_type: z.string().min(1),
  contact_email: z.string().email(),
  report_markdown: z.string().min(1),
  metadata: z.record(z.any()).optional(),
});

const seen = new Set();

fastify.get('/health', async () => ({ ok: true }));

fastify.post('/onboarding', async (request, reply) => {
  const auth = request.headers['x-webhook-secret'];
  if (auth !== WEBHOOK_SECRET) {
    return reply.code(401).send({ error: 'unauthorized' });
  }

  const parsed = OnboardingPayload.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'invalid payload', issues: parsed.error.issues });
  }

  const data = parsed.data;

  if (seen.has(data.submission_id)) {
    return reply.code(200).send({ status: 'duplicate', submission_id: data.submission_id });
  }

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      subject: `New onboarding: ${data.client_name} (${data.client_type})`,
      text: data.report_markdown,
    });

    seen.add(data.submission_id);
    return reply.code(200).send({ status: 'sent', submission_id: data.submission_id });
  } catch (err) {
    request.log.error(err);
    return reply.code(500).send({ error: 'send_failed', detail: err.message });
  }
});

const port = Number(process.env.PORT) || 3000;
await fastify.listen({ port, host: '0.0.0.0' });
