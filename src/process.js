const { SQSClient, ChangeMessageVisibilityCommand } = require("@aws-sdk/client-sqs");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const STATUS = require("./constants/statuses");
const sqs = new SQSClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    console.error("Failed to parse message body", e);
    throw e;
  }

  const { taskId, payload } = parsed;

  // Update status => processing
  try {
    await ddb.send(new UpdateCommand({
      TableName: process.env.TASKS_TABLE,
      Key: { taskId },
      UpdateExpression: "SET #s = :s, lastAttemptAt = :t, attempts = if_not_exists(attempts, :zero) + :inc",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":s": STATUS.PROCESSING, ":t": new Date().toISOString(), ":inc": 1, ":zero": 0 }
    }));
  } catch (e) {
    console.error("Failed to update DynamoDB to processing", { taskId, error: e.message });
    // Continue processing even if status update failed
  }

  try {
    // Simulate processing with random failure
    if (shouldFail()) {
      throw new Error("Simulated processing failure");
    }

    console.log("Processed OK", { taskId, attempt, payload });

    // Update status => success
    try {
      await ddb.send(new UpdateCommand({
        TableName: process.env.TASKS_TABLE,
        Key: { taskId },
        UpdateExpression: "SET #s = :s, completedAt = :t",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": STATUS.SUCCESS, ":t": new Date().toISOString() }
      }));
    } catch (e) {
      console.error("Failed to update DynamoDB to success", { taskId, error: e.message });
    }

    //Lambda auto deletes the message from SQS
    return { batchItemFailures: [] };
  } catch (err) {
    console.error(`Processing failed (attempt ${attempt})`, { taskId, error: err.message });

    // Update status => failed
    try {
      await ddb.send(new UpdateCommand({
        TableName: process.env.TASKS_TABLE,
        Key: { taskId },
        UpdateExpression: "SET #s = :s, lastError = :err, lastAttemptAt = :t",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":s": STATUS.FAILED, ":err": err.message, ":t": new Date().toISOString() }
      }));
    } catch (e) {
      console.error("Failed to update DynamoDB on failure", { taskId, error: e.message });
    }

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
