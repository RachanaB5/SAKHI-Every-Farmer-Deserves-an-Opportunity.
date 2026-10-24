// POST /api/admin/users — provision a delivery worker from the admin console.
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { handler, HttpError } from "@/lib/api";
import { coordsFor } from "@/lib/areas";
import { hashPin } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { phoneSchema, pinSchema } from "@/lib/validators/common";

const body = z.object({
  name: z.string().trim().min(2, "Enter the rider's name").max(80),
  phone: phoneSchema,
  pin: pinSchema,
  area: z.string().trim().min(2).max(60),
});

/** Creates an active delivery account and audit-logs its provisioning. */
export const POST = handler({ roles: ["ADMIN"], body }, async ({ user, body }) => {
  const area = await db.serviceArea.findUnique({
    where: { name: body.area },
    select: { name: true, active: true },
  });
  if (!area?.active) throw new HttpError(400, "Choose an active service area");
  if (await db.user.findUnique({ where: { phone: body.phone }, select: { id: true } })) {
    throw new HttpError(409, "An account with this phone number already exists");
  }

  const at = coordsFor(area.name);
  const pinHash = await hashPin(body.pin);
  try {
    return await db.$transaction(async (tx) => {
      const rider = await tx.user.create({
        data: {
          name: body.name,
          phone: body.phone,
          pinHash,
          role: "DELIVERY",
          area: area.name,
          lat: at?.lat,
          lng: at?.lng,
          isAvailable: true,
        },
        select: { id: true, name: true, phone: true, area: true, isAvailable: true },
      });
      await audit(
        {
          actorId: user.id,
          action: "DELIVERY_WORKER_CREATED",
          entity: "User",
          entityId: rider.id,
          meta: { area: rider.area },
        },
        tx,
      );
      return { ...rider, activeRuns: 0, deliveredToday: 0 };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new HttpError(409, "An account with this phone number already exists");
    }
    throw error;
  }
});
