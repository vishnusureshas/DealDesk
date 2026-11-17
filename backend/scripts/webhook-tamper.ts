import {
  createWebhookBody,
  postWebhook,
} from './webhook-common';

async function main(): Promise<void> {
  const body = createWebhookBody('PAID', 1);

  console.log(
    'Posting PAID with a tampered signature. Expect HTTP 401 and no state change.',
  );

  const result = await postWebhook(body, { tampered: true });

  if (result.status !== 401) {
    throw new Error(
      `Expected HTTP 401, received ${result.status}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error('[webhook-tamper] Failed:', error);
  process.exitCode = 1;
});
