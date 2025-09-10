const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const sqs = new SQSClient({});

exports.handler = async (event) => {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {};
    const { taskId, payload } = body || {};
    if (!taskId || typeof taskId !== "string") {
      return { statusCode: 400, body: JSON.stringify({ message: "taskId (string) is required" }) };
    }

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
