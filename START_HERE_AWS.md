# Start here: deploy the URL shortener to AWS

1. Open **[AWS_DEPLOYMENT_COMMANDS.md](AWS_DEPLOYMENT_COMMANDS.md)**; it contains **every command**, from AWS login to creation, testing, React setup, updates, diagnostics, and teardown.
2. Install AWS CLI v2 and Docker. On Windows use WSL + Docker Desktop integration.
3. Authenticate using `aws configure sso --profile shortener` + `aws sso login --profile shortener`, then export `AWS_PROFILE=shortener`, `AWS_REGION=us-east-1`.
4. Execute **`./aws/cli/deploy.sh node`**.
5. Record the resulting `https://....awsapprunner.com` URL. Run `./aws/cli/smoke.sh node`.
6. Run `./aws/cli/auth-demo.sh node` to create an authorized Cognito user and test link creation/redirect.
7. Once you build React, run `./aws/cli/configure-frontend.sh node https://YOUR-FRONTEND-URL/auth/callback` and configure React with Cognito public client and API base URL.

These are **real AWS resources that incur ongoing charges**. For cleanup use `./aws/cli/destroy.sh node`. The project is an AWS deployable starting point, not a guarantee of a hardened production launch. Nothing was deployed by the author.
