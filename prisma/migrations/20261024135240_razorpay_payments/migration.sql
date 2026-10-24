-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buyerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'RAZORPAY',
    "providerOrderId" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "checkout" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "method" TEXT,
    "groupId" TEXT,
    "failureReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" DATETIME,
    CONSTRAINT "PaymentIntent_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'UPI (simulated)',
    "ref" TEXT NOT NULL,
    "authorisedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedAt" DATETIME,
    "refundedAt" DATETIME,
    "failureReason" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'SIMULATED',
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "providerRefundId" TEXT,
    CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("amount", "authorisedAt", "capturedAt", "failureReason", "id", "method", "orderId", "ref", "refundedAt", "status") SELECT "amount", "authorisedAt", "capturedAt", "failureReason", "id", "method", "orderId", "ref", "refundedAt", "status" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_providerOrderId_key" ON "PaymentIntent"("providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_providerPaymentId_key" ON "PaymentIntent"("providerPaymentId");

-- CreateIndex
CREATE INDEX "PaymentIntent_buyerId_idx" ON "PaymentIntent"("buyerId");
