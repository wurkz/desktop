-- Record the senior/PWD holder's NAME alongside their OSCA/PWD ID. The discount holder
-- can differ from the paying customer, and BIR records require the name + ID.
ALTER TABLE orders ADD COLUMN senior_pwd_name TEXT;
