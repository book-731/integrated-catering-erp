BEGIN;
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "authVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "sessions" (
    "id" CHAR(64) NOT NULL,
    "csrfToken" VARCHAR(64) NOT NULL,
    "userId" UUID,
    "authVersion" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_rate_limits" (
    "key" CHAR(64) NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "auth_rate_limits_resetAt_idx" ON "auth_rate_limits"("resetAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Email 使用大小寫不敏感唯一索引；不改寫既有 Email。
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email"));
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_identity_consistent" CHECK (("userId" IS NULL) = ("authVersion" IS NULL));
ALTER TABLE "auth_rate_limits" ADD CONSTRAINT "auth_rate_limit_count_positive" CHECK (count > 0);
COMMIT;
