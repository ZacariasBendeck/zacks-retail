ALTER TABLE "app"."purchase_plan"
  DROP CONSTRAINT IF EXISTS "purchase_plan_forecast_method_check";

ALTER TABLE "app"."purchase_plan"
  ADD CONSTRAINT "purchase_plan_forecast_method_check"
  CHECK ("forecast_method" IN (
    'holtWinters',
    'sameMonthLastYear',
    'trailingAverage',
    'yoyGrowth',
    'blendedMultiYear',
    'constrainedDemand'
  ));

ALTER TABLE "app"."purchase_plan_v3"
  DROP CONSTRAINT IF EXISTS "purchase_plan_v3_forecast_method_check";

ALTER TABLE "app"."purchase_plan_v3"
  ADD CONSTRAINT "purchase_plan_v3_forecast_method_check"
  CHECK ("forecast_method" IN (
    'holtWinters',
    'sameMonthLastYear',
    'trailingAverage',
    'yoyGrowth',
    'blendedMultiYear',
    'constrainedDemand'
  ));
