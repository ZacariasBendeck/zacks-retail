-- CreateTable
CREATE TABLE "ProductContent" (
    "ricsSkuCode" TEXT NOT NULL,
    "webDescription" TEXT,
    "heroImageUrl" TEXT,
    "galleryJson" JSONB,
    "specsJson" JSONB,
    "seoSlug" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductContent_pkey" PRIMARY KEY ("ricsSkuCode")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartLine" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "ricsSkuCode" TEXT NOT NULL,
    "sizeLabel" TEXT NOT NULL,
    "colorId" INTEGER,
    "quantity" INTEGER NOT NULL,
    "unitPriceSnapshot" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PLACED',
    "shippingJson" JSONB NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "ricsSkuCode" TEXT NOT NULL,
    "sizeLabel" TEXT NOT NULL,
    "colorId" INTEGER,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductContent_seoSlug_key" ON "ProductContent"("seoSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_sessionId_key" ON "Cart"("sessionId");

-- CreateIndex
CREATE INDEX "CartLine_cartId_idx" ON "CartLine"("cartId");

-- CreateIndex
CREATE INDEX "CartLine_ricsSkuCode_idx" ON "CartLine"("ricsSkuCode");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- AddForeignKey
ALTER TABLE "CartLine" ADD CONSTRAINT "CartLine_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
