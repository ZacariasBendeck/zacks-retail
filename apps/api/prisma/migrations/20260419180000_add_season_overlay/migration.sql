-- Season overlay + config for Phase 1 products taxonomy.
--
-- RICS stores season definitions in RISEMF.MDB (Season Master File). This
-- customer's copy won't open with the current ACE OLE DB driver, so we mirror
-- the fixed 20-slot ring in Postgres. Seeded with the values from the Season
-- Code Setup screenshot attached to the 2026-04-19 parity request.
--
-- The anchor (B = PRIM 26 started 2026-04-01) is inferred from that same
-- screenshot + the Company Setup (Season Ending Months = Mar/Jun/Sep/Dec).

CREATE TABLE "SeasonOverlay" (
    "code"            VARCHAR(2)  NOT NULL,
    "position"        INTEGER     NOT NULL,
    "description"     VARCHAR(32),
    "dateLastChanged" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeasonOverlay_pkey" PRIMARY KEY ("code")
);

CREATE UNIQUE INDEX "SeasonOverlay_position_key" ON "SeasonOverlay"("position");

CREATE TABLE "SeasonConfig" (
    "id"                INTEGER     NOT NULL DEFAULT 1,
    "endingMonthsCsv"   TEXT        NOT NULL DEFAULT '3,6,9,12',
    "anchorSeasonCode"  VARCHAR(2)  NOT NULL,
    "anchorStartedAt"   TIMESTAMP(3) NOT NULL,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SeasonConfig_pkey" PRIMARY KEY ("id")
);

-- Seed the 20 fixed RICS season slots in their canonical order.
-- Description values copied verbatim from the 2026-04-19 Season Code Setup screenshot.
INSERT INTO "SeasonOverlay" ("code", "position", "description") VALUES
  ('0',  0, 'Pasado'),
  ('V',  1, 'VER 22'),
  ('W',  2, 'OTO 22'),
  ('X',  3, 'NAV 22'),
  ('Y',  4, 'PRIM 23'),
  ('Z',  5, 'VER 23'),
  ('1',  6, 'OTO 23'),
  ('2',  7, 'NAV 23'),
  ('3',  8, 'PRIM 24'),
  ('4',  9, 'VER 24'),
  ('5', 10, 'OTO 24'),
  ('6', 11, 'NAV 24'),
  ('7', 12, 'PRIM 25'),
  ('8', 13, 'VER 25'),
  ('9', 14, 'OTO 25'),
  ('A', 15, 'NAV 25'),
  ('B', 16, 'PRIM 26'),
  ('C', 17, 'VER 26'),
  ('D', 18, 'OTO 26'),
  ('E', 19, 'NAV 26');

-- Seed the singleton config with the Q2-2026 anchor and quarterly cadence.
INSERT INTO "SeasonConfig" ("id", "endingMonthsCsv", "anchorSeasonCode", "anchorStartedAt")
  VALUES (1, '3,6,9,12', 'B', '2026-04-01T00:00:00Z');
