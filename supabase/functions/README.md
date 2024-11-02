# Supabase Edge Functions

This directory contains Supabase Edge Functions for handling backend operations.

## Sync Function

The sync function handles data synchronization operations with proper validation and error handling.

### Features

- JWT token validation
- Data validation
- Secure database operations
- Batch operation support
- User isolation
- Comprehensive error handling

### Deployment

1. Deploy the function to Supabase:
```bash
supabase functions deploy sync
```

2. Set required secrets:
```bash
supabase secrets set PROJECT_URL=your_project_url
supabase secrets set SERVICE_ROLE_KEY=your_service_role_key
```

### Usage

The function expects a POST request with the following structure:

```typescript
interface SyncOperation {
  table: string;    // Table name
  id: string;       // Record ID
  op: 'PUT' | 'PATCH' | 'DELETE';  // Operation type
  opData?: Record<string, any>;    // Data for PUT/PATCH operations
}

// Request body
{
  operations: SyncOperation[]
}
```

The function will return:

```typescript
// Success response
{
  success: true,
  results: Array<{
    success: true,
    operation: SyncOperation
  }>
}

// Error response
{
  success: false,
  error: string
}
```

### Security

- All operations require a valid JWT token
- User isolation is enforced through user_id checks
- Table names are validated to prevent SQL injection
- Sensitive fields (created_at, user_id) are protected
