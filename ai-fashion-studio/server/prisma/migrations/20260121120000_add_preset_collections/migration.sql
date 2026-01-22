-- CreateTable
CREATE TABLE "preset_collections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "preset_collections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "preset_collections_user_id_created_at_idx" ON "preset_collections"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "preset_collections_user_id_name_key" ON "preset_collections"("user_id", "name");

-- AddForeignKey
ALTER TABLE "preset_collections" ADD CONSTRAINT "preset_collections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
