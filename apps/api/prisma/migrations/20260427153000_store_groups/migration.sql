CREATE TABLE "app"."store_group" (
    "code" VARCHAR(64) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_group_pkey" PRIMARY KEY ("code")
);

CREATE TABLE "app"."store_group_member" (
    "store_number" SMALLINT NOT NULL,
    "group_code" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_group_member_pkey" PRIMARY KEY ("store_number")
);

CREATE INDEX "store_group_member_group_code_idx"
    ON "app"."store_group_member"("group_code");

ALTER TABLE "app"."store_group_member"
    ADD CONSTRAINT "store_group_member_group_code_fkey"
    FOREIGN KEY ("group_code") REFERENCES "app"."store_group"("code")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."store_group_member"
    ADD CONSTRAINT "store_group_member_store_number_fkey"
    FOREIGN KEY ("store_number") REFERENCES "app"."store_master"("number")
    ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "app"."store_group" ("code", "label", "active", "sort_order")
VALUES
    ('unlimited', 'Unlimited', true, 10),
    ('magic-shoes', 'Magic Shoes & Fashion', true, 20);

INSERT INTO "app"."store_group_member" ("store_number", "group_code")
SELECT roster.store_number, roster.group_code
FROM (
    VALUES
        (1, 'unlimited'),
        (2, 'unlimited'),
        (3, 'unlimited'),
        (4, 'unlimited'),
        (5, 'unlimited'),
        (6, 'unlimited'),
        (7, 'unlimited'),
        (8, 'unlimited'),
        (11, 'unlimited'),
        (12, 'unlimited'),
        (13, 'unlimited'),
        (14, 'unlimited'),
        (15, 'unlimited'),
        (26, 'unlimited'),
        (28, 'unlimited'),
        (29, 'unlimited'),
        (30, 'unlimited'),
        (31, 'unlimited'),
        (32, 'unlimited'),
        (33, 'unlimited'),
        (34, 'unlimited'),
        (10, 'magic-shoes'),
        (16, 'magic-shoes'),
        (17, 'magic-shoes'),
        (20, 'magic-shoes'),
        (21, 'magic-shoes'),
        (22, 'magic-shoes'),
        (24, 'magic-shoes'),
        (25, 'magic-shoes'),
        (35, 'magic-shoes'),
        (41, 'magic-shoes'),
        (42, 'magic-shoes'),
        (43, 'magic-shoes')
) AS roster(store_number, group_code)
INNER JOIN "app"."store_master" sm
    ON sm."number" = roster.store_number;
