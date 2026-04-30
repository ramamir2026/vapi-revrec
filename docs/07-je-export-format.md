# JE Export Format — Universal CSV

A single CSV format that imports cleanly into QuickBooks Online, NetSuite, Xero, Sage Intacct, or any GL that accepts journal-entry CSV imports. One row per debit/credit line. Lines tied together by `JE_Number`.

## Columns

| Column | Required | Description |
|---|---|---|
| `JE_Number` | yes | Unique JE identifier, e.g. `JE-acme-corp-2026-01-001`. All lines in the same JE share this. |
| `JE_Date` | yes | Posting date (YYYY-MM-DD). Last day of the period being recognized for monthly closes. |
| `Memo` | yes | One-line description of the JE (same on every line of the JE). |
| `Account_Code` | yes | From `chart_of_accounts.account_code`. |
| `Account_Name` | yes | Human-readable name (helps with import diagnostics). |
| `Debit` | yes | Numeric, blank or 0 if this is a credit line. |
| `Credit` | yes | Numeric, blank or 0 if this is a debit line. |
| `Customer_ID` | optional | The `customer_id` slug, for line-level customer attribution. |
| `Customer_Name` | optional | Human-readable customer name. |
| `Department` | optional | For dept-level dimensions; leave blank for now. |
| `Class` | optional | For class/tracking-category dimensions; leave blank for now. |
| `Reference` | optional | Free-form (e.g. invoice number, period code like `2026-01`). |
| `Description` | optional | Line-level note (different from `Memo`, which is JE-level). |

## Validation rules

- Sum of `Debit` across all lines with the same `JE_Number` must equal sum of `Credit`.
- Each line must have either `Debit > 0` or `Credit > 0`, never both.
- `Account_Code` must exist in the active chart of accounts.

## Example — recognize January 2026 voice minutes for Acme Corp ($617.28)

```csv
JE_Number,JE_Date,Memo,Account_Code,Account_Name,Debit,Credit,Customer_ID,Customer_Name,Department,Class,Reference,Description
JE-acme-corp-2026-01-001,2026-01-31,Recognize January 2026 voice minutes - Acme Corp,1100,Accounts Receivable - Trade,617.28,0.00,acme-corp,Acme Corp,,,2026-01,12356.0 minutes at $0.05/min
JE-acme-corp-2026-01-001,2026-01-31,Recognize January 2026 voice minutes - Acme Corp,4200,Usage Revenue - Voice Minutes,0.00,617.28,acme-corp,Acme Corp,,,2026-01,12356.0 minutes at $0.05/min
```

## Example — recognize platform fee + usage in one JE

```csv
JE_Number,JE_Date,Memo,Account_Code,Account_Name,Debit,Credit,Customer_ID,Customer_Name,Department,Class,Reference,Description
JE-acme-corp-2026-01-002,2026-01-31,Recognize January 2026 revenue - Acme Corp,1100,Accounts Receivable - Trade,1617.28,0.00,acme-corp,Acme Corp,,,2026-01,Platform fee + usage
JE-acme-corp-2026-01-002,2026-01-31,Recognize January 2026 revenue - Acme Corp,4100,Subscription Revenue,0.00,1000.00,acme-corp,Acme Corp,,,2026-01,Monthly platform fee
JE-acme-corp-2026-01-002,2026-01-31,Recognize January 2026 revenue - Acme Corp,4200,Usage Revenue - Voice Minutes,0.00,617.28,acme-corp,Acme Corp,,,2026-01,12356.0 minutes at $0.05/min
```

## Mapping to specific GL systems

| GL System | Notes |
|---|---|
| QuickBooks Online | Import as a JE template via the "Import Data" feature. Map `Account_Name` → Account; `Debit`/`Credit` direct; `Customer_Name` → Customer; `Memo` → Memo. |
| NetSuite | Use SuiteScript or CSV import. `Account_Code` maps to internal account ID; `Department`/`Class` map to subsidiary dimensions if used. |
| Xero | Manual journal import; columns map directly. |
| Sage Intacct | Use the journal entry import template; `Account_Code` is the chart-of-accounts ID. |

The app's `/exports` screen produces this CSV exactly. Bulk-export multiple JEs in a single file for monthly close batches.
