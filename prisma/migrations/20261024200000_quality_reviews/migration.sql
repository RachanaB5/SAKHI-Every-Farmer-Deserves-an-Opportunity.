-- AlterTable
ALTER TABLE "Batch" ADD COLUMN "aiConfidence" REAL;
ALTER TABLE "Batch" ADD COLUMN "aiCropMatch" TEXT;
ALTER TABLE "Batch" ADD COLUMN "aiDetectedCrop" TEXT;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "link" TEXT,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "listingId" TEXT,
    "rating" INTEGER NOT NULL,
    "issue" TEXT,
    "comment" TEXT,
    "photoUrl" TEXT,
    "photoCrop" TEXT,
    "photoFreshness" REAL,
    "photoVerdict" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feedback_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Feedback_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Feedback_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Feedback" ("buyerId", "comment", "createdAt", "id", "issue", "orderId", "photoUrl", "rating") SELECT "buyerId", "comment", "createdAt", "id", "issue", "orderId", "photoUrl", "rating" FROM "Feedback";
DROP TABLE "Feedback";
ALTER TABLE "new_Feedback" RENAME TO "Feedback";
CREATE UNIQUE INDEX "Feedback_orderId_key" ON "Feedback"("orderId");
CREATE INDEX "Feedback_listingId_idx" ON "Feedback"("listingId");
CREATE TABLE "new_Listing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "farmerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "crop" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "pricePerUnit" REAL NOT NULL,
    "suggestedPrice" REAL,
    "totalQty" REAL NOT NULL,
    "availableQty" REAL NOT NULL,
    "reservedQty" REAL NOT NULL DEFAULT 0,
    "minOrderQty" REAL NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "area" TEXT NOT NULL,
    "grade" TEXT,
    "qualityScore" REAL,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "complaintCount" INTEGER NOT NULL DEFAULT 0,
    "gradeUpdatedAt" DATETIME,
    "harvestDate" DATETIME NOT NULL,
    "imageUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Listing_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Listing_farmerId_fkey" FOREIGN KEY ("farmerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Listing" ("area", "availableQty", "batchId", "category", "createdAt", "crop", "farmerId", "grade", "harvestDate", "id", "imageUrl", "minOrderQty", "pricePerUnit", "reservedQty", "status", "suggestedPrice", "title", "totalQty", "unit", "updatedAt") SELECT "area", "availableQty", "batchId", "category", "createdAt", "crop", "farmerId", "grade", "harvestDate", "id", "imageUrl", "minOrderQty", "pricePerUnit", "reservedQty", "status", "suggestedPrice", "title", "totalQty", "unit", "updatedAt" FROM "Listing";
DROP TABLE "Listing";
ALTER TABLE "new_Listing" RENAME TO "Listing";
CREATE UNIQUE INDEX "Listing_batchId_key" ON "Listing"("batchId");
CREATE INDEX "Listing_status_area_idx" ON "Listing"("status", "area");
CREATE INDEX "Listing_crop_idx" ON "Listing"("crop");
CREATE INDEX "Listing_farmerId_idx" ON "Listing"("farmerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");


-- Existing listings start their live score from the approved photo score.
UPDATE "Listing" SET "qualityScore" = (SELECT "aiQualityScore" FROM "Batch" WHERE "Batch"."id" = "Listing"."batchId") WHERE "qualityScore" IS NULL;
