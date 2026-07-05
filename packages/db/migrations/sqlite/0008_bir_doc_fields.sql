-- Match a BIR-style manual Job Order (PH market reference: Hersel Car Aircon).
-- Shop-identity + document fields (config), per-order paper serial + payment terms,
-- and a per-line UNIT column. All nullable/optional; blank values simply aren't printed.
ALTER TABLE app_config ADD COLUMN proprietor TEXT;            -- e.g. "Clandestine S. Palo"
ALTER TABLE app_config ADD COLUMN business_style TEXT;        -- BIR trade name
ALTER TABLE app_config ADD COLUMN vat_status TEXT;            -- 'vat' | 'non_vat' | null
ALTER TABLE app_config ADD COLUMN terms_and_conditions TEXT;  -- printed T&C block
ALTER TABLE app_config ADD COLUMN document_title TEXT;        -- printout title (e.g. "Job Order"); null -> "Invoice"

ALTER TABLE orders ADD COLUMN job_order_no TEXT;              -- the shop's pre-printed paper serial (e.g. "3298")
ALTER TABLE orders ADD COLUMN terms TEXT;                     -- payment terms (e.g. "COD", "Net 15")

ALTER TABLE order_items ADD COLUMN unit TEXT;                 -- e.g. "pc", "set", "L", "hrs"
