-- AlterTable
ALTER TABLE "FarmerProfile" ADD COLUMN "assistantAutopilot" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN "farmEta" DATETIME;
ALTER TABLE "Delivery" ADD COLUMN "arrivedAt" DATETIME;
