import {
  createWebhookBody,
  postWebhook,
} from './webhook-common';

async function main(): Promise<void> {
  const body = createWebhookBody('PAID', 3);

  console.log(
    'Posting the same PAID webhook three times. Expect one applied event and two duplicate_ignored logs.',
  );

  for (let copy = 1; copy <= 3; copy += 1) {
    console.log(`Delivery ${copy}/3`);
    const result = await postWebhook(body);

    if (result.status !== 200) {
      throw new Error(
        `Delivery ${copy} failed with HTTP ${result.status}`,
      );
    }
  }
}

main().catch((error: unknown) => {
  console.error('[webhook-duplicate] Failed:', error);
  process.exitCode = 1;
});
