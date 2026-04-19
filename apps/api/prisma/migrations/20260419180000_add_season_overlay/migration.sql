-- Season overlay for Phase 1 products taxonomy.
--
-- Seasons are a user-defined SKU attribute (clarified 2026-04-19). RICS stores
-- them in RISEMF.MDB (p. 218); this customer's copy won't open with ACE OLE
-- DB, so we mirror the descriptions here. Codes + descriptions are both
-- user-editable — no fixed universe, no computed "current season".
--
-- Seeded with the user's existing 20 season entries from the Season Code
-- Setup screenshot attached to the 2026-04-19 parity request, so the admin
-- page is populated on first load.

CREATE TABLE "SeasonOverlay" (
    "code"            VARCHAR(2)  NOT NULL,
    "description"     VARCHAR(32) NOT NULL,
    "dateLastChanged" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeasonOverlay_pkey" PRIMARY KEY ("code")
);

INSERT INTO "SeasonOverlay" ("code", "description") VALUES
  ('0', 'Pasado'),
  ('V', 'VER 22'),
  ('W', 'OTO 22'),
  ('X', 'NAV 22'),
  ('Y', 'PRIM 23'),
  ('Z', 'VER 23'),
  ('1', 'OTO 23'),
  ('2', 'NAV 23'),
  ('3', 'PRIM 24'),
  ('4', 'VER 24'),
  ('5', 'OTO 24'),
  ('6', 'NAV 24'),
  ('7', 'PRIM 25'),
  ('8', 'VER 25'),
  ('9', 'OTO 25'),
  ('A', 'NAV 25'),
  ('B', 'PRIM 26'),
  ('C', 'VER 26'),
  ('D', 'OTO 26'),
  ('E', 'NAV 26');
