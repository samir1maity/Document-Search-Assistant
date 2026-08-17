-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sectionTitle" TEXT,
    "text" TEXT NOT NULL,
    "startPage" INTEGER NOT NULL,
    "endPage" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParentChunk_documentId_idx" ON "ParentChunk"("documentId");

-- AddForeignKey
ALTER TABLE "ParentChunk" ADD CONSTRAINT "ParentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
