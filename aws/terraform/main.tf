terraform {

  required_version = ">= 1.6.0"
  required_providers {
 aws = {
source="hashicorp/aws",version="~> 5.0"
}
 
}

}

provider "aws" {
 region = var.aws_region 
}

data "aws_caller_identity" "current" {

}

locals {

  port = var.app_kind == "node" ? 3000 : 8080
  issuer = "https://cognito-idp.${var.aws_region}.amazonaws.com/${var.cognito_user_pool_id}"
  common_env = [
    {
name="PORT",value=tostring(local.port)
}
,
    {
name="BASE_URL",value="https://${var.api_domain}"
}
,
    {
name="CORS_ORIGINS",value=var.cors_origins
}
,
    {
name="AUTH_MODE",value="jwt"
},
    {name="TRUST_PROXY",value="true"}
,
    {
name="PGHOST",value=aws_db_instance.db.address
}
,
    {
name="PGPORT",value="5432"
}
,
    {
name="PGDATABASE",value="shortener"
}
,
    {
name="PGUSER",value="shortener"
}
,
    {
name="PGSSL_CA_FILE",value="/etc/ssl/rds/global-bundle.pem"
}
,
    {
name="COGNITO_USER_POOL_ID",value=var.cognito_user_pool_id
}
,
    {
name="COGNITO_ISSUER",value=local.issuer
}
,
    {
name="COGNITO_CLIENT_ID",value=var.cognito_client_id
}
,
    {
name="APP_ENV",value="production"
}
,
    {
name="NODE_ENV",value="production"
}
,
    {
name="DB_USERNAME",value="shortener"
}
,
    {
name="JDBC_URL",value="jdbc:postgresql://${aws_db_instance.db.address}:5432/shortener?sslmode=verify-full&sslrootcert=/etc/ssl/rds/global-bundle.pem"
}

  ]
  common_secrets = [
    {
name="VISITOR_HASH_SECRET",valueFrom=var.visitor_secret_arn
}
,
    {
name="PGPASSWORD",valueFrom="${aws_db_instance.db.master_user_secret[0].secret_arn}:password::"
}
,
    {
name="DB_PASSWORD",valueFrom="${aws_db_instance.db.master_user_secret[0].secret_arn}:password::"
}

  ]

}

resource "aws_security_group" "alb" {

  name_prefix="${var.name}-alb-"
vpc_id=var.vpc_id
  ingress {
from_port=443
to_port=443
protocol="tcp"
cidr_blocks=["0.0.0.0/0"]
}

  egress {
from_port=0
to_port=0
protocol="-1"
cidr_blocks=["0.0.0.0/0"]
}

}

resource "aws_security_group" "task" {

  name_prefix="${var.name}-task-"
vpc_id=var.vpc_id
  ingress {
from_port=local.port
to_port=local.port
protocol="tcp"
security_groups=[aws_security_group.alb.id]
}

  egress {
from_port=0
to_port=0
protocol="-1"
cidr_blocks=["0.0.0.0/0"]
}

}

resource "aws_security_group" "db" {

  name_prefix="${var.name}-db-"
vpc_id=var.vpc_id
  ingress {
from_port=5432
to_port=5432
protocol="tcp"
security_groups=[aws_security_group.task.id]
}

  egress {
from_port=0
to_port=0
protocol="-1"
cidr_blocks=["0.0.0.0/0"]
}

}

resource "aws_db_subnet_group" "db" {
name="${var.name}-db"
subnet_ids=var.private_subnet_ids
}

resource "aws_db_instance" "db" {

  identifier="${var.name}-postgres"
  engine="postgres"
  instance_class="db.t4g.micro"
  allocated_storage=20
  max_allocated_storage=100
  storage_type="gp3"
  storage_encrypted=true
  db_name="shortener"
  username="shortener"
  manage_master_user_password=true
  backup_retention_period=7
  multi_az=var.multi_az
  db_subnet_group_name=aws_db_subnet_group.db.name
  vpc_security_group_ids=[aws_security_group.db.id]
  publicly_accessible=false
  deletion_protection=true
  skip_final_snapshot=false
  final_snapshot_identifier="${var.name}-final"
  auto_minor_version_upgrade=true

}

resource "aws_cloudwatch_log_group" "app" {
name="/ecs/${var.name}"
retention_in_days=30
}

resource "aws_iam_role" "task_execution" {

  name="${var.name}-exec"
  assume_role_policy=jsonencode({
Version="2012-10-17",Statement=[{
Effect="Allow",Principal={
Service="ecs-tasks.amazonaws.com"
}
,Action="sts:AssumeRole"
}
]
}
)

}

resource "aws_iam_role_policy_attachment" "execution" {

  role=aws_iam_role.task_execution.name
  policy_arn="arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"

}

resource "aws_iam_role_policy" "secret_read" {

  name="read-runtime-secrets"
role=aws_iam_role.task_execution.id
  policy=jsonencode({
Version="2012-10-17",Statement=[{
Effect="Allow",Action=["secretsmanager:GetSecretValue"],Resource=[var.visitor_secret_arn,aws_db_instance.db.master_user_secret[0].secret_arn]
}
]
}
)

}

resource "aws_iam_role" "task" {

  name="${var.name}-task"
  assume_role_policy=jsonencode({
Version="2012-10-17",Statement=[{
Effect="Allow",Principal={
Service="ecs-tasks.amazonaws.com"
}
,Action="sts:AssumeRole"
}
]
}
)

}

resource "aws_ecs_cluster" "app" {
name=var.name
}

resource "aws_ecs_task_definition" "app" {

  family=var.name
  requires_compatibilities=["FARGATE"]
  network_mode="awsvpc"
  cpu="512"
memory="1024"
  execution_role_arn=aws_iam_role.task_execution.arn
  task_role_arn=aws_iam_role.task.arn
  container_definitions=jsonencode([{

    name="shortener",image=var.image_uri,essential=true
    portMappings=[{
containerPort=local.port,protocol="tcp"
}
]
    environment=local.common_env
    secrets=local.common_secrets
    logConfiguration={
logDriver="awslogs",options={
"awslogs-group"=aws_cloudwatch_log_group.app.name,"awslogs-region"=var.aws_region,"awslogs-stream-prefix"="app"
}

}

  
}
])
  depends_on=[aws_iam_role_policy_attachment.execution,aws_iam_role_policy.secret_read]

}

resource "aws_lb" "app" {

  name=substr(var.name,0,28)
  internal=false
  load_balancer_type="application"
  security_groups=[aws_security_group.alb.id]
  subnets=var.public_subnet_ids

}

resource "aws_lb_target_group" "app" {

  name=substr("${var.name}-tg",0,32)
  port=local.port
protocol="HTTP"
target_type="ip"
vpc_id=var.vpc_id
  health_check {
path="/ready"
matcher="200"
interval=30
timeout=10
healthy_threshold=2
unhealthy_threshold=3
}

  deregistration_delay=15

}

resource "aws_lb_listener" "https" {

  load_balancer_arn=aws_lb.app.arn
  port=443
protocol="HTTPS"
ssl_policy="ELBSecurityPolicy-TLS13-1-2-2021-06"
certificate_arn=var.certificate_arn
  default_action {
type="forward"
target_group_arn=aws_lb_target_group.app.arn
}

}

resource "aws_ecs_service" "app" {

  name="${var.name}-api"
cluster=aws_ecs_cluster.app.id
  task_definition=aws_ecs_task_definition.app.arn
  desired_count=2
  launch_type="FARGATE"
  deployment_minimum_healthy_percent=100
  deployment_maximum_percent=200
  health_check_grace_period_seconds=90
  network_configuration {
subnets=var.public_subnet_ids
security_groups=[aws_security_group.task.id]
assign_public_ip=true
}

  load_balancer {
target_group_arn=aws_lb_target_group.app.arn
container_name="shortener"
container_port=local.port
}

  depends_on=[aws_lb_listener.https]

}

resource "aws_route53_record" "api" {

  count=var.route53_zone_id==""?0:1
  zone_id=var.route53_zone_id
  name=var.api_domain
type="A"
  alias {
name=aws_lb.app.dns_name
zone_id=aws_lb.app.zone_id
evaluate_target_health=true
}

}

output "alb_dns_name" {
value=aws_lb.app.dns_name
}

output "ecs_cluster" {
value=aws_ecs_cluster.app.name
}

output "ecs_task_definition" {
value=aws_ecs_task_definition.app.arn
}

output "ecs_service" {
value=aws_ecs_service.app.name
}

output "task_security_group_id" {
value=aws_security_group.task.id
}

output "rds_endpoint" {
value=aws_db_instance.db.address
}

