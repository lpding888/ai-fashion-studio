-- CreateEnum
CREATE TYPE "BillingEventKind" AS ENUM ('RESERVE', 'SETTLE');

-- CreateTable
CREATE TABLE "billing_events" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "BillingEventKind" NOT NULL,
    "event_key" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_events_task_id_event_key_key" ON "billing_events"("task_id", "event_key");

-- CreateIndex
CREATE INDEX "billing_events_created_at_idx" ON "billing_events"("created_at" DESC);

-- CreateIndex
CREATE INDEX "billing_events_task_id_idx" ON "billing_events"("task_id");

-- CreateIndex
CREATE INDEX "billing_events_user_id_idx" ON "billing_events"("user_id");

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

