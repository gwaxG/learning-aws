"""Three-tier app: CloudFront + S3 (client), ALB + ECS Fargate (server), RDS PostgreSQL (data).

Architecture and cost: playground/docs/adr/0004-three-tier-aws-architecture-and-cost.md
Pulumi basics:         playground/docs/pulumi.html

How to read this file
- Pulumi runs this script top to bottom and builds a graph of resources. Nothing is created while the script
  runs; the engine compares the graph to the state and then calls AWS ("pulumi preview" / "pulumi up").
- The first argument of every resource ("vpc", "db", ...) is its LOGICAL name in Pulumi state. The AWS (physical)
  name gets a random suffix unless a name is set. Never rename a logical name casually: Pulumi sees delete + create.
- Values only known after deploy (ids, endpoints) are Output[T]. Passing `x.id` into another resource creates a
  dependency, so ordering is automatic. https://www.pulumi.com/docs/iac/concepts/inputs-outputs/
- Every "Pulumi docs" link below is the API page of the resource; the "AWS docs" link explains the AWS concept.
"""
import json
import mimetypes
from pathlib import Path

import pulumi
import pulumi_aws as aws  # native AWS provider: https://www.pulumi.com/registry/packages/aws/
import pulumi_docker_build as docker_build  # builds + pushes the image: https://www.pulumi.com/registry/packages/docker-build/

# ================================================================== configuration
# Stack config lives in Pulumi.<stack>.yaml. `require_secret` fails the deploy if the key is missing and marks the
# value as a secret, so Pulumi encrypts it in state and masks it in output.
# Set with: pulumi config set --secret dbPassword '...'   https://www.pulumi.com/docs/iac/concepts/secrets/
cfg = pulumi.Config()
db_password = cfg.require_secret("dbPassword")
jwt_secret = cfg.require_secret("jwtSecret")
# `get` returns None when unset, so the default is used. A bigger class is a one-line config change (cost: ADR 0004).
db_instance_class = cfg.get("dbInstanceClass") or "db.t4g.micro"
# Monitoring switches (section "monitoring" below). Container Insights is the priciest part (ADR 0005), so it can be
# turned off with: pulumi config set containerInsights false. Alarm emails need a confirmation click in the inbox.
container_insights = cfg.get_bool("containerInsights") is not False
alarm_email = cfg.get("alarmEmail")

# Paths are resolved relative to this file so `pulumi up` works from any directory.
ROOT = Path(__file__).resolve().parent.parent
CLIENT_DIST = ROOT / "client" / "dist"  # output of `npm run build`
SERVER_DIR = ROOT / "server"  # Docker build context (contains the Dockerfile)
APP_PORT = 8000  # uvicorn port inside the container; one constant keeps SG, target group and task in sync
DB_NAME = "app"
DB_USER = "app"

# Look up AZ names at deploy time instead of hard-coding "eu-west-1a". Two are needed: an ALB requires subnets in
# at least two AZs, and an RDS subnet group does too.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/getavailabilityzones/
# AWS docs:    https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html
azs = aws.get_availability_zones(state="available").names[:2]

# ================================================================== network (VPC)
# The VPC is the private network everything lives in. 10.0.0.0/16 = 65,536 addresses, a conventional private range.
# DNS hostnames/support must be on so the RDS endpoint name resolves to its private IP inside the VPC.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/ec2/vpc/
# AWS docs:    https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html
#              https://docs.aws.amazon.com/vpc/latest/userguide/vpc-dns.html
vpc = aws.ec2.Vpc("vpc", cidr_block="10.0.0.0/16", enable_dns_hostnames=True, enable_dns_support=True)

# Internet gateway: the VPC's door to the internet. A subnet is "public" only if its route table sends 0.0.0.0/0 here.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/ec2/internetgateway/
# AWS docs:    https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html
igw = aws.ec2.InternetGateway("igw", vpc_id=vpc.id)

# Route table for the public subnets: "anything not inside the VPC goes to the IGW" (the VPC-local route is implicit).
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/ec2/routetable/
# AWS docs:    https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html
public_rt = aws.ec2.RouteTable(
    "public-rt",
    vpc_id=vpc.id,
    routes=[aws.ec2.RouteTableRouteArgs(cidr_block="0.0.0.0/0", gateway_id=igw.id)],
)

public_subnets, private_subnets = [], []
for i, az in enumerate(azs):  # one public + one private subnet per AZ
    # Public subnet 10.0.0.0/24, 10.0.1.0/24 (256 addresses each). It hosts the ALB and the Fargate task.
    # `map_public_ip_on_launch` gives instances a public IPv4 by default; Fargate sets its own via assign_public_ip below.
    # Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/ec2/subnet/
    # AWS docs:    https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html
    pub = aws.ec2.Subnet(
        f"public-{i}", vpc_id=vpc.id, cidr_block=f"10.0.{i}.0/24", availability_zone=az, map_public_ip_on_launch=True
    )
    # A subnet uses the VPC's main route table unless associated with another one: this makes it public.
    # Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/ec2/routetableassociation/
    aws.ec2.RouteTableAssociation(f"public-rta-{i}", subnet_id=pub.id, route_table_id=public_rt.id)
    public_subnets.append(pub)
    # Private subnet 10.0.10.0/24, 10.0.11.0/24 for the database. No association = main route table = only the
    # implicit local route, so there is no path to or from the internet. (This is why no NAT gateway is needed.)
    private_subnets.append(
        aws.ec2.Subnet(f"private-{i}", vpc_id=vpc.id, cidr_block=f"10.0.{10 + i}.0/24", availability_zone=az)
    )

# ================================================================== security groups
# Security groups are stateful firewalls attached to network interfaces. Chain: CloudFront -> ALB -> app -> DB,
# each tier only accepts traffic from the tier in front of it. Referencing another SG as the source (instead of
# an IP range) keeps the rule valid when IPs change.
# AWS docs: https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html

# AWS-managed list of CloudFront's origin-facing IP ranges, kept up to date by AWS. It lets the ALB refuse the rest
# of the internet. Caveat: it counts as ~55 rules against the SG quota (default 60), and any CloudFront
# distribution (not just ours) is allowed. Documented in ADR 0004.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/ec2/getmanagedprefixlist/
# AWS docs:    https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/LocationsOfEdgeServers.html
cloudfront_prefix_list = aws.ec2.get_managed_prefix_list(name="com.amazonaws.global.cloudfront.origin-facing")

# ALB security group: HTTP :80 only from CloudFront. Egress "-1" = all protocols, to anywhere (needed to reach
# the task); explicit because Pulumi/Terraform remove the default allow-all egress rule that the console adds.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/ec2/securitygroup/
alb_sg = aws.ec2.SecurityGroup(
    "alb-sg",
    vpc_id=vpc.id,
    description="ALB: HTTP from CloudFront only",
    ingress=[
        aws.ec2.SecurityGroupIngressArgs(
            protocol="tcp", from_port=80, to_port=80, prefix_list_ids=[cloudfront_prefix_list.id]
        )
    ],
    egress=[aws.ec2.SecurityGroupEgressArgs(protocol="-1", from_port=0, to_port=0, cidr_blocks=["0.0.0.0/0"])],
)

# App (Fargate task) security group: the app port is open ONLY to the ALB's security group, even though the task
# has a public IP. Egress is open so the task can reach RDS, ECR, Secrets Manager and CloudWatch Logs.
app_sg = aws.ec2.SecurityGroup(
    "app-sg",
    vpc_id=vpc.id,
    description="Fargate task: app port from ALB only",
    ingress=[
        aws.ec2.SecurityGroupIngressArgs(
            protocol="tcp", from_port=APP_PORT, to_port=APP_PORT, security_groups=[alb_sg.id]
        )
    ],
    egress=[aws.ec2.SecurityGroupEgressArgs(protocol="-1", from_port=0, to_port=0, cidr_blocks=["0.0.0.0/0"])],
)

# Database security group: PostgreSQL port 5432 only from the app SG. No egress block = no outbound rules, which is
# fine for a database that only answers connections (responses are allowed because SGs are stateful).
db_sg = aws.ec2.SecurityGroup(
    "db-sg",
    vpc_id=vpc.id,
    description="PostgreSQL from the app only",
    ingress=[
        aws.ec2.SecurityGroupIngressArgs(protocol="tcp", from_port=5432, to_port=5432, security_groups=[app_sg.id])
    ],
)

# ================================================================== data tier (RDS)
# A DB subnet group tells RDS which subnets it may place the instance in (must span >= 2 AZs, even single-AZ DBs).
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/rds/subnetgroup/
# AWS docs:    https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.WorkingWithRDSInstanceinaVPC.html
db_subnets = aws.rds.SubnetGroup("db-subnets", subnet_ids=[s.id for s in private_subnets])

# The PostgreSQL instance.
# - engine_version "16": the latest 16.x minor; RDS picks it. Matches postgres:16 used locally in docker-compose.
# - db.t4g.micro: cheapest burstable Graviton class (2 vCPU, 1 GB). allocated_storage=20 GB gp3 is the minimum for gp3.
# - storage_encrypted: encryption at rest with the AWS-managed KMS key, free, cannot be enabled later without a copy.
# - publicly_accessible=False + private subnets + db_sg: reachable only from the app.
# - multi_az=False: halves the cost; no automatic failover (fine for a playground, see ADR 0004).
# - backup_retention_period=1: keeps one day of automated backups (0 would disable point-in-time recovery).
# - skip_final_snapshot=True: otherwise `pulumi destroy` fails asking for a final snapshot name.
# - apply_immediately=True: config changes apply now instead of waiting for the maintenance window.
# - password is a secret Output, so it never appears in plain text in state or logs.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/rds/instance/
# AWS docs:    https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html
#              https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.DBInstanceClass.html
#              https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html
#              https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html
db = aws.rds.Instance(
    "db",
    engine="postgres",
    engine_version="16",
    instance_class=db_instance_class,
    allocated_storage=20,
    storage_type="gp3",
    storage_encrypted=True,
    db_name=DB_NAME,
    username=DB_USER,
    password=db_password,
    db_subnet_group_name=db_subnets.name,
    vpc_security_group_ids=[db_sg.id],
    publicly_accessible=False,
    multi_az=False,
    backup_retention_period=1,
    skip_final_snapshot=True,  # playground: destroy must not leave a snapshot behind
    apply_immediately=True,
)

# ================================================================== secrets
# Build the SQLAlchemy URL from the live RDS endpoint. `Output.concat` joins strings and Outputs; the result is
# secret because the password is. A plain f-string would not work: `db.address` is not a str yet.
# Pulumi docs: https://www.pulumi.com/docs/iac/concepts/inputs-outputs/#outputs-and-strings
database_url = pulumi.Output.concat(
    "postgresql+psycopg://", DB_USER, ":", db_password, "@", db.address, ":5432/", DB_NAME
)

# One Secrets Manager secret holds both runtime secrets as a JSON document. ECS injects them as environment
# variables at task start, so they never sit in the task definition (which is readable by anyone who can describe it).
# recovery_window_in_days=0 deletes immediately on destroy; the default 30-day window would block re-creating a
# secret with the same name after `pulumi destroy`.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/secretsmanager/secret/
# AWS docs:    https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html
#              https://docs.aws.amazon.com/secretsmanager/latest/userguide/manage_delete-secret.html
app_secret = aws.secretsmanager.Secret("app-secret", recovery_window_in_days=0)
# The secret's value is a "version". `Output.json_dumps` serialises a dict that contains Outputs.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/secretsmanager/secretversion/
aws.secretsmanager.SecretVersion(
    "app-secret-v1",
    secret_id=app_secret.id,
    secret_string=pulumi.Output.json_dumps({"DATABASE_URL": database_url, "JWT_SECRET": jwt_secret}),
)

# ================================================================== container image (ECR + build)
# ECR is AWS's private Docker registry. force_delete=True lets destroy remove the repo although it contains images.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/ecr/repository/
# AWS docs:    https://docs.aws.amazon.com/AmazonECR/latest/userguide/what-is-ecr.html
repo = aws.ecr.Repository("server", force_delete=True)

# `docker login` credentials for ECR (a token valid 12 h). The _output variant accepts Outputs (repo.registry_id).
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/ecr/getauthorizationtoken/
# AWS docs:    https://docs.aws.amazon.com/AmazonECR/latest/userguide/registry_auth.html
ecr_auth = aws.ecr.get_authorization_token_output(registry_id=repo.registry_id)

# Build ../server/Dockerfile with the local Docker engine (BuildKit) and push it to ECR as part of `pulumi up`,
# so infra and image are deployed together. linux/amd64 because the Fargate task below runs on x86 (default).
# `image.ref` includes the content digest, so a code change produces a new task definition and a new deployment.
# Pulumi docs: https://www.pulumi.com/registry/packages/docker-build/api-docs/image/
# Docker docs: https://docs.docker.com/build/
image = docker_build.Image(
    "server-image",
    tags=[repo.repository_url.apply(lambda url: f"{url}:latest")],
    context=docker_build.BuildContextArgs(location=str(SERVER_DIR)),
    platforms=[docker_build.Platform.LINUX_AMD64],
    push=True,
    registries=[
        docker_build.RegistryArgs(
            address=repo.repository_url, username=ecr_auth.user_name, password=ecr_auth.password
        )
    ],
)

# ================================================================== application tier (ECS Fargate + ALB)
# CloudWatch log group for container stdout/stderr. 7-day retention prevents logs from accumulating (and billing).
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/cloudwatch/loggroup/
# AWS docs:    https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/Working-with-log-groups-and-streams.html
log_group = aws.cloudwatch.LogGroup("server-logs", retention_in_days=7)

# Trust policy: only the ECS tasks service may assume this role.
# AWS docs: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_principal.html
assume_ecs = json.dumps(
    {
        "Version": "2012-10-17",
        "Statement": [
            {"Effect": "Allow", "Principal": {"Service": "ecs-tasks.amazonaws.com"}, "Action": "sts:AssumeRole"}
        ],
    }
)

# Task EXECUTION role = what ECS itself uses to start the task: pull the image from ECR, write logs, read secrets.
# It is different from a task role (what your app code can call); this app calls no AWS APIs, so it has none.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/iam/role/
# AWS docs:    https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html
execution_role = aws.iam.Role("task-execution-role", assume_role_policy=assume_ecs)

# AWS-managed policy: ECR pull + CloudWatch Logs write.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/iam/rolepolicyattachment/
aws.iam.RolePolicyAttachment(
    "task-execution-policy",
    role=execution_role.name,
    policy_arn="arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
)

# Inline policy: least privilege, read exactly one secret (the managed policy above does not include Secrets Manager).
# The policy JSON needs the secret ARN, an Output, so it is built inside `apply`.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/iam/rolepolicy/
# AWS docs:    https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html
aws.iam.RolePolicy(
    "task-execution-secret-access",
    role=execution_role.id,
    policy=app_secret.arn.apply(
        lambda arn: json.dumps(
            {
                "Version": "2012-10-17",
                "Statement": [{"Effect": "Allow", "Action": "secretsmanager:GetSecretValue", "Resource": arn}],
            }
        )
    ),
)

# ECS cluster: just a logical grouping; with Fargate there are no servers to manage in it.
# The `containerInsights` setting makes ECS publish per-cluster/service/task CPU, memory, network and storage metrics
# (namespace ECS/ContainerInsights) plus performance logs. Basic CPU/memory service metrics (AWS/ECS) are free
# without it; Insights adds task-level detail and is billed as custom metrics + log ingestion.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/ecs/cluster/
# AWS docs:    https://docs.aws.amazon.com/AmazonECS/latest/developerguide/clusters.html
#              https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/ContainerInsights.html
cluster = aws.ecs.Cluster(
    "cluster",
    settings=[
        aws.ecs.ClusterSettingArgs(name="containerInsights", value="enabled" if container_insights else "disabled")
    ],
)
region = aws.get_region().name  # needed by the awslogs driver config below

# Task definition = the recipe for one task (like a docker-compose service).
# - cpu "256" / memory "512" is the smallest valid Fargate combination (0.25 vCPU / 0.5 GB). Strings, not ints.
# - network_mode "awsvpc": the task gets its own ENI, so security groups apply to the task itself.
# - "secrets" with valueFrom "<secret-arn>:<json-key>::" extracts one key from the JSON secret into an env var.
# - "awslogs" sends container output to the log group above.
# `Output.all(...).apply` waits for all three Outputs, then builds the JSON string the API expects.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/ecs/taskdefinition/
# AWS docs:    https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definitions.html
#              https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-defs.html
#              https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html#secrets-envvar-secrets-manager-update-container-definition
#              https://docs.aws.amazon.com/AmazonECS/latest/developerguide/using_awslogs.html
task_definition = aws.ecs.TaskDefinition(
    "server-task",
    family="three-tier-server",
    cpu="256",
    memory="512",
    network_mode="awsvpc",
    requires_compatibilities=["FARGATE"],
    execution_role_arn=execution_role.arn,
    container_definitions=pulumi.Output.all(image.ref, app_secret.arn, log_group.name).apply(
        lambda a: json.dumps(
            [
                {
                    "name": "server",
                    "image": a[0],
                    "essential": True,
                    "portMappings": [{"containerPort": APP_PORT, "protocol": "tcp"}],
                    "secrets": [
                        {"name": "DATABASE_URL", "valueFrom": f"{a[1]}:DATABASE_URL::"},
                        {"name": "JWT_SECRET", "valueFrom": f"{a[1]}:JWT_SECRET::"},
                    ],
                    "logConfiguration": {
                        "logDriver": "awslogs",
                        "options": {
                            "awslogs-group": a[2],
                            "awslogs-region": region,
                            "awslogs-stream-prefix": "server",
                        },
                    },
                }
            ]
        )
    ),
)

# Application Load Balancer in the public subnets (>= 2 AZs). It is the single entry point for /api traffic and
# health-checks the task. Its SG only admits CloudFront.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/lb/loadbalancer/
# AWS docs:    https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html
alb = aws.lb.LoadBalancer(
    "alb",
    load_balancer_type="application",
    subnets=[s.id for s in public_subnets],
    security_groups=[alb_sg.id],
)

# Target group = the pool the ALB forwards to. target_type "ip" is required for Fargate/awsvpc (tasks register by
# ENI IP, not instance id). The health check hits the app's /api/health; unhealthy tasks are replaced.
# deregistration_delay=10 s (default 300) makes deploys and destroys fast; fine because requests are short.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/lb/targetgroup/
# AWS docs:    https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html
#              https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html
target_group = aws.lb.TargetGroup(
    "server-tg",
    port=APP_PORT,
    protocol="HTTP",
    target_type="ip",
    vpc_id=vpc.id,
    health_check=aws.lb.TargetGroupHealthCheckArgs(path="/api/health", matcher="200", interval=15),
    deregistration_delay=10,
)

# Listener: what the ALB does with connections on :80 - forward everything to the target group. HTTP only because
# CloudFront (not the browser) talks to the ALB and there is no custom domain/certificate (ADR 0004).
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/lb/listener/
# AWS docs:    https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-listeners.html
listener = aws.lb.Listener(
    "alb-http",
    load_balancer_arn=alb.arn,
    port=80,
    protocol="HTTP",
    default_actions=[aws.lb.ListenerDefaultActionArgs(type="forward", target_group_arn=target_group.arn)],
)

# ECS service = keeps `desired_count` tasks running, replaces failed ones, and registers them with the target group.
# - assign_public_ip=True: the task is in a public subnet and needs a public IP to reach ECR / Secrets Manager /
#   CloudWatch without a NAT gateway (the trade-off is explained in ADR 0004; the SG still blocks inbound).
# - health_check_grace_period_seconds=60: ALB health failures are ignored while the container runs migrations
#   and boots, so the service does not kill it in a loop.
# - depends_on listener: the target group must be attached to a listener before the service can use it.
#   depends_on db: start the app only after the database exists (otherwise the first start fails and retries).
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/ecs/service/
# AWS docs:    https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs_services.html
#              https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-load-balancing.html
#              https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html
service = aws.ecs.Service(
    "server-service",
    cluster=cluster.arn,
    task_definition=task_definition.arn,
    desired_count=1,
    launch_type="FARGATE",
    health_check_grace_period_seconds=60,
    network_configuration=aws.ecs.ServiceNetworkConfigurationArgs(
        subnets=[s.id for s in public_subnets],
        security_groups=[app_sg.id],
        assign_public_ip=True,  # no NAT: the task pulls from ECR and ships logs over its public IP
    ),
    load_balancers=[
        aws.ecs.ServiceLoadBalancerArgs(target_group_arn=target_group.arn, container_name="server", container_port=APP_PORT)
    ],
    opts=pulumi.ResourceOptions(depends_on=[listener, db]),
)

# ================================================================== presentation tier (S3 + CloudFront)
# Private bucket for the built React files. force_destroy=True empties it on destroy (otherwise a non-empty bucket
# blocks deletion).
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/s3/bucketv2/
# AWS docs:    https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingBucket.html
bucket = aws.s3.BucketV2("client", force_destroy=True)

# Belt and braces: block every form of public access. CloudFront reads the bucket via OAC (below), not publicly.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/s3/bucketpublicaccessblock/
# AWS docs:    https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html
aws.s3.BucketPublicAccessBlock(
    "client-block",
    bucket=bucket.id,
    block_public_acls=True,
    block_public_policy=True,
    ignore_public_acls=True,
    restrict_public_buckets=True,
)

# Fail early with a clear message instead of deploying an empty site.
if not (CLIENT_DIST / "index.html").exists():
    raise Exception(f"{CLIENT_DIST} not found: run `npm install && npm run build` in client/ first")

# Upload every built file as its own S3 object. Pulumi tracks each file by content hash (FileAsset), so only
# changed files are re-uploaded. Vite names assets with a content hash (index-Coi5A9vW.js), so they can be cached
# "forever" (immutable); index.html is the entry point that references them and must always be revalidated.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/s3/bucketobjectv2/
#              https://www.pulumi.com/docs/iac/concepts/assets-archives/
# AWS docs:    https://docs.aws.amazon.com/AmazonS3/latest/userguide/UploadingObjects.html
#              https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
for path in sorted(p for p in CLIENT_DIST.rglob("*") if p.is_file()):
    key = path.relative_to(CLIENT_DIST).as_posix()
    aws.s3.BucketObjectv2(
        f"client-{key}",
        bucket=bucket.id,
        key=key,
        source=pulumi.FileAsset(str(path)),
        content_type=mimetypes.guess_type(key)[0] or "application/octet-stream",  # S3 does not guess; browsers need it
        cache_control="no-cache" if key == "index.html" else "public, max-age=31536000, immutable",
    )

# Origin Access Control: CloudFront signs its requests to S3 (SigV4), so the bucket can stay private and only
# accept requests from our distribution. OAC replaces the older Origin Access Identity (OAI).
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/cloudfront/originaccesscontrol/
# AWS docs:    https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
oac = aws.cloudfront.OriginAccessControl(
    "client-oac",
    origin_access_control_origin_type="s3",
    signing_behavior="always",
    signing_protocol="sigv4",
)

# AWS-managed policies looked up by name (instead of hard-coding their ids):
# - CachingOptimized: cache static files, compress, honour Cache-Control from S3.
# - CachingDisabled: never cache (API responses are per-user).
# - AllViewerExceptHostHeader: forward all viewer headers (incl. Authorization), cookies and query strings to the
#   origin, but not Host (the ALB needs its own host name, not the CloudFront one).
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/cloudfront/getcachepolicy/
#              https://www.pulumi.com/registry/packages/aws/api-docs/cloudfront/getoriginrequestpolicy/
# AWS docs:    https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html
#              https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html
caching_optimized = aws.cloudfront.get_cache_policy(name="Managed-CachingOptimized")
caching_disabled = aws.cloudfront.get_cache_policy(name="Managed-CachingDisabled")
all_viewer_no_host = aws.cloudfront.get_origin_request_policy(name="Managed-AllViewerExceptHostHeader")

# The CloudFront distribution: the one public URL (https://dxxxx.cloudfront.net).
# - origins: S3 (private, via OAC) for the site; the ALB (custom origin, plain HTTP) for the API.
# - default behavior (/*) -> S3, redirect HTTP to HTTPS, GET/HEAD only, cached.
# - ordered behavior (/api/*) -> ALB, HTTPS only, all methods, never cached, headers (Authorization) forwarded.
#   Because the browser sees one origin, there is no CORS and the client simply calls "/api/...".
# - custom_error_responses: S3 returns 403 for keys that do not exist (private bucket). For SPA routes such as
#   /admin/users we answer with index.html and status 200 and let React Router render the page.
# - price_class 100 = cheapest edge locations (North America + Europe).
# - cloudfront_default_certificate: free *.cloudfront.net HTTPS cert; a custom domain would need an ACM cert in us-east-1.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/cloudfront/distribution/
# AWS docs:    https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-web.html
#              https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-web-values-specify.html
#              https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/GeneratingCustomErrorResponses.html
#              https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/PriceClass.html
distribution = aws.cloudfront.Distribution(
    "cdn",
    enabled=True,
    default_root_object="index.html",
    price_class="PriceClass_100",
    origins=[
        aws.cloudfront.DistributionOriginArgs(
            origin_id="s3-client",
            domain_name=bucket.bucket_regional_domain_name,  # regional name avoids S3 redirect delays after creation
            origin_access_control_id=oac.id,
        ),
        aws.cloudfront.DistributionOriginArgs(
            origin_id="alb-api",
            domain_name=alb.dns_name,
            custom_origin_config=aws.cloudfront.DistributionOriginCustomOriginConfigArgs(
                http_port=80,
                https_port=443,
                origin_protocol_policy="http-only",
                origin_ssl_protocols=["TLSv1.2"],
            ),
        ),
    ],
    default_cache_behavior=aws.cloudfront.DistributionDefaultCacheBehaviorArgs(
        target_origin_id="s3-client",
        viewer_protocol_policy="redirect-to-https",
        allowed_methods=["GET", "HEAD"],
        cached_methods=["GET", "HEAD"],
        cache_policy_id=caching_optimized.id,
        compress=True,
    ),
    ordered_cache_behaviors=[
        aws.cloudfront.DistributionOrderedCacheBehaviorArgs(
            path_pattern="/api/*",
            target_origin_id="alb-api",
            viewer_protocol_policy="https-only",
            allowed_methods=["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
            cached_methods=["GET", "HEAD"],
            cache_policy_id=caching_disabled.id,
            origin_request_policy_id=all_viewer_no_host.id,
        )
    ],
    # SPA routing: unknown paths (/admin/users) are served by index.html and handled by React Router.
    custom_error_responses=[
        aws.cloudfront.DistributionCustomErrorResponseArgs(
            error_code=code, response_code=200, response_page_path="/index.html", error_caching_min_ttl=0
        )
        for code in (403, 404)
    ],
    restrictions=aws.cloudfront.DistributionRestrictionsArgs(
        geo_restriction=aws.cloudfront.DistributionRestrictionsGeoRestrictionArgs(restriction_type="none")
    ),
    viewer_certificate=aws.cloudfront.DistributionViewerCertificateArgs(cloudfront_default_certificate=True),
)

# Bucket policy completing OAC: allow the CloudFront service principal to GetObject, but only when the request comes
# from THIS distribution (AWS:SourceArn condition). Created after the distribution because it needs its ARN.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/s3/bucketpolicy/
# AWS docs:    https://docs.aws.amazon.com/AmazonS3/latest/userguide/bucket-policies.html
#              https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html#oac-permission-to-access-s3
aws.s3.BucketPolicy(
    "client-policy",
    bucket=bucket.id,
    policy=pulumi.Output.all(bucket.arn, distribution.arn).apply(
        lambda a: json.dumps(
            {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {"Service": "cloudfront.amazonaws.com"},
                        "Action": "s3:GetObject",
                        "Resource": f"{a[0]}/*",
                        "Condition": {"StringEquals": {"AWS:SourceArn": a[1]}},
                    }
                ],
            }
        )
    ),
)

# ================================================================== monitoring (CloudWatch)
# Logs are already collected (log group above). Here: an SNS topic for notifications, alarms on the signals that
# matter for each tier, and one dashboard. Built-in AWS metrics are free; each standard alarm is $0.10/month.
# AWS docs: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html
#           https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/aws-services-cloudwatch-metrics.html

# SNS topic that alarms publish to. An email subscription is created only when `alarmEmail` is configured; AWS sends
# a confirmation mail and nothing is delivered until the link in it is clicked.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/sns/topic/
#              https://www.pulumi.com/registry/packages/aws/api-docs/sns/topicsubscription/
# AWS docs:    https://docs.aws.amazon.com/sns/latest/dg/sns-email-notifications.html
alarm_topic = aws.sns.Topic("alarms")
if alarm_email:
    aws.sns.TopicSubscription("alarm-email", topic=alarm_topic.arn, protocol="email", endpoint=alarm_email)


def alarm(name, description, namespace, metric, dimensions, threshold, comparison="GreaterThanThreshold",
          statistic="Average", periods=2, treat_missing="notBreaching"):
    """One CloudWatch alarm that notifies `alarm_topic` when it fires and when it recovers.

    - period 60 s x `periods` evaluation periods: alarm after N consecutive bad minutes, which filters one-off spikes.
    - treat_missing "notBreaching": no data (for example no traffic, so no ALB metrics) is not an outage.
    Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/cloudwatch/metricalarm/
    AWS docs:    https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html
                 https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/alarm-evaluate-missing-data.html
    """
    return aws.cloudwatch.MetricAlarm(
        name,
        alarm_description=description,
        namespace=namespace,
        metric_name=metric,
        dimensions=dimensions,
        statistic=statistic,
        period=60,
        evaluation_periods=periods,
        threshold=threshold,
        comparison_operator=comparison,
        treat_missing_data=treat_missing,
        alarm_actions=[alarm_topic.arn],
        ok_actions=[alarm_topic.arn],
    )


# Presentation + application tier entry point: the ALB. Dimension values are the ARN suffixes ("app/name/id"), not
# full ARNs. 5xx generated by the targets (our app crashing) vs unhealthy hosts (health check failing).
# AWS docs: https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-cloudwatch-metrics.html
alb_dims = {"LoadBalancer": alb.arn_suffix, "TargetGroup": target_group.arn_suffix}
alarm("alarm-alb-5xx", "App returned 5xx responses", "AWS/ApplicationELB", "HTTPCode_Target_5XX_Count",
      alb_dims, threshold=5, statistic="Sum")
alarm("alarm-unhealthy-hosts", "No healthy task behind the ALB", "AWS/ApplicationELB", "UnHealthyHostCount",
      alb_dims, threshold=0)

# Application tier: the ECS service. CPU/memory as a % of the task's reservation (256 CPU units / 512 MB).
# AWS docs: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/available-metrics.html
ecs_dims = {"ClusterName": cluster.name, "ServiceName": service.name}
alarm("alarm-ecs-cpu", "Task CPU above 80%", "AWS/ECS", "CPUUtilization", ecs_dims, threshold=80, periods=3)
alarm("alarm-ecs-memory", "Task memory above 80%", "AWS/ECS", "MemoryUtilization", ecs_dims, threshold=80, periods=3)

# Data tier: RDS. FreeStorageSpace is in bytes; 2 GiB is 10% of the 20 GB disk (a full disk makes PostgreSQL read-only).
# AWS docs: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-metrics.html
rds_dims = {"DBInstanceIdentifier": db.identifier}
alarm("alarm-rds-cpu", "Database CPU above 80% (t4g is burstable: sustained load drains CPU credits)",
      "AWS/RDS", "CPUUtilization", rds_dims, threshold=80, periods=5)
alarm("alarm-rds-storage", "Database free storage below 2 GiB", "AWS/RDS", "FreeStorageSpace", rds_dims,
      threshold=2 * 1024**3, comparison="LessThanThreshold", periods=1)

# One dashboard with a row per tier. Widgets are plain metric references; the body is JSON built from Outputs.
# The first 3 dashboards per account are free, then $3/month each.
# Pulumi docs: https://www.pulumi.com/registry/packages/aws/api-docs/cloudwatch/dashboard/
# AWS docs:    https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/CloudWatch-Dashboard-Body-Structure.html
def _widget(x, title, metrics, stat="Average", y=0):
    return {
        "type": "metric",
        "x": x, "y": y, "width": 8, "height": 6,
        "properties": {"title": title, "metrics": metrics, "stat": stat, "period": 60, "region": region, "view": "timeSeries"},
    }


aws.cloudwatch.Dashboard(
    "dashboard",
    dashboard_name=pulumi.Output.concat("three-tier-", pulumi.get_stack()),
    dashboard_body=pulumi.Output.all(alb.arn_suffix, target_group.arn_suffix, cluster.name, service.name, db.identifier).apply(
        lambda a: json.dumps(
            {
                "widgets": [
                    _widget(0, "ALB requests", [["AWS/ApplicationELB", "RequestCount", "LoadBalancer", a[0]]], "Sum"),
                    _widget(8, "ALB 5xx (target)", [["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", a[0], "TargetGroup", a[1]]], "Sum"),
                    _widget(16, "Target response time (s)", [["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", a[0], "TargetGroup", a[1]]]),
                    _widget(0, "ECS CPU %", [["AWS/ECS", "CPUUtilization", "ClusterName", a[2], "ServiceName", a[3]]], y=6),
                    _widget(8, "ECS memory %", [["AWS/ECS", "MemoryUtilization", "ClusterName", a[2], "ServiceName", a[3]]], y=6),
                    _widget(16, "Healthy hosts", [["AWS/ApplicationELB", "HealthyHostCount", "LoadBalancer", a[0], "TargetGroup", a[1]]], "Minimum", y=6),
                    _widget(0, "RDS CPU %", [["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", a[4]]], y=12),
                    _widget(8, "RDS connections", [["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", a[4]]], y=12),
                    _widget(16, "RDS free storage (bytes)", [["AWS/RDS", "FreeStorageSpace", "DBInstanceIdentifier", a[4]]], "Minimum", y=12),
                ]
            }
        )
    ),
)

# ================================================================== outputs
# Stack outputs: shown after `pulumi up` and readable with `pulumi stack output <name>`. The last four are what the
# README's one-off "seed users" command (aws ecs run-task) needs.
# https://www.pulumi.com/docs/iac/concepts/inputs-outputs/#stack-outputs
pulumi.export("url", pulumi.Output.concat("https://", distribution.domain_name))
pulumi.export("alb_dns", alb.dns_name)
pulumi.export("cluster", cluster.name)
pulumi.export("task_definition", task_definition.arn)
pulumi.export("subnets", [s.id for s in public_subnets])
pulumi.export("app_security_group", app_sg.id)
pulumi.export("db_endpoint", db.address)
pulumi.export("log_group", log_group.name)
pulumi.export("alarm_topic", alarm_topic.arn)
pulumi.export(
    "dashboard_url",
    pulumi.Output.concat("https://", region, ".console.aws.amazon.com/cloudwatch/home?region=", region, "#dashboards:"),
)
