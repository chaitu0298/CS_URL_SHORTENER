# LINKFORGE FRONTEND — Commands for Windows Git Bash + AWS CLI 2.15.12

## 0. Check the backend is deployed first

```bash
cd ~/Documents/AWS_URL_Shortener_Command_Deploy_Complete/AWS_Ready_URL_Shortener
export AWS_PROFILE=shortener
export AWS_REGION=us-east-1
aws sts get-caller-identity
bash ./aws/cli/status.sh node
bash ./aws/cli/smoke.sh node
```

**If your backend deploy hasn't succeeded yet, deploy it before trying the frontend:**

```bash
bash ./aws/cli/deploy.sh node
```

## 1. Extract frontend files

Extract the ZIP into the `AWS_Ready_URL_Shortener` directory. Verify:

```bash
ls Frontend/package.json
ls Frontend/aws/deploy-frontend.sh
```

## 2. Run frontend locally before AWS hosting

```bash
bash Frontend/aws/configure-local.sh node
cd Frontend
node --version
npm install
npm run test
npm run dev
```

Open `http://localhost:5173/`. Use Cognito to create an account or sign in, then create a link. The backend must be configured with Cognito callback `http://localhost:5173/` and allow this origin in CORS.

If you just want to inspect the UI without the backend, `npm run dev` displays a configuration screen rather than fabricated link data.

## 3. Deploy frontend hosting to AWS

```bash
cd ..    # back to AWS_Ready_URL_Shortener
export AWS_PROFILE=shortener
export AWS_REGION=us-east-1
bash Frontend/aws/deploy-frontend.sh node
```

The script will provision S3 + CloudFront (billable), update Cognito callback to CloudFront, allow CloudFront CORS in App Runner, install dependencies, run tests, build, upload and invalidate. It prints the HTTPS URL.

**Note:** Localhost sign-in will stop working after the callback is replaced with CloudFront unless both URLs are registered with Cognito. The deployed CloudFront app will use the correct new callback.

## 4. See URLs/status

```bash
bash ./aws/cli/status.sh node
bash Frontend/aws/status-frontend.sh node
```

## 5. Update site after edits

```bash
bash Frontend/aws/deploy-frontend.sh node
```

## 6. Delete frontend resources to stop hosting charges

```bash
bash Frontend/aws/destroy-frontend.sh node --yes-delete
```

Backend RDS/App Runner/NAT resources are not deleted by this frontend cleanup. Follow the original backend teardown guide for those.

## Important notes

- Never put AWS access keys, secret access keys, database credentials, or Cognito client secret in frontend `.env` files.
- AWS CLI 2.15.12 is supported; don't run `aws login` on that version.
- Your AWS access key previously pasted into chat should be deactivated and replaced before deploying.
- AWS installation and all account-specific deployment steps are performed on your own workstation; this package was not deployed to your AWS account.
