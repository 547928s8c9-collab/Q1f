# Security Guidelines

## Dependency Security

### Regular Security Audits

Run security audits regularly to check for known vulnerabilities:

```bash
npm run check:security
```

Or manually:

```bash
npm audit
```

### Fixing Vulnerabilities

1. **Automatic fixes** (non-breaking):
   ```bash
   npm audit fix
   ```

2. **Manual review** (for breaking changes):
   - Review the vulnerability report
   - Check package changelogs
   - Update dependencies manually
   - Test thoroughly after updates

### Security Best Practices

1. **Keep dependencies updated**: Regularly update dependencies to latest secure versions
2. **Review dependency changes**: Use `package-lock.json` to track exact versions
3. **Monitor security advisories**: Subscribe to security alerts for critical dependencies
4. **Use automated tools**: Consider integrating Dependabot or Snyk for automated security scanning

## Environment Variables

### Required for Production

- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Secret for session encryption
- `TWOFA_ENCRYPTION_KEY`: Encryption key for 2FA secrets (32 bytes, hex or base64)
- `TELEGRAM_BOT_TOKEN`: Telegram bot token (if Telegram features enabled)
- `TELEGRAM_JWT_SECRET`: Secret for Telegram JWT verification
- `METRICS_SECRET`: Secret for metrics endpoint access

### Security Considerations

- Never commit `.env` files to version control
- Use strong, randomly generated secrets
- Rotate secrets periodically
- Use different secrets for different environments
- Store secrets securely (use secret management services in production)

## API Security

### Rate Limiting

The application implements rate limiting for:
- Authentication endpoints: 20 requests/minute
- General API: 120 requests/minute
- Market data: 60 requests/minute
- Metrics: 10 requests/minute

### Input Validation

- All inputs are validated using Zod schemas
- Amounts are validated as positive integers (minor units)
- Addresses are validated for format and length
- SQL injection protection via Drizzle ORM parameterized queries

### Idempotency

All money-related endpoints support idempotency keys to prevent duplicate transactions:
- Deposit operations
- Withdrawal operations
- Investment operations
- Vault transfers

## Error Handling

- Internal errors are not exposed to clients in production
- Stack traces are only logged in development
- Structured logging with request IDs for traceability
- Sensitive data (wallet addresses, secrets) excluded from logs

## Two-Factor Authentication

- 2FA secrets are encrypted at rest using AES-256-GCM
- Rate limiting should be implemented for 2FA verification (TODO)
- Secrets are bound to user IDs for integrity

## Database Security

- Use parameterized queries (Drizzle ORM)
- Connection pooling with limits
- Transaction isolation for critical operations
- Regular backups

## Monitoring

- Monitor for suspicious activity patterns
- Track failed authentication attempts
- Monitor for unusual transaction patterns
- Set up alerts for critical errors
