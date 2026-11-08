// The Base borrow freeze: at this block Moonwell set every Base market's borrow
// cap to one base unit (1 wei for an 18-decimal token), so no new borrow lands.
// One constant for every page that says so (ui-jobs 533).

export const MOONWELL_BASE_BORROW_FREEZE_BLOCK = 50_519_338;
export const MOONWELL_BASE_BORROW_FREEZE_DATE = "27 Aug 2026";
