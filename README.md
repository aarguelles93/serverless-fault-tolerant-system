# Serverless Fault-Tolerant Task Processing System

## Overview

This project is a fault-tolerant and event driven backend system built on AWS, designed to reliably process tasks that includes failure handling and retry logic.  
It implements async task submission, processing, retry with exponential backoff, and dead-letter queue monitoring.

## Solution Architecture And Services Used

- **API Gateway**: Receives HTTP POST requests to submit new tasks.
- **submitTask Lambda**: Validates and sends tasks to an SQS queue.
- **SQS Task Queue**: Buffers tasks for asynchronous processing.
- **processTask Lambda**: Consumes tasks, simulates random failures (30%), applies exponential backoff retry logic, and allows unprocessable tasks to flow to the DLQ.
- **DLQ (Dead-Letter Queue)**: Stores tasks that failed after max retries.
- **dlqMonitor Lambda**: Logs failed tasks from the DLQ to CloudWatch for monitoring.
- **AWS CloudWatch**: Monitoring of the processes logs.

## Parameters & Environment

- **TASKS_QUEUE_URL**: SQS Task Queue URL
- **DLQ_URL**: SQS DLQ Queue URL
- **MAX_RETRIES**: No. of max retries before moving message to DLQ (default: 2)

## Deployment

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Deploy with Serverless:**
 - set your AWS profile/region as needed
   ```bash
   npm run sls:deploy
   ```

## Usage & Testing

- **Submit a task:**
  ```bash
  curl -X POST <API_URL>/tasks \
    -H 'Content-Type: application/json' \
    -d '{"taskId":"test123","payload":{"foo":"bar"}}'
  ```

- **Behavior:**
  - Each task has a 30% chance to fail processing (simulated).
  - Failed tasks are retried with exponential backoff (10s, then 20s).
  - After `MAX_RETRIES`, tasks are moved to the DLQ.
  - DLQ tasks are logged to CloudWatch by the `dlqMonitor` Lambda.

## Assumptions
- Client provides `taskId`.
