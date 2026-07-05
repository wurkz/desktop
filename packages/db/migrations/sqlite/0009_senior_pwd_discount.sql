-- Senior citizen / PWD statutory discount (PH: RA 9994 / RA 10754): 20% off + VAT-exempt,
-- with the OSCA/PWD ID recorded. Editable at estimate time and at the final/billing stage.
ALTER TABLE orders ADD COLUMN senior_pwd_type TEXT;              -- 'senior' | 'pwd' | null
ALTER TABLE orders ADD COLUMN senior_pwd_id TEXT;               -- the OSCA / PWD ID number
ALTER TABLE orders ADD COLUMN senior_discount INTEGER NOT NULL DEFAULT 0; -- computed 20% (centavos)
