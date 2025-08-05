# Structured Logging Implementation

This document describes the comprehensive structured logging system implemented in the Zentavos backend, following the Cursor Rules for error handling and observability.

## Overview

The structured logging system ensures every error and external integration interaction (especially Plaid) is logged with full context, in clearly delimited blocks, without breaking application flow.

## Key Features

### 1. Structured Error Blocks
Every error is logged as a self-contained, structured block with:
- Clear delimiters (`=== ERROR BLOCK START ===` / `=== ERROR BLOCK END ===`)
- ISO8601 timestamps
- Full request/response context
- Error classification
- Fallback tracking
- Duration metrics

### 2. Request Context Capture
Automatic capture of:
- HTTP method, URL, route params, query params
- Sanitized headers (sensitive values redacted)
- Request body (sensitive fields redacted)
- Response status, headers, and body

### 3. Error Classification
Automatic classification of errors into categories:
- `decryption_failure` - Encryption/decryption errors
- `non_fatal_api_error` - Known non-fatal API errors
- `authentication_required` - Authentication/authorization errors
- `retryable_error` - Network or temporary errors
- `network_error` - Connection issues
- `validation_error` - Input validation errors
- `webhook_processing_error` - Webhook-specific errors

### 4. Encryption Resilience
- Key versioning with fallback to previous versions
- Automatic retry with different key versions
- Comprehensive logging of encryption operations
- Graceful handling of corrupted data

## Implementation Components

### 1. StructuredLogger (`lib/structuredLogger.js`)
Main logging class providing:
- Error block formatting
- Request context management
- Error classification
- Retry mechanisms
- Report generation

### 2. Middleware (`middlewares/structuredLogging.js`)
Express middleware for:
- Automatic request context capture
- Response logging
- Error handling
- Cleanup operations

### 3. Encryption Helper (`lib/encryptionHelper.js`)
Specialized helper for:
- Decryption with fallback key versions
- Encryption with logging
- Key health validation
- Key rotation tracking

## Usage Examples

### Basic Error Logging
```javascript
import structuredLogger from '../lib/structuredLogger.js';

try {
  // Your operation
} catch (error) {
  structuredLogger.logErrorBlock(error, {
    operation: 'updateLiabilities',
    item_id: 'item_123',
    user_id: 'user_456',
    plaid_request_id: 'plaid_req_789'
  });
}
```

### Context Wrapper
```javascript
const result = await structuredLogger.withContext('operationName', {
  user_id: uid,
  item_id: itemId,
  metadata: { additional: 'context' }
}, async () => {
  return await yourAsyncOperation();
});
```

### Retry with Exponential Backoff
```javascript
const result = await structuredLogger.withRetry('operationName', {
  user_id: uid
}, async () => {
  return await yourAsyncOperation();
}, 3); // max 3 retries
```

### Encryption with Fallback
```javascript
import EncryptionHelper from '../lib/encryptionHelper.js';

const decryptedValue = await EncryptionHelper.decryptWithFallback(
  cipherText,
  userId,
  { context: 'additional info' }
);
```

## Error Block Format

```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "operation": "updateLiabilities",
  "item_id": "item_123",
  "plaid_request_id": "plaid_req_789",
  "encryption_key_version": "v2",
  "user_id": "user_456",
  "request": {
    "method": "POST",
    "url": "/api/plaid/webhook",
    "headers": { "content-type": "application/json" },
    "body": { "webhook_type": "TRANSACTIONS" }
  },
  "response": {
    "statusCode": 500,
    "headers": {},
    "body": null
  },
  "error": {
    "name": "Error",
    "message": "Decryption failed",
    "stack": "Error: Decryption failed..."
  },
  "fallbacks_triggered": ["retry-with-previous-key"],
  "error_classification": "decryption_failure",
  "durationMs": 1500,
  "metadata": {
    "retry_attempt": 2,
    "error_count": 5
  }
}
```

## Configuration

### Environment Variables
- `PLAID_WEBHOOK_SECRET` - For webhook signature validation
- `PLAID_CLIENT_ID` - Plaid client identifier
- `PLAID_SECRET` - Plaid secret key

### Middleware Setup
The structured logging middleware is automatically applied in `app.js`:
```javascript
import { structuredLoggingMiddleware, errorHandlingMiddleware } from './middlewares/structuredLogging.js';

app.use(structuredLoggingMiddleware);
app.use(errorHandlingMiddleware);
```

## Testing

Run the structured logging tests:
```bash
npm test -- --testPathPattern=structured-logging.test.js
```

The tests validate:
- Error block formatting
- Error classification
- Context wrapper functionality
- Request sanitization
- Retry mechanisms
- Report generation
- Cleanup operations

## Monitoring and Reporting

### Error Reports
Generate comprehensive error reports:
```javascript
const report = structuredLogger.generateErrorReport();
console.log(JSON.stringify(report, null, 2));
```

### Health Checks
Monitor encryption key health:
```javascript
const health = await EncryptionHelper.validateKeyHealth(userId);
```

### Metrics
Track operation metrics:
```javascript
const metrics = structuredLogger.getErrorClassifications();
```

## Best Practices

### 1. Always Use Context
Provide rich context for better debugging:
```javascript
structuredLogger.logErrorBlock(error, {
  operation: 'specificOperation',
  item_id: itemId,
  user_id: userId,
  plaid_request_id: requestId,
  metadata: { additional: 'context' }
});
```

### 2. Handle Non-Fatal Errors Gracefully
```javascript
if (error.message.includes('PRODUCTS_NOT_SUPPORTED')) {
  structuredLogger.logErrorBlock(error, {
    operation: 'updateLiabilities',
    error_classification: 'non_fatal_api_error'
  });
  // Continue processing other items
  return;
}
```

### 3. Use Retry Mechanisms
```javascript
const result = await structuredLogger.withRetry('apiCall', context, async () => {
  return await externalApiCall();
}, 3);
```

### 4. Validate Item Status
```javascript
const itemStatus = await validateItemStatus(itemId, accessToken);
if (itemStatus === 'ITEM_LOGIN_REQUIRED') {
  // Handle gracefully, don't crash
}
```

## Troubleshooting

### Common Issues

1. **Missing Error Context**
   - Ensure all error logging includes operation name
   - Provide item_id and user_id when available

2. **Sensitive Data Exposure**
   - Check that headers and body are properly sanitized
   - Verify no tokens or secrets are logged

3. **Performance Impact**
   - Monitor logging overhead
   - Use cleanup operations to prevent memory leaks

4. **Encryption Failures**
   - Check key version compatibility
   - Verify fallback mechanisms are working

### Debug Mode
Enable detailed logging for debugging:
```javascript
// In development
process.env.DEBUG_LOGGING = 'true';
```

## Integration with External Services

### Plaid Integration
- Automatic webhook signature validation
- Request/response logging for all API calls
- Error classification for Plaid-specific errors
- Fallback polling for missed webhooks

### Database Operations
- Transaction logging
- Connection error handling
- Query performance tracking

### File Operations
- Upload/download logging
- Storage error handling
- File validation errors

## Future Enhancements

1. **Log Aggregation**
   - Integration with external log aggregation services
   - Structured log shipping

2. **Alerting**
   - Automated alerts for critical errors
   - Error rate monitoring

3. **Performance Metrics**
   - Response time tracking
   - Throughput monitoring

4. **User Experience**
   - Error reporting to users
   - Recovery suggestions

## Compliance

This implementation follows:
- Cursor Rules for structured error logging
- Security best practices for data sanitization
- Observability standards for production systems
- Error handling resilience patterns 