-- Partial payable settlement: many payments can chip away at one on-account receive, so the
-- link lives on the expense (expense → receive), not the old single expense_id on the receive.
-- Outstanding balance = total_cost − SUM(unvoided linked expenses); voiding a payment reopens it.
-- inventory_adjustments.expense_id stays for historical settles and receive-dialog "link expense".
ALTER TABLE expenses ADD COLUMN receive_id TEXT;
