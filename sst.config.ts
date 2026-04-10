/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "nz-inventory",
      removal: input?.stage === "prod" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: { region: "ap-southeast-2" },
        random: "4.16.7",
      },
    };
  },
  async run() {
    const vpc = new sst.aws.Vpc("Vpc", { nat: "managed" });

    const dbPassword = new random.RandomPassword("DbPassword", {
      length: 32,
      special: false,
    });

    const subnetGroup = new aws.rds.SubnetGroup("DbSubnets", {
      name: `nz-inventory-${$app.stage}-db-subnets`,
      subnetIds: vpc.publicSubnets,
    });

    const dbSg = new aws.ec2.SecurityGroup("DbSg", {
      vpcId: vpc.id,
      description: "NZ Inventory Postgres",
      ingress: [
        {
          protocol: "tcp",
          fromPort: 5432,
          toPort: 5432,
          cidrBlocks: [
            "139.180.65.216/32", // developer bootstrap IP
            "10.0.0.0/16",       // VPC internal for Fargate tasks
          ],
          description: "Postgres",
        },
      ],
      egress: [
        { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
      ],
    });

    const db = new aws.rds.Instance("Db", {
      identifier: `nz-inventory-${$app.stage}`,
      engine: "postgres",
      engineVersion: "16.13",
      instanceClass: "db.t4g.micro",
      allocatedStorage: 20,
      storageType: "gp2",
      dbName: "nz_inventory",
      username: "nzadmin",
      password: dbPassword.result,
      dbSubnetGroupName: subnetGroup.name,
      vpcSecurityGroupIds: [dbSg.id],
      publiclyAccessible: true,
      skipFinalSnapshot: true,
      deletionProtection: false,
      backupRetentionPeriod: 0,
      applyImmediately: true,
      autoMinorVersionUpgrade: true,
    });

    const databaseUrl = $interpolate`postgresql://${db.username}:${dbPassword.result}@${db.endpoint}/${db.dbName}?schema=public&sslmode=require`;

    // Fargate cluster + service with a public ALB (no CloudFront needed).
    const cluster = new sst.aws.Cluster("Cluster", { vpc });

    const web = new sst.aws.Service("Web", {
      cluster,
      cpu: "0.25 vCPU",
      memory: "0.5 GB",
      scaling: { min: 1, max: 2 },
      loadBalancer: {
        ports: [{ listen: "80/http", forward: "3000/http" }],
      },
      image: "186048966327.dkr.ecr.ap-southeast-2.amazonaws.com/nz-inventory:latest",
      architecture: "arm64",
      health: {
        command: ["CMD-SHELL", "curl -f http://localhost:3000/ || exit 1"],
        interval: "30 seconds",
        startPeriod: "60 seconds",
      },
      environment: {
        DATABASE_URL: databaseUrl,
        DIRECT_URL: databaseUrl,
        NEXT_PUBLIC_SUPABASE_URL: "https://stub.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "stub",
        SUPABASE_SERVICE_ROLE_KEY: "stub",
        DEV_AUTH_BYPASS: "true",
        DEV_USER_EMAIL: "owner@example.co.nz",
        QBO_CLIENT_ID: "",
        QBO_CLIENT_SECRET: "",
        QBO_REDIRECT_URI: "",
        QBO_ENVIRONMENT: "sandbox",
        QBO_ENCRYPTION_KEY: "ZGV2LWVuY3J5cHRpb24ta2V5LTMyYnl0ZXMtZm9yLXRlc3Rpbmch",
        APP_URL: "",
        CRON_SECRET: "stub-cron-secret",
        ADMIN_EMAIL: "owner@example.co.nz",
      },
    });

    return {
      url: web.url,
      dbEndpoint: db.endpoint,
      dbUsername: db.username,
      dbPassword: dbPassword.result,
      dbName: db.dbName,
    };
  },
});
