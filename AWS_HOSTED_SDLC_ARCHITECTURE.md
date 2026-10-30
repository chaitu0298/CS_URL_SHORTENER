# AWS-hosted Agentic SDLC control plane — architecture

## Isolation principle

The URL shortener keeps its existing public API Gateway + VPC Link + internal ALB + ECS Fargate + private RDS PostgreSQL service. **Nothing in this overlay replaces that working service or its Dockerfile.**

The SDLC control plane is a second, independent service:

```text
Browser: LinkForge React on private S3 + CloudFront HTTPS
   |-- public URL shortener APIs -> existing API Gateway -> existing ECS -> PostgreSQL
   |-- engineering SDLC dashboard (only available to authorized Cognito users)
         | HTTPS /sdlc/* + Bearer Cognito access JWT
         v
      NEW API Gateway HTTP API
         | JWT issuer + audience validation + throttling; no wildcard auth bypass
         | GET /sdlc/health is the only anonymous probe
         v
      NEW VPC Link -> internal ALB -> NEW ECS Fargate service (single task)
         | verifies token again (aws-jwt-verify), checks SDLC_ADMIN_SUBS
         | 3 bounded scenarios, review/approval gates, no arbitrary command APIs
         | no AWS IAM deployment permissions on task role
         v
      Encrypted EFS + TLS transit + UID 1000 access point
         | runs / state / audit chain / generated patch / tests
         v
      Reviewable evidence; **never automatically merged or deployed**
```

## Authorization and boundaries

* Existing Cognito user pool and public SPA client are reused. Frontend sends the short-lived access token using `Authorization: Bearer ...`.
* HTTP API JWT authorizer validates issuer/audience before invoking VPC Link. Service validates `tokenUse=access` and exact allowed `sub` UUID(s). Only allowlisted users can access run details, create runs, approve, or view code.
* The SDLC task role is intentionally bare, without access to RDS, ECR pushes, deployment APIs or secrets. Its image contains only code-backed predefined change recipes; arbitrary shell commands or unreviewed generic LLM code generation are not supported.
* All generated changes stay in EFS-backed isolated run folders. There is no promotion/merge/deploy API. Manually review and promote code offline using the existing approval process.
* ECS task binds TCP 3100 only within a private subnet; security group allows only the internal ALB. No public load balancer.
* Browser CORS origin list is explicit; non-admin users do not see the SDLC nav after the authorization probe, but backend authorization is authoritative. CORS does not provide authentication.

## Lifecycle and state

* Single desired ECS task because file-backed audit/write operations are not safe across multiple concurrent replicas. EFS maintains state across replacement tasks, but isn't an ACID workflow database.
* API calls are synchronous per advance request; the engine executes only bounded scenarios. A longer-running scalable control plane would use DynamoDB/Step Functions/SQS with separate isolated workers.
* SHA-256-linked audit logs help detect accidental modification but are **not immutable, independently anchored audit records**. Enterprise-grade audit requires independent append-only/WORM export and stronger identity/workflow segregation.
* The ECS template provisions encrypted EFS, TLS-in-transit, an access point, 14-day CloudWatch logs, and ECS deployment circuit-breaker. File backups are enabled; rehearse restores before relying on production data.
* Initial setup uses one task and one set of reviewer(s); production needs separation of requester and approver, policy validation, reliable queueing, least privilege testing, alarms, CI/CD, quotas, and security review.

## Cost and lifecycle

Provisioning adds one Fargate task, internal ALB, API Gateway, EFS, network interfaces, log storage, and transfer. Existing RDS/NAT continue billing. `destroy-sdlc.sh` deletes the SDLC EFS **and all workflow state**; it never deletes the shortener data stack. ECR images are a separate resource and may continue costing money.

## CloudFormation template

`aws/cli/sdlc-service.json`: no stack change to the original `aws/cli/infra.json` or `aws/cli/ecs-service.json`. It imports Cognito exports from the `shortener-node-demo-infra` infrastructure stack and uses its VPC/private subnets via explicit parameters.

AWS docs: [API Gateway HTTP API JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html), [EFS volumes in ECS](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/efs-volumes.html), [HTTP API private integrations](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-private.html).
