import { db, firestoreAdmin } from "../lib/db";

async function main() {
  const employeeRole = await db.role.findUnique({ where: { name: "Employee" } });
  if (!employeeRole) {
    throw new Error("The Employee role is missing. Seed the SourceHub roles first.");
  }

  const snapshot = await firestoreAdmin.collection("employees").get();
  let synced = 0;

  for (const document of snapshot.docs) {
    const employee = document.data();
    // Phase 7 supports preboarding records without accounts. Only sync legacy
    // records that explicitly carry an email or an existing account link.
    const email = String(employee.workEmail ?? employee.email ?? "").trim().toLowerCase();
    if ((!email && !employee.userId) || (employee.accountState === "NOT_LINKED" && !employee.userId)) continue;
    const existing = await db.user.findUnique({
      where: { employeeNumber: employee.employeeNumber },
    });

    const user = existing
      ? await db.user.update({
          where: { id: existing.id },
          data: {
            firstName: employee.firstName,
            lastName: employee.lastName,
            email,
            phone: employee.mobileNumber ?? employee.phone ?? null,
            jobTitle: employee.jobTitle ?? null,
            department: employee.departmentName ?? employee.department ?? null,
            status: employee.status ?? "ACTIVE",
          },
        })
      : await db.user.create({
          data: {
            employeeNumber: employee.employeeNumber,
            firstName: employee.firstName,
            lastName: employee.lastName,
            email,
            passwordHash: null,
            phone: employee.mobileNumber ?? employee.phone ?? null,
            jobTitle: employee.jobTitle ?? null,
            department: employee.departmentName ?? employee.department ?? null,
            profileImageUrl: null,
            status: employee.status ?? "ACTIVE",
          },
        });

    const assignment = await db.userRole.findFirst({
      where: { userId: user.id, roleId: employeeRole.id },
    });
    if (!assignment) {
      await db.userRole.create({ data: { userId: user.id, roleId: employeeRole.id } });
    }
    await firestoreAdmin.collection("employees").doc(document.id).set({
      userId: user.id,
      accountState: employee.accountState === "DISABLED" ? "DISABLED" : "ACTIVE",
      updatedAt: new Date(),
    }, { merge: true });
    synced += 1;
  }

  console.log(`Synced ${synced} employees into the SourceHub user directory.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
