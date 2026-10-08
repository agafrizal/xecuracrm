# Security Specifications

## 1. Data Invariants
- An Invoice cannot exist without a valid Company ID.
- Invoice items are an array. If `items` exists, it must be an array and have size <= 100.
- Invoice items must have an `id` string, `description` string, `qty` number, `unitPrice` number, and `amount` number.
- `items` can only be updated if the user has appropriate permissions (owner, admin, manager, finance, etc).

## 2. Dirty Dozen
(Omitted full test case implementation here for brevity, see `firestore.rules.test.ts` for actual logic)

## 3. Test Runner
Will be implemented via `firestore.rules.test.ts`
