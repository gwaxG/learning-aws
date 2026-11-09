"""Unit tests with Pulumi mocks: no AWS account or Docker needed.

https://www.pulumi.com/docs/iac/concepts/testing/unit/
"""
from pathlib import Path

import pulumi


class Mocks(pulumi.runtime.Mocks):
    def new_resource(self, args: pulumi.runtime.MockResourceArgs):
        outputs = dict(args.inputs)
        outputs.setdefault("arn", f"arn:aws:mock:::{args.name}")
        outputs.setdefault("name", args.name)
        outputs.setdefault("arnSuffix", f"suffix/{args.name}/id")
        outputs.setdefault("identifier", args.name)
        outputs.setdefault("address", f"{args.name}.mock.local")
        outputs.setdefault("dnsName", f"{args.name}.mock.local")
        outputs.setdefault("domainName", f"{args.name}.cloudfront.mock")
        outputs.setdefault("bucketRegionalDomainName", f"{args.name}.s3.mock")
        outputs.setdefault("repositoryUrl", "123456789012.dkr.ecr.eu-west-1.amazonaws.com/server")
        outputs.setdefault("registryId", "123456789012")
        outputs.setdefault("ref", "123456789012.dkr.ecr.eu-west-1.amazonaws.com/server:latest@sha256:abc")
        return f"{args.name}-id", outputs

    def call(self, args: pulumi.runtime.MockCallArgs):
        if args.token == "aws:index/getAvailabilityZones:getAvailabilityZones":
            return {"names": ["eu-west-1a", "eu-west-1b", "eu-west-1c"]}
        if args.token == "aws:index/getRegion:getRegion":
            return {"name": "eu-west-1"}
        if args.token == "aws:ecr/getAuthorizationToken:getAuthorizationToken":
            return {"userName": "AWS", "password": "x"}
        return {"id": "mock-id"}


pulumi.runtime.set_mocks(Mocks(), project="three-tier", stack="test", preview=False)
pulumi.runtime.set_all_config({"three-tier:dbPassword": "pw", "three-tier:jwtSecret": "jwt"}, ["three-tier:dbPassword", "three-tier:jwtSecret"])

DIST = Path(__file__).resolve().parents[2] / "client" / "dist"
if not (DIST / "index.html").exists():
    DIST.mkdir(parents=True, exist_ok=True)
    (DIST / "index.html").write_text("<!doctype html>")

import importlib.util  # noqa: E402

_spec = importlib.util.spec_from_file_location("infra", Path(__file__).resolve().parents[1] / "__main__.py")
infra = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(infra)


@pulumi.runtime.test
def test_database_is_private_and_encrypted():
    def check(args):
        public, encrypted = args
        assert public is False
        assert encrypted is True

    return pulumi.Output.all(infra.db.publicly_accessible, infra.db.storage_encrypted).apply(check)


@pulumi.runtime.test
def test_db_only_reachable_from_app_sg():
    def check(ingress):
        assert len(ingress) == 1 and ingress[0]["from_port"] == 5432
        assert not ingress[0].get("cidr_blocks")

    return infra.db_sg.ingress.apply(check)


def test_two_azs():
    assert len(infra.public_subnets) == 2 and len(infra.private_subnets) == 2


@pulumi.runtime.test
def test_container_insights_enabled_by_default():
    def check(settings):
        assert [(s["name"], s["value"]) for s in settings] == [("containerInsights", "enabled")]

    return infra.cluster.settings.apply(check)


@pulumi.runtime.test
def test_fargate_task_is_small():
    def check(args):
        assert args == ["256", "512"]

    return pulumi.Output.all(infra.task_definition.cpu, infra.task_definition.memory).apply(check)
