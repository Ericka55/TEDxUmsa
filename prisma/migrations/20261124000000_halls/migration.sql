CREATE TABLE "Hall" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "seatRows" INTEGER NOT NULL,
    "seatColumns" INTEGER NOT NULL,
    "seatLayout" JSONB NOT NULL DEFAULT '[]',
    "photoUrl" TEXT,
    "legacyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hall_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Event" ADD COLUMN "hallId" UUID;

CREATE UNIQUE INDEX "Hall_legacyKey_key" ON "Hall"("legacyKey");
CREATE INDEX "Hall_venue_name_idx" ON "Hall"("venue", "name");
CREATE INDEX "Event_hallId_idx" ON "Event"("hallId");
ALTER TABLE "Event" ADD CONSTRAINT "Event_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE SET NULL ON UPDATE CASCADE;
