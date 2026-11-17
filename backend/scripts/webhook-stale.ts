import {
  createWebhookBody,
  postWebhook,
} from './webhook-common';

async function main(): Promise<void> {
  const paidBody = createWebhookBody('PAID', 3);
  const olderViewedBody = createWebhookBody('VIEWED', 2, {
    externalId: paidBody.externalId,
  });

  console.log(
    'Posting PAID sequence 3, then the older VIEWED sequence 2. Expect the invoice to stay paid.',
  );

  console.log('Delivery 1: PAID sequence 3');
  const paid = await postWebhook(paidBody);

  if (paid.status !== 200) {
    throw new Error(`PAID delivery failed with HTTP ${paid.status}`);
  }

  console.log('Delivery 2: older VIEWED sequence 2');
  const viewed = await postWebhook(olderViewedBody);

  if (viewed.status !== 200) {
    throw new Error(
      `VIEWED delivery failed with HTTP ${viewed.status}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error('[webhook-stale] Failed:', error);
  process.exitCode = 1;
});
