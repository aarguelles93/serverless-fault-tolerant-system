const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const STATUS = require("./constants/statuses");

const sqs = new SQSClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {};
    const { taskId, payload } = body || {};
    if (!taskId || typeof taskId !== "string") {
      return { statusCode: 400, body: JSON.stringify({ message: "taskId (string) is required" }) };
    }

    const now = new Date().toISOString();
    // Write initial record to DynamoDB with status 'pending'
    await ddb.send(
      new PutCommand({
        TableName: process.env.TASKS_TABLE,
        Item: {
          taskId,
          payload: payload ?? {},
          status: STATUS.PENDING,
          createdAt: now
        }
      })
    );

    const messageBody = JSON.stringify({ taskId, payload: payload ?? {} });
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: process.env.TASKS_QUEUE_URL,
        MessageBody: messageBody
      })
    );

    return { statusCode: 202, body: JSON.stringify({ message: "Task accepted", taskId }) };
  } catch (err) {
    console.error("submitTask error", err);
    return { statusCode: 500, body: JSON.stringify({ message: "Internal error" }) };
  }
};
