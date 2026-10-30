# Git Bash / Windows AWS deployment commands — URL Shortener + Agentic SDLC

These instructions assume your current working AWS resources are in `us-east-1` and the project root is `AWS_Ready_URL_Shortener`.

**IMPORTANT: Rotate the AWS access key previously posted in chat. Never paste access keys, tokens, `.env.local`, or database secrets into Git.**

## A. Apply patch without overwriting AWS fixes

1. Back up your current project directory or commit it.
2. Extract **Agentic_SDLC_Overlay.zip** into your existing `AWS_Ready_URL_Shortener` folder and allow replacement of the React `App.jsx`, stylesheet, and `NodeJS/package.json`/`.gitignore`. Do not replace your deployed `Dockerfile`, `aws/cli` scripts, database files, or `.env.local`.
3. From Git Bash:

```bash
export AWS_PROFILE=shortener
export AWS_REGION=us-east-1
aws sts get-caller-identity
cd NodeJS
npm install
npm test
cd ../Frontend
npm install
npm test
npm run build
cd ..
```

## B. Run the engineering agent service in a separate local Git Bash window

Get the Cognito IDs from your existing AWS CloudFormation stack (no credentials printed):

```bash
export AWS_PROFILE=shortener
export AWS_REGION=us-east-1
export COGNITO_USER_POOL_ID="$(aws cloudformation describe-stacks --stack-name shortener-node-demo-infra --query "Stacks[0].Outputs[?OutputKey=='CognitoPoolId'].OutputValue | [0]" --output text)"
export COGNITO_CLIENT_ID="$(aws cloudformation describe-stacks --stack-name shortener-node-demo-infra --query "Stacks[0].Outputs[?OutputKey=='CognitoClientId'].OutputValue | [0]" --output text)"
# Replace with the Cognito 'sub' claim displayed in the frontend SDLC banner.
export SDLC_ADMIN_SUBS="YOUR_COGNITO_SUB"
cd NodeJS
npm run sdlc:server
```

The SDLC service listens on **127.0.0.1:3100 only**. You can get your Cognito `sub` by setting up the frontend first, logging in, opening **Agentic SDLC**, and reading the subject shown in the banner; restart the server with that value. Never share your access token with anyone.

If the AWS Cognito app client no longer allows localhost callback, update Cognito allowed callbacks and backend CORS for local development before signing in. Do not overwrite the CloudFront production callback configuration inadvertently.

## C. Run the React frontend locally, enabling SDLC tab

```bash
# From project root, reconfigure only if you need to regenerate local OAuth config:
bash Frontend/aws/configure-local.sh node
# This command overwrites Frontend/.env.local: append optional runner URL afterward.
echo 'VITE_SDLC_API_BASE_URL=http://127.0.0.1:3100' >> Frontend/.env.local
cd Frontend
npm install
npm run dev
```

Visit http://localhost:5173/ and sign in with Cognito. **Agentic SDLC** will appear in the sidebar. The AWS-hosted CloudFront frontend intentionally omits the SDLC tab (runner is not publicly exposed).

## D. CLI-only offline demonstration (works without Cognito/browser)

```bash
cd NodeJS
npm run sdlc -- scenarios
npm run sdlc -- create greenfield
# Copy the generated run id into RUN_ID below; use its UUID.
export RUN_ID=REPLACE_WITH_RUN_UUID
npm run sdlc -- advance "$RUN_ID"
npm run sdlc -- approve "$RUN_ID" design_approval "Reviewed requirements, architecture and security"
npm run sdlc -- advance "$RUN_ID"
npm run sdlc -- evidence "$RUN_ID"
npm run sdlc -- approve "$RUN_ID" release_approval "Reviewed patch and QA logs"
npm run sdlc -- advance "$RUN_ID"
```

For ambiguous: `npm run sdlc -- create ambiguous`, then `npm run sdlc -- advance "$RUN_ID"`, `npm run sdlc -- answer "$RUN_ID" 48`, then proceed to approvals. For brownfield: `create brownfield`.

## E. Human-reviewed changes: apply proposal to LOCAL backend, then push Git

Only after `COMPLETE`, source review, and full manual validation:

```bash
cd NodeJS
node sdlc/apply-proposal.mjs "$RUN_ID"          # DRY RUN (safe)
SDLC_APPLY_CONFIRM=YES node sdlc/apply-proposal.mjs "$RUN_ID" --apply
npm test
cd ..
git diff -- NodeJS/src/
git status
```

For an existing Git repository (adjust branch if yours differs):

```bash
git status
git switch -c feature/agentic-sdlc
# Stage only explicit source/docs/tests, never .env.local or secrets
git add NodeJS/sdlc NodeJS/test/sdlc.test.mjs NodeJS/package.json NodeJS/.gitignore \
  Frontend/src/App.jsx Frontend/src/styles.css Frontend/src/lib/sdlc.js \
  Frontend/src/components/WorkflowDashboard.jsx Frontend/.env.example \
  INTERVIEW_AGENTIC_SDLC_GUIDE.md AWS_AND_GIT_COMMANDS.md
# If you approved and applied generated code, add the reviewed files separately:
# git add NodeJS/src/postgres-store.mjs NodeJS/src/server.mjs
git diff --cached --stat
git commit -m "feat: governed agentic SDLC runner and review dashboard"
git push -u origin feature/agentic-sdlc
```

If `git remote -v` is empty, create a private GitHub/GitLab repository and add its **actual URL**: `git remote add origin <your-repository-url>` (do not use guessed URLs). If no Git repo yet: `git init` and configure a remote before pushing. Merge through reviewed PR with checks.

## F. Deploy ONLY reviewed production changes to AWS (Node.js)

Do **not** deploy the SDLC runner as a public API. It is not bundled into your existing public Docker image (the Dockerfile copies only `NodeJS/src/` and `NodeJS/sql/`). The frontend SDLC panel is hidden unless the localhost runner URL is configured.

After merging *approved changes to URL Shortener source*, run these commands from your existing project root:

```bash
export AWS_PROFILE=shortener
export AWS_REGION=us-east-1
cd NodeJS && npm test && cd ..
# Uses existing working ECS Fargate patch, with a NEW Docker image:
bash ./aws/cli/deploy-ecs.sh node --build
bash ./aws/cli/status.sh node
bash ./aws/cli/smoke.sh node
MSYS_NO_PATHCONV=1 aws logs tail '/ecs/shortener-node-demo-node-api' --since 15m
```

Check the existing Git Bash and Dockerfile certificate fixes remain present before rebuilding. Deploying will change your running backend and incurs AWS charges.

## G. Push React changes to AWS CloudFront (safe when no SDLC API URL is set)

```bash
cd Frontend
npm test && npm run build
cd ..
# Remove the optional local-only URL from production env if present.
sed -i '/^VITE_SDLC_API_BASE_URL=/d' Frontend/.env.production.local 2>/dev/null || true
bash Frontend/aws/deploy-frontend.sh node
# Obtain the CloudFront URL:
bash Frontend/aws/status-frontend.sh node
```

`deploy-frontend.sh` may update Cognito redirect and backend CORS. Confirm the expected callback origin and monitor AWS logs after deployment. It creates/updates billable AWS resources; do not run repeatedly without checking the existing stack.

## H. Deploy sanity checks and rollback

```bash
aws ecs describe-services --cluster shortener-node-demo-node-api-cluster \
 --services shortener-node-demo-node-api-service \
 --query 'services[0].{desired:desiredCount,running:runningCount,events:events[0:3].[message]}' --output json
```

For rollbacks, use a **previous, known-good ECS task definition revision** and a human-approved change ticket; do not automatically delete RDS:

```bash
aws ecs list-task-definitions --family-prefix shortener-node-demo-node-api-task --sort DESC --max-items 5
# After confirming PREVIOUS_GOOD_TASK_DEFINITION manually:
# aws ecs update-service --cluster shortener-node-demo-node-api-cluster \
#   --service shortener-node-demo-node-api-service \
#   --task-definition PREVIOUS_GOOD_TASK_DEFINITION
```

AWS docs: https://docs.aws.amazon.com/cli/latest/reference/ecs/update-service.html
