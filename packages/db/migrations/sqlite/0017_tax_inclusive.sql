-- BACK-3-009: VAT-inclusive pricing option. When 1, entered line prices already contain VAT
-- (the tax shown is back-computed); when 0 (default), prices are net and VAT is added on top.
-- Existing installs default to 0 = current exclusive behavior, so nothing changes for them.
ALTER TABLE app_config ADD COLUMN tax_inclusive INTEGER NOT NULL DEFAULT 0;
