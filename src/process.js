const { SQSClient, ChangeMessageVisibilityCommand } = require("@aws-sdk/client-sqs");
const sqs = new SQSClient({});

function shouldFail() {
  // 30% failure
  return Math.random() < 0.3;
}

exports.handler = async (event) => {
  // Since batchSize=1 we expect only one record
  const record = event.Records?.[0];
  if (!record) return { batchItemFailures: [] };

  const { body, receiptHandle, attributes, _eventSourceARN } = record;
  const attempt = Number(attributes?.ApproximateReceiveCount || "1");
  const maxRetries = Number(process.env.MAX_RETRIES || "2");

  try {
    const parsed = JSON.parse(body);
    const { taskId, payload } = parsed;

    // Simulate processing with random failure
    if (shouldFail()) {
      throw new Error("Simulated processing failure");
    }

    console.log("Processed OK", { taskId, attempt, payload });
    //Lambda auto deletes the message from SQS
    return { batchItemFailures: [] };
  } catch (err) {
    const { taskId } = parsed || {};
    console.error(`Processing failed (attempt ${attempt})`, { taskId, error: err.message });

    // Exponential backoff only if we have retries left
    if (attempt < maxRetries) {
      // 10s, 20s... cap at 15min
      const delaySeconds = Math.min(Math.pow(2, attempt - 1) * 10, 900);
      try {
        // TASKS_QUEUE_URL from env vars
        await sqs.send(
          new ChangeMessageVisibilityCommand({
            QueueUrl: process.env.TASKS_QUEUE_URL,
            ReceiptHandle: receiptHandle,
            VisibilityTimeout: delaySeconds,
          })
        );
        console.log(`Backoff set to ${delaySeconds}s. Attempt #${attempt}`, { taskId });
      } catch (e) {
        console.error("Failed to change message visibility for backoff", { taskId, error: e.message });
      }
    }

    // Throw err to signal failure, so message is NOT deleted and will be retried or become DLQ by SQS redrive
    throw err;
  }
};
