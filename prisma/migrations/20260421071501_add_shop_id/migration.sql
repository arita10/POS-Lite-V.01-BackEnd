-- Add shopId to License table, generating a UUID for every existing row

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_License" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))),
    "key" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxDevices" INTEGER NOT NULL DEFAULT 2,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Copy existing rows — shopId DEFAULT generates a UUID automatically for each
INSERT INTO "new_License" ("id", "key", "customerName", "customerEmail", "expiresAt", "isActive", "maxDevices", "notes", "createdAt", "updatedAt")
SELECT "id", "key", "customerName", "customerEmail", "expiresAt", "isActive", "maxDevices", "notes", "createdAt", "updatedAt"
FROM "License";

DROP TABLE "License";
ALTER TABLE "new_License" RENAME TO "License";

CREATE UNIQUE INDEX "License_shopId_key" ON "License"("shopId");
CREATE UNIQUE INDEX "License_key_key" ON "License"("key");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
