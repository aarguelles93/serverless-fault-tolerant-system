const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const STATUS = require("./constants/statuses");
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  for (const rec of event.Records || []) {
    try {
      const msg = JSON.parse(rec.body);
      console.error("DLQ item", {
        taskId: msg.taskId,
        payload: msg.payload,
        error: "Simulated processing failure after max retries",
        approxReceiveCount: rec.attributes?.ApproximateReceiveCount,
      });

      // Update DynamoDB record to mark as dead-letter
      try {
        await ddb.send(new UpdateCommand({
          TableName: process.env.TASKS_TABLE,
          Key: { taskId: msg.taskId },
          UpdateExpression: "SET #s = :s, dlqAt = :t, dlqReceiveCount = :rc",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { 
            ":s": STATUS.DEAD_LETTER, 
            ":t": new Date().toISOString(), 
            ":rc": Number(rec.attributes?.ApproximateReceiveCount || 0) 
        }
        }));
      } catch (e) {
        console.error("Failed to update DynamoDB for DLQ item", { taskId: msg.taskId, error: e.message });
      }
    } catch {
      console.error("Failed to parse DLQ item", rec.body);
    }
  }
  // Delete messages from DLQ
  return { batchItemFailures: [] };
};
