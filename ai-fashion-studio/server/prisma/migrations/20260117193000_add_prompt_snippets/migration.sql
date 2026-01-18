-- CreateTable
CREATE TABLE "prompt_snippets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prompt_snippets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prompt_snippets_user_id_idx" ON "prompt_snippets"("user_id");

-- CreateIndex
CREATE INDEX "prompt_snippets_updated_at_idx" ON "prompt_snippets"("updated_at" DESC);

-- AddForeignKey
ALTER TABLE "prompt_snippets" ADD CONSTRAINT "prompt_snippets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
