-- Drop the retired mirror schemas. Direct CSV -> app/module imports are now
-- the only approved rehearsal and cutover path.
DROP SCHEMA IF EXISTS rics_mirror CASCADE;
DROP SCHEMA IF EXISTS rics_mirror_staging CASCADE;
