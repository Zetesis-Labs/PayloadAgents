# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.9.x   | :white_check_mark: |
| < 1.9   | :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in PayloadAgents, please report it responsibly.

### How to Report

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, please email us at: **security@zetesis.xyz**

Include the following in your report:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Any suggested fixes (optional)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 7 days
- **Resolution**: Depends on severity, typically 30-90 days

### What to Expect

1. We will acknowledge receipt of your report
2. We will investigate and validate the issue
3. We will work on a fix and coordinate disclosure
4. We will credit you in the security advisory (unless you prefer anonymity)

## Security Best Practices

When using PayloadAgents in production:

### Environment Variables

- Never commit `.env` files to version control
- Use secure secret management (e.g., Vault, AWS Secrets Manager)
- Rotate credentials regularly

### Authentication (Keycloak)

- Enable MFA for admin accounts
- Use strong password policies
- Regularly audit user permissions
- Set keycloak in production mode

### Stripe Integration

- Use webhook signature verification
- Keep API keys secure and rotate them periodically
- Use restricted API keys with minimal permissions

### Database

- Use encrypted connections (SSL/TLS)
- Regular backups with encryption
- Principle of least privilege for database users

### Typesense

- Use API key scoping
- Enable TLS for all connections
- Regularly rotate search-only and admin keys

## Dependencies

We regularly update dependencies to patch known vulnerabilities. Run `pnpm audit` to check for known issues.

## Contact

For security concerns: **ruben@zetesis.xyz**
