-- SKU — surface Perks + Discount Code (RICS parity).
--
-- Perks mirrors rics_mirror.inventory_master.perks (numeric salesperson incentive
-- amount per sale, p. 155). Discount Code is a free-text promotion code the
-- operator ties to the SKU (decoupled from the promotion_code reference table
-- for now; upgrade to a FK once the promo admin ships).

ALTER TABLE "app"."sku"
    ADD COLUMN "perks"         NUMERIC(12, 2),
    ADD COLUMN "discount_code" TEXT;
