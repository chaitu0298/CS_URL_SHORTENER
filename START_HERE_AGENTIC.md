# START HERE — Agentic Engineering upgrade

The ZIP **overlay** is meant for your already-working AWS deployment. It does NOT overwrite Dockerfile, existing ECS scripts, PostgreSQL schema, Cognito or runtime environment files.

1. Backup your working folder.
2. Extract `Agentic_SDLC_Upgrade_Overlay.zip` inside `AWS_Ready_URL_Shortener/` (contains `NodeJS/`, `Frontend/` and `.md` files).
3. From Git Bash, verify: `cd NodeJS && npm install && npm test && cd ..` and `cd Frontend && npm install && npm test && npm run build && cd ..`.
4. Follow `AWS_AND_GIT_COMMANDS.md` for two local windows: Cognito-admin SDLC API and React Vite frontend. The SDLC sidebar tab is local-only.
5. Use the UI for greenfield/brownfield/ambiguous approval workflow. Review generated changes before any local apply or AWS deploy.
6. Use `git add/commit/push` commands in `AWS_AND_GIT_COMMANDS.md`, then only if source changes were accepted, `bash ./aws/cli/deploy-ecs.sh node --build`; for React, `bash Frontend/aws/deploy-frontend.sh node`.

The **full project ZIP** is for fresh installs; do not replace your existing working AWS folder with it unless you have backed up and reconciled local fixes.

## Credentials needed from you (do not share secrets in chat)
- Existing AWS CLI profile `shortener` already configured.
- Cognito user-pool ID and app-client ID pulled from existing CloudFormation outputs.
- **Your own Cognito subject (`sub`)** to allowlist in the local SDLC service.
- Optional: an OpenAI API key and model available to your account (set only as local environment variables), if you want optional model-assisted requirements review.
- Optional GitHub/GitLab repository URL for tailored push commands; no remote has been assumed.

## Production safety boundary
The public AWS URL Shortener remains the production app; the SDLC service has no public routes and is neither put in ECS nor made reachable from CloudFront. This avoids handing arbitrary source-file access and code execution to internet users. A future AWS-hosted engineering control plane requires a separate private service, durable state DB, controlled runner IAM permissions, and auditable authorization/release governance.

## Secure AWS hosting addition

To host the new Agentic SDLC dashboard as part of LinkForge, see [`AWS_HOSTED_SDLC_DEPLOYMENT_COMMANDS.md`](AWS_HOSTED_SDLC_DEPLOYMENT_COMMANDS.md) and [`AWS_HOSTED_SDLC_ARCHITECTURE.md`](AWS_HOSTED_SDLC_ARCHITECTURE.md). Use the upgrade overlay, preserving working URL shortener and Docker/ECS fixes.
