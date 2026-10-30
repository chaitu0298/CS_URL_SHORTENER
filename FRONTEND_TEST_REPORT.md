# Frontend verification report — 2026-10-29

## Executed successfully

- Node.js 22 built-in test runner: 15/15 tests passing, including URL validation, UTC expiry, alias rules, link statuses, chart time series, API bearer/idempotency headers, missing authentication and 204/409 handling, cryptographic PKCE RFC test.
- TypeScript compiler JSX transpilation (`tsc --allowJs --checkJs false --jsx react ...`) succeeded without syntax diagnostics.
- Compiled App.js passed `node --check` JavaScript syntax validation.
- AWS CloudFormation YAML parsed successfully with four named AWS resource definitions.
- Bash `bash -n` passed for deployment, local configuration, status, and teardown scripts.
- Directory and packaging verification performed after ZIP creation.

## Not yet verified (must be done on your workstation / AWS account)

- `npm install` / Vite bundling and `npm run build`: npm registry inaccessible from the generation environment.
- Browser-to-Cognito OAuth code exchange, real JWT login, CloudFront CORS, App Runner API integration: requires your deployed AWS backend and user pool.
- CloudFormation deployment: no AWS credentials or services were used here; AWS `validate-template` and real stack rollout still needed.
- Full Playwright browser accessibility and responsiveness testing: build requires npm dependencies first.

## Intended environment

- Browser: up-to-date Chrome/Edge/Safari/Firefox
- Node.js 20.19+ or 22 LTS
- AWS CLI 2.15.12+ with Git Bash on Windows
- Existing AWS URL shortener backend running on HTTPS App Runner and Cognito

No mock production statistics or fabricated API responses are used by the dashboard.
