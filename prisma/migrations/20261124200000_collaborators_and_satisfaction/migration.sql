ALTER TYPE "UserRole" ADD VALUE 'COLLABORATOR';

ALTER TABLE "Event"
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "surveyEmailsSentAt" TIMESTAMP(3);

ALTER TABLE "Registration"
  ADD COLUMN "surveyToken" TEXT,
  ADD COLUMN "surveySentAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Registration_surveyToken_key" ON "Registration"("surveyToken");

CREATE TABLE "EventCollaborator" (
  "eventId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventCollaborator_pkey" PRIMARY KEY ("eventId", "userId"),
  CONSTRAINT "EventCollaborator_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EventCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "EventCollaborator_userId_idx" ON "EventCollaborator"("userId");

CREATE TABLE "SatisfactionResponse" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "registrationId" UUID NOT NULL,
  "rating" INTEGER NOT NULL,
  "recommendation" INTEGER NOT NULL,
  "highlights" TEXT,
  "improvements" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SatisfactionResponse_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SatisfactionResponse_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SatisfactionResponse_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SatisfactionResponse_registrationId_key" ON "SatisfactionResponse"("registrationId");
CREATE INDEX "SatisfactionResponse_eventId_createdAt_idx" ON "SatisfactionResponse"("eventId", "createdAt");
