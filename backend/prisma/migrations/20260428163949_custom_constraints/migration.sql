-- Ajouter une contrainte de niveau base de données pour empêcher mathématiquement les stocks négatifs
ALTER TABLE "inventory" 
ADD CONSTRAINT "check_stock_not_negative" 
CHECK ("stock_physical" >= 0 AND "stock_reserved" >= 0);