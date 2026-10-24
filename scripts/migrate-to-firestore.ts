import { loadEnvConfig } from "@next/env";
import { Prisma, PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());

const BATCH_SIZE = 200;
const args = new Set(process.argv.slice(2));
const modelArg = process.argv.find((arg) => arg.startsWith("--model="));
const requestedModel = modelArg?.slice("--model=".length);
const writeEnabled = args.has("--write");

type Row = Record<string, unknown>;
type ModelReader = { findMany(): Promise<Row[]> };

function delegateName(modelName: string): string {
  return modelName[0].toLowerCase() + modelName.slice(1);
}

function safeUserDocument(row: Row): Row {
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== "pinHash" && key !== "googleId"));
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const { firebaseAdminFirestore } = await import("../lib/firebase/admin-core");
    const models = Prisma.dmmf.datamodel.models.filter((model) => !requestedModel || model.name === requestedModel);
    if (requestedModel && models.length === 0) {
      throw new Error(`Unknown Prisma model "${requestedModel}"`);
    }

    const target = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!target) throw new Error("Set FIREBASE_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID");
    console.log(`${writeEnabled ? "IMPORTING" : "DRY RUN"} Prisma data into Firebase project ${target}`);
    if (!writeEnabled) console.log("No Firestore writes will occur. Re-run with --write to import.");

    for (const model of models) {
      const idField = model.fields.find((field) => field.isId)?.name;
      if (!idField) throw new Error(`Model ${model.name} has no single-field primary key`);

      const reader = (prisma as unknown as Record<string, ModelReader>)[delegateName(model.name)];
      if (!reader) throw new Error(`Prisma delegate not found for model ${model.name}`);

      const rows = await reader.findMany();
      console.log(`${model.name}: ${rows.length} records`);
      if (!writeEnabled || rows.length === 0) continue;

      for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
        const batch = firebaseAdminFirestore.batch();
        const page = rows.slice(offset, offset + BATCH_SIZE);
        for (const row of page) {
          const rawId = row[idField];
          if (typeof rawId !== "string" || !rawId || rawId.includes("/")) {
            throw new Error(`${model.name} has an invalid Firestore document ID`);
          }

          const document = model.name === "User" ? safeUserDocument(row) : row;
          batch.set(firebaseAdminFirestore.collection(model.name).doc(rawId), document);

          if (model.name === "User" && typeof row.pinHash === "string") {
            batch.set(firebaseAdminFirestore.collection("authCredentials").doc(rawId), {
              pinHash: row.pinHash,
              googleId: row.googleId ?? null,
            });
          }
        }
        await batch.commit();
        console.log(`  Imported ${Math.min(offset + page.length, rows.length)} / ${rows.length}`);
      }
    }
    console.log(writeEnabled ? "Import complete. The Prisma source database was not modified." : "Dry run complete.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Firestore import failed:", error);
  process.exitCode = 1;
});
