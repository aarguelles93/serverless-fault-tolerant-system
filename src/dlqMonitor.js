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
    } catch {
      console.error("Failed to parse DLQ item", rec.body);
    }
  }
  // Delete messages from DLQ
  return { batchItemFailures: [] };
};
