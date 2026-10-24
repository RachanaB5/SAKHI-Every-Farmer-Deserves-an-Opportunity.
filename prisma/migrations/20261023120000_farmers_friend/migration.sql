-- CreateTable
CREATE TABLE "AssistantAction" (
    "jti" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "result" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FarmerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "farmName" TEXT NOT NULL,
    "village" TEXT NOT NULL,
    "crops" JSONB NOT NULL,
    "bio" TEXT,
    "upiId" TEXT,
    "assistantWelcomeSeen" BOOLEAN NOT NULL DEFAULT false,
    "assistantAutoVoice" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "FarmerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FarmerProfile" ("bio", "crops", "farmName", "id", "upiId", "userId", "village") SELECT "bio", "crops", "farmName", "id", "upiId", "userId", "village" FROM "FarmerProfile";
DROP TABLE "FarmerProfile";
ALTER TABLE "new_FarmerProfile" RENAME TO "FarmerProfile";
CREATE UNIQUE INDEX "FarmerProfile_userId_key" ON "FarmerProfile"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AssistantAction_userId_idx" ON "AssistantAction"("userId");

