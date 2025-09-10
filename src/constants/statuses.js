const STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  FAILED: 'failed',
  DEAD_LETTER: 'dead-letter'
});

module.exports = STATUS;
