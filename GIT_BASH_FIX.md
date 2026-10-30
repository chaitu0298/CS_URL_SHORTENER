# Git Bash + AWS CLI 2.15.12 — Path fix

The original deployment script used a Linux-style absolute path (`file:///c/Users/...`) in `cloudformation validate-template`. The Windows `aws.exe` cannot load that path through its `file://` loader. This release resolves templates relative to the project root (`file://aws/cli/infra.json`) and suppresses Git Bash argument conversion when invoking AWS CLI.

## From Git Bash in `AWS_Ready_URL_Shortener`

```bash
export AWS_PROFILE=shortener
export AWS_REGION=us-east-1

# Confirm scripts/templates are present:
ls -l aws/cli/infra.json aws/cli/service.json

# Validate against CloudFormation before creating resources:
MSYS_NO_PATHCONV=1 aws cloudformation validate-template --template-body file://aws/cli/infra.json
MSYS_NO_PATHCONV=1 aws cloudformation validate-template --template-body file://aws/cli/service.json

# Confirm Docker Desktop Linux engine is active:
docker info

# Run corrected deploy script; THIS CREATES BILLABLE AWS RESOURCES:
bash ./aws/cli/deploy.sh node

# After successful deploy:
bash ./aws/cli/status.sh node
bash ./aws/cli/smoke.sh node
```

**Security:** If an AWS access key was exposed earlier, deactivate that key and configure a replacement before running the deployment. Avoid saving credentials in scripts.

**Limits:** Bash syntax and local JSON were validated here; these templates still need CloudFormation validation and deployment in an AWS account with appropriate IAM permissions and quotas.
