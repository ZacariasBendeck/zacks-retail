# Employees / Salespeople Cutover Checklist

## Purpose

This checklist defines the minimum Employees-module behavior that must work before Zack's Retail can replace RICS for the salespeople surface.

Use this during rehearsal cycles and during the final cutover gate.

RICS lineage covered here:

- Chapter 7, pages 106-112: Salespeople, Time Clock, Commission Overrides, Hours/Perks, Salesperson Analysis, Close Salesperson Period, Print Salesperson File
- Chapter 11, page 163: Users
- Chapter 2, page 52: Change Sales Passwords / manager override behavior

Current repo status note:

- Auth/users slice is partially shipped already.
- Salesperson roster, time clock, commission, sales passwords, analysis, and period close are still module-level blockers until implemented and verified.

---

## 1. Salesperson Roster

- [ ] Create salesperson with a unique salesperson code
- [ ] Edit salesperson name and other-information field
- [ ] Set default commission percent on the salesperson record
- [ ] Set commission basis correctly for the salesperson
- [ ] Activate / deactivate salesperson without corrupting history
- [ ] Preserve salesperson identity on existing sales, time-clock, and commission records
- [ ] POS can resolve salesperson by code quickly and reliably

---

## 2. Users, Login, and Permissions

- [ ] User login works reliably for all employee roles used in production
- [ ] Logout works reliably
- [ ] Current-session identity is exposed correctly to downstream modules
- [ ] User CRUD works for admins
- [ ] Role assignment works correctly
- [ ] Permission grants / revokes work correctly
- [ ] Password change works correctly
- [ ] Session revocation works after role or permission changes
- [ ] Employees can be linked to user accounts correctly
- [ ] Users without employee records work when needed
- [ ] Employees without user accounts work when needed

---

## 3. Sales Passwords / Manager Overrides

- [ ] Void challenge works correctly
- [ ] Refund challenge works correctly
- [ ] Price override challenge works correctly
- [ ] Discount challenge works correctly
- [ ] Perks edit challenge works correctly
- [ ] No-sale challenge works correctly
- [ ] Reprint challenge works correctly
- [ ] Close-batch challenge works correctly
- [ ] Pay-out challenge works correctly
- [ ] Manager Options challenge works correctly
- [ ] Successful override creates an auditable approval record
- [ ] Failed override attempts are logged correctly
- [ ] Rate limiting / lockout behavior works correctly
- [ ] Override token can only be used for the authorized action
- [ ] Legacy per-store shared password flow works if the deployment still relies on it

---

## 4. Time Clock Core Flow

- [ ] Time clock can be enabled / disabled per policy
- [ ] Require-clock-in-before-sale behavior matches expected store policy
- [ ] Self clock-in works correctly
- [ ] Self clock-out works correctly
- [ ] Clocking another employee in/out works correctly for authorized users
- [ ] Non-sales-hours flag works correctly
- [ ] Store assignment on time-clock entries works correctly
- [ ] Only one open time-clock entry per employee exists at a time
- [ ] 24-hour cap / missed logout behavior works correctly
- [ ] Employees without self-service PINs cannot clock themselves in/out unless an admin does it

---

## 5. Time Clock Administration and Print

- [ ] Admin can review open punches
- [ ] Admin can adjust unposted entries
- [ ] Adjustments preserve an auditable trail
- [ ] Locked / closed-period entries cannot be edited incorrectly
- [ ] Time Clock print/export works in detail mode
- [ ] Time Clock print/export works in summary mode
- [ ] Hours shown on reports match stored entries
- [ ] Missing-punch reconciliation is usable by store management

---

## 6. Commission Defaults and Overrides

- [ ] Default salesperson commission is applied correctly
- [ ] Department-level commission override works correctly
- [ ] If modernized category or SKU overrides exist, precedence works correctly
- [ ] Commission basis uses the correct source amount
- [ ] Commission ledger entries are written for sales correctly
- [ ] Commission reversals are written correctly for voids / returns
- [ ] Commission totals match expected RICS-equivalent outcomes

---

## 7. Hours and Perks

- [ ] Manual hours entry works when time clock is off
- [ ] Manual perks entry works when time clock is off
- [ ] Manual hours/perks entry is blocked or read-only when time clock is on, per design
- [ ] SKU perks post automatically from ticket activity
- [ ] Perks reverse correctly on voids / returns
- [ ] PTD / MTD / STD / YTD rollups are correct

---

## 8. Salesperson Analysis Report

- [ ] Salesperson Analysis loads for a single employee
- [ ] Salesperson Analysis loads for multiple employees
- [ ] Sales totals are correct
- [ ] Profit totals are correct
- [ ] Commission totals are correct
- [ ] Perks totals are correct
- [ ] Hours totals are correct
- [ ] Sales-per-hour is correct
- [ ] Profit-per-hour is correct
- [ ] Ticket counts are correct
- [ ] Average sale amount is correct
- [ ] Average items per ticket is correct
- [ ] Percent multi-item tickets is correct
- [ ] PTD / MTD / STD / YTD buckets are correct
- [ ] CSV export works correctly

---

## 9. Close Salesperson Period

- [ ] Can close one salesperson period correctly
- [ ] Can close all required salespeople for a pay period correctly
- [ ] Close-period preconditions are enforced correctly
- [ ] PTD reset or its modern equivalent behaves correctly
- [ ] Closed-period totals match the Salesperson Analysis numbers used for payroll review
- [ ] Closed-period records are locked correctly
- [ ] Reopen flow works only for authorized users
- [ ] Reopen flow preserves auditability

---

## 10. Print Salesperson File / Admin Exports

- [ ] Salesperson roster export works correctly
- [ ] Export includes the required salesperson fields
- [ ] Optional commission-override appendix or equivalent export works correctly
- [ ] User list / effective-access export is available to admins

---

## 11. Integration with Sales / POS

- [ ] Sales POS can resolve the logged-in cashier correctly
- [ ] Sales POS can resolve the credited salesperson correctly
- [ ] Ticket lines carry salesperson attribution correctly
- [ ] Override challenges are enforced at the right POS actions
- [ ] Ticket commits generate commission and perks entries correctly
- [ ] Ticket voids / returns reverse commission and perks correctly
- [ ] Time-clock policy gates ticket entry correctly when required

---

## 12. Migration / Cutover Validation

- [ ] `rics_mirror.salespeople` coverage is complete for the live RICS roster
- [ ] Historical salesperson-linked sales can still be explained after migration
- [ ] Historical time-clock data needed for operations is available or intentionally excluded with approval
- [ ] No active salesperson needed by operators is missing
- [ ] No duplicate salesperson codes exist
- [ ] Linked user / employee mappings are correct for all live users
- [ ] Permissions match the roles operators actually need on day one
- [ ] Store managers confirm the override / approval model is acceptable

---

## 13. Operator Validation

- [ ] Office manager can maintain the salesperson roster without confusion
- [ ] Store manager can fix punches and review hours without confusion
- [ ] Cashier can clock in / out without confusion
- [ ] Manager can authorize overrides without confusion
- [ ] Finance / office staff can review salesperson analysis for payroll / commission use
- [ ] No daily workflow in the current business still depends on an RICS-only salesperson function

---

## 14. Allowed Modernization Differences

These can differ from RICS and still be acceptable before cutover, as long as the business function works:

- [ ] Modern login/password hashing replaces legacy RICS user-password storage
- [ ] Role + permission model replaces the RICS deny-list menu model
- [ ] Per-employee sales PINs replace or sit above shared store passwords
- [ ] Period close uses ledger locking / snapshots instead of destructive PTD zero-out
- [ ] User file and salesperson file can be delivered as web list/export instead of legacy print screens

---

## 15. Explicitly Not Required for Cutover

These are not deployment blockers for this module:

- [ ] Practice Sales sandbox mode remains out of scope
- [ ] `SUPERVISOR` default login remains removed
- [ ] RICS.CFG file editing remains removed
- [ ] Bulk Change Salespeople renumber utility remains removed
- [ ] Per-user printer settings copy remains removed
- [ ] Login reminders remain owned by platform, not employees
- [ ] Time-clock data purge remains owned by platform retention tooling, not employees UI

---

## Final Readiness Check

Cutover is allowed only if:

- [ ] All roster, override, time-clock, commission, reporting, and period-close critical flows pass
- [ ] Sales POS integration passes with real operators
- [ ] No high-impact mismatch remains between Zack's Retail and RICS for active salesperson workflows
- [ ] Managers and office staff confirm the module is usable for daily work
