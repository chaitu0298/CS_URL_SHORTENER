# LinkForge — React frontend for the AWS URL Shortener

A React 18 + Vite dashboard connected to the **existing** AWS-ready Node.js or Spring Boot URL shortener backend. This is a real API client, not an HTML mockup.

## What's included

- Cognito Hosted UI sign-up/sign-in, OAuth 2.0 authorization-code **PKCE** flow, CSRF state verification, short-lived access token refresh, sign out.
- Create short links with custom aliases and expiry presets (24 hours, 7/30/90 days) or an exact date/time (converted to UTC).
- List your links, search/filter the current page, page through results, copy short URLs, revoke links.
- Per-link click analytics, unique visitor counts, and daily click chart.
- Authenticated ownership: the backend scopes the management APIs to the Cognito user subject. The redirect API remains public.
- Responsive layout for desktop and mobile; no AWS keys, secret keys, or passwords in frontend assets.
- AWS static hosting on **private S3 + HTTPS CloudFront (OAC)**, deployable via scripts and CloudFormation.

## Prerequisites

- A successful AWS backend deployment with `bash ./aws/cli/status.sh node` (or `spring`).
- Windows Git Bash, AWS CLI v2.15.12+, AWS profile with permissions for CloudFormation/S3/CloudFront/Cognito/App Runner.
- Node.js **20.19+** (Node.js 22 LTS recommended), npm, internet access to `npm install`.
- Backend's Cognito app client must allow the exact frontend redirect URI; CORS must include the frontend origin.

## Put it into your existing project

Unzip the frontend so the folder layout is:

```text
AWS_Ready_URL_Shortener/
├── aws/cli/                       # your existing backend scripts
├── NodeJS/                        # existing backend
├── SpringBoot/                    # existing backend
└── Frontend/                      # entire downloaded Frontend/ directory
    ├── src/
    ├── aws/
    ├── package.json
    └── .env.example
```

From Git Bash in `AWS_Ready_URL_Shortener`:

```bash
export AWS_PROFILE=shortener
export AWS_REGION=us-east-1
aws sts get-caller-identity

# Works when the Node backend has been deployed:
bash Frontend/aws/configure-local.sh node
cd Frontend
npm install
npm run test
npm run dev
```

Visit **http://localhost:5173/**. Click **Sign in** or **Create an account**. You will be redirected to your Cognito Hosted UI.

> **Important:** if Cognito's callback URL has been changed to your CloudFront URL, login from localhost will not work until localhost is added back to its allowed callback/logout URIs, and `http://localhost:5173` is in the App Runner `CORS_ORIGINS`.

### Manual local configuration without the script

Copy `.env.example` to `.env.local`, then replace placeholders using the values from:

```bash
bash ./aws/cli/status.sh node
```

Values required:

```env
VITE_API_BASE_URL=https://YOUR-APP-RUNNER-API.us-east-1.awsapprunner.com
VITE_COGNITO_DOMAIN=https://YOUR-COGNITO-POOL.auth.us-east-1.amazoncognito.com
VITE_COGNITO_CLIENT_ID=YOUR-PUBLIC-APP-CLIENT-ID
VITE_COGNITO_REDIRECT_URI=http://localhost:5173/
```

The URI must be **identical** to your Cognito app client's callback URL, including the trailing slash.

## Deploy the frontend to AWS (single command)

After the backend is already deployed, from Git Bash in the backend project root:

```bash
export AWS_PROFILE=shortener
export AWS_REGION=us-east-1
bash Frontend/aws/deploy-frontend.sh node
```

Or for a deployed Spring Boot backend:

```bash
bash Frontend/aws/deploy-frontend.sh spring
```

This script:

1. Confirms the backend infrastructure and API stacks exist.
2. Provisions a **private S3 bucket, CloudFront HTTPS distribution and Origin Access Control** using `Frontend/aws/frontend-stack.yaml`.
3. Retrieves the public CloudFront URL.
4. Calls the backend's `aws/cli/configure-frontend.sh` to allow the CloudFront URL in Cognito's OAuth callback/logout and the API's CORS configuration. **This changes the Cognito callback from localhost to CloudFront**.
5. Generates `Frontend/.env.production.local` with only PUBLIC API/Cognito settings.
6. Runs `npm install`, `npm test`, `npm run build`.
7. Uploads the built app to private S3 and invalidates CloudFront.
8. Prints a publicly accessible **`https://...cloudfront.net/`** frontend URL.

CloudFront and CloudFormation updates are eventually consistent; opening the site immediately after deployment may temporarily fail. The backend App Runner service must already be healthy, or sign-in/API calls will fail.

### Deployment status, updates, teardown

```bash
bash Frontend/aws/status-frontend.sh node

# After editing source, redeploy with the same command:
bash Frontend/aws/deploy-frontend.sh node

# Delete *only* frontend AWS resources. CAUTION: destructive:
bash Frontend/aws/destroy-frontend.sh node --yes-delete
```

The teardown script removes frontend stack and assets, not the backend or RDS database. For complete cleanup, use the backend teardown procedure separately. **Charges** apply for CloudFront, S3, App Runner, NAT gateway, and RDS; set AWS Budgets.

## API contract

| Feature | Backend method | Route |
|---|---|---|
| Create | POST | `/api/v1/links` |
| List owned links | GET | `/api/v1/links?page=0&size=20` |
| Analytics | GET | `/api/v1/links/{code}/analytics` |
| Revoke | DELETE | `/api/v1/links/{code}` |
| Redirect | GET | `/{code}` (public, opens in new browser tab) |
| Readiness | GET | `/ready` |

Protected endpoints send `Authorization: Bearer <Cognito access token>`; they never use the development `X-API-Key`. Create requests also send an `Idempotency-Key` header and either `ttlHours` **or** ISO UTC `expiresAt`, never both.

## Tradeoffs and limitations

- **No data is faked.** Tables and analytics are empty until the backend returns links.
- `Total links` is an API-wide total. Active count and click count on the dashboard are explicitly **current-page aggregates**, since the API doesn't expose aggregate summaries. Search/filter operate on the current page only.
- The backend doesn't expose an edit endpoint or event detail export, so this frontend intentionally doesn't pretend to support editing URLs, QR code storage, geolocation reports, or bulk exports.
- OAuth session is stored in **sessionStorage** (removed when its browser tab is closed). Keep the app protected from XSS; avoid untrusted JS dependencies and apply a restrictive CSP when hardening production.
- Browser OAuth requires an available Cognito domain and a valid callback configuration. OAuth code/PKCE exchange assumes Cognito's token endpoint is reachable from the user's browser.
- The generated CloudFront domain is suitable for demos. For a branded production domain, add Route 53, ACM certificate, CloudFront alternate domain name, and matching Cognito callback/CORS.
- CloudFront error-page SPA fallback can return HTML for missing JS assets. A production CDN can instead use an edge rewrite rule for SPA routes; this app uses the root route only.
- For mission-critical production use: add CloudFront WAF, error monitoring, integration/E2E tests against deployed Cognito, vulnerability scanning, and complete backend reliability validation.
- AWS scripts and CloudFormation cannot be live tested here against your account; run them in your account, validate stack events if they fail.

## Quality checks

```bash
npm run test
npm run build
```

The included Node tests cover expiration, URL validation, analytics aggregation, OAuth PKCE, and API header/error handling. React/Vite compilation requires `npm install` with network access. No AWS deployment was performed during generation of this package.
