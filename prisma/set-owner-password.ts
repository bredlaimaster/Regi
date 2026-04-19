/**
 * Bootstrap / reset the owner password.
 * Usage:
 *   OWNER_EMAIL=owner@regionalhealth.co.nz \
 *   OWNER_PASSWORD=... \
 *   DATABASE_URL=postgres://... \
 *   tsx prisma/set-owner-password.ts
 *
 * Creates the user if missing (role=ADMIN) using the tenant specified by
 * OWNER_TENANT_ID, or the first tenant in the DB if only one exists.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

async function main() {
  const email = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD ?? "";
  if (!email) throw new Error("OWNER_EMAIL is required");
  if (password.length < 8) throw new Error("OWNER_PASSWORD must be >= 8 chars");

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } });
      console.log(`Updated password for ${email} (tenant=${existing.tenantId}, role=${existing.role})`);
      return;
    }

    let tenantId = process.env.OWNER_TENANT_ID;
    if (!tenantId) {
      const tenants = await prisma.tenant.findMany({ take: 2 });
      if (tenants.length === 0) throw new Error("No tenants in DB; seed one first");
      if (tenants.length > 1) throw new Error("Multiple tenants; set OWNER_TENANT_ID");
      tenantId = tenants[0].id;
    }

    const created = await prisma.user.create({
      data: { email, role: "ADMIN", passwordHash, tenantId },
    });
    console.log(`Created ADMIN user ${email} (id=${created.id}, tenant=${tenantId})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
