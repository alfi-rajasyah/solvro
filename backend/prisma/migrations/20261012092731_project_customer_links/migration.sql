-- CreateTable
CREATE TABLE "project_links" (
    "id" TEXT NOT NULL,
    "project_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_links" (
    "id" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_links_project_id_idx" ON "project_links"("project_id");

-- CreateIndex
CREATE INDEX "customer_links_customer_id_idx" ON "customer_links"("customer_id");

-- AddForeignKey
ALTER TABLE "project_links" ADD CONSTRAINT "project_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_links" ADD CONSTRAINT "customer_links_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
