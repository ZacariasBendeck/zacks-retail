import { Router, Request, Response, IRouter } from 'express';
import * as posReportService from '../services/posReportService';
import {
  salesTaxRecapQuerySchema,
  salesByDayQuerySchema,
  returnedSalesQuerySchema,
  reprintPostedSalesQuerySchema,
  dateRangeQuerySchema,
  validateQuery,
} from '../middleware/salesPosValidation';

const router: IRouter = Router();

function vq(req: Request): any {
  return (req as any).validatedQuery;
}

router.get('/sales-tax-recap', validateQuery(salesTaxRecapQuerySchema), (req: Request, res: Response): void => {
  res.json(posReportService.salesTaxRecap(vq(req)));
});

router.get('/sales-by-day', validateQuery(salesByDayQuerySchema), (req: Request, res: Response): void => {
  res.json(posReportService.salesByDay(vq(req)));
});

router.get('/returned-sales', validateQuery(returnedSalesQuerySchema), (req: Request, res: Response): void => {
  res.json(posReportService.returnedSales(vq(req)));
});

router.get('/reprint-posted-sales', validateQuery(reprintPostedSalesQuerySchema), (req: Request, res: Response): void => {
  res.json(posReportService.reprintPostedSales(vq(req)));
});

router.get('/promotion-code-analysis', validateQuery(dateRangeQuerySchema), (req: Request, res: Response): void => {
  res.json(posReportService.promotionCodeAnalysis(vq(req)));
});

export default router;
