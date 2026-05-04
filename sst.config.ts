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
        command: ["CMD-SHELL", "curl -f http://localhost:3000/api/health || exit 1"],
        interval: "30 seconds",
        startPeriod: "60 seconds",
      },
      environment: {
        DATABASE_URL: databaseUrl,
        DIRECT_URL: databaseUrl,
        // Auth: iron-session password-based login (closed system, one client).
        SESSION_SECRET: "9p22SbOCzoOxNwPPqt7SLj0GP0EKpDlij1bKyah80/s=",
        // Supabase stubs — only referenced by product-image storage in actions/products.ts.
        // Replace with real creds when enabling image uploads.
        NEXT_PUBLIC_SUPABASE_URL: "https://stub.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "stub",
        SUPABASE_SERVICE_ROLE_KEY: "stub",
        // QuickBooks
        QBO_CLIENT_ID: "ABo6h1VlyW4cMWKjzLvWplFfNyUPFyXUQDcS6N1jhZ4mEYjhxF",
        QBO_CLIENT_SECRET: "mELEt54FlthhgknZafoAfZ3VpKf90oMSAK0pXcsz",
        QBO_REDIRECT_URI: "http://WebLoadBalancer-tbaambtx-482012902.ap-southeast-2.elb.amazonaws.com/api/qbo/callback",
        QBO_ENVIRONMENT: "sandbox",
        QBO_ENCRYPTION_KEY: "IPV9hSNQr/EpVCdVBkiRnkM0SDPM83B2dD8lpwWS2GA=",
        // App
        APP_URL: "http://WebLoadBalancer-tbaambtx-482012902.ap-southeast-2.elb.amazonaws.com",
        CRON_SECRET: "change-me-in-production",
        ADMIN_EMAIL: "owner@regionalhealth.co.nz",
        // External bug-report intake (Playwright MCP, etc.). Rotate by
        // regenerating (`openssl rand -hex 32`) and re-deploying via SST.
        // Mirror in `.env` for local dev.
        BUG_REPORT_API_TOKEN: "249e059a6609dd27cf7dd8d86dcb258a6f8ac8af71cfddbe927957f580724ed2",
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
