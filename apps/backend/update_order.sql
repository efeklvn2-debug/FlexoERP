UPDATE "SalesOrder" 
SET status = 'READY', "quantityProduced" = "quantityOrdered", "updatedAt" = NOW()
WHERE id = 'cmng9dfjt000lif81jsj0szwq';
