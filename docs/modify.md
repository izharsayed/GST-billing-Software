# Modification Specification: GST Billing Software → Refrigeration POS, Inventory & Service Management

## 1. Project context

**Base repository:** https://github.com/izharsayed/GST-billing-Software.git  
**Starting point:** Existing offline-first GST billing application described in the project briefing.  
**Primary objective:** Extend the existing application into one integrated refrigeration business management system. Do not replace the application with an unrelated new project.

The finished application must connect:

1. Admin-managed products, models, technical data, costs, selling prices and GST settings.
2. POS, quotations, sales invoices, purchases, payments and inventory.
3. Cold-room/application-based product and model selection.
4. Customer accounts, customer sites and installed-equipment records.
5. Service requests, engineer assignments, service visits and completion reports.
6. Engineer/van stock and parts consumed during service.
7. Excel/CSV imports and exports, PDF documents, reports and audit history.

The same product, customer, equipment and stock records must be reused across every module. Do not create separate disconnected product or stock lists for POS and service.

---

## 2. Important development instructions

Before changing code:

- Inspect the actual repository, `package.json`, `server.js`, `src/store.js`, existing data files, components, utilities, tests and documentation.
- Identify what is already implemented and working. The repository briefing is an overview, not proof that every described feature is complete or defect-free.
- Produce a concise audit of reusable code, missing functionality, risks and proposed changes.
- Back up the existing `data/` directory and any user data before migrations or structural changes.
- Preserve existing invoice, GST, purchase, payment, backup/restore, PDF, CSV/Excel and offline/PWA functionality unless a tested replacement is approved.
- Do not silently change existing data formats or overwrite production/user data.
- Implement in phases. Keep the application runnable and testable after each phase.
- Do not invent refrigeration capacities, model compatibility, purchase costs, selling prices, GST rates or customer installation history.

### Architecture decision: local persistence

The supplied project briefing describes JSON files in `data/` with atomic writes through `server.js`, and `localStorage` in static-only mode. It also describes an offline-first, local-data, no-mandatory-cloud philosophy.

The expanded application needs reliable relationships and atomic transactions across sales, inventory, service parts and equipment history. **Evaluate migrating the server-backed application to SQLite** as the preferred local database. SQLite keeps data local and does not require a separate database server.

Before migration:

1. Audit the current JSON data structures and all read/write paths.
2. Design an explicit migration and rollback strategy.
3. Keep JSON import/export as a backup and portability format, not as a second live source of truth.
4. Do not run SQLite and JSON as competing writeable databases.
5. Preserve static-only/localStorage operation only if it can safely support the intended feature subset; clearly document any limitations. The server-backed mode should be the authoritative mode for multi-user and transactional workflows.
6. If SQLite is not adopted, document how equivalent foreign-key integrity, atomic multi-record transactions, concurrency control and recovery will be guaranteed. Do not simply extend flat JSON files without addressing these requirements.

The local/offline privacy principle remains mandatory. No required cloud database, analytics, telemetry or subscription service may be introduced.

---

## 3. Existing functionality to preserve and extend

Audit and retain the existing implementation of these features where working:

- Tax invoices, bills of supply, proforma invoices, delivery challans and credit notes.
- Invoice numbering and invoice statuses.
- Existing GST calculations and tax reports/exports.
- Product catalogue and inventory view.
- Automatic inventory deduction for confirmed invoices and stock restoration for valid credit notes.
- Purchase bills and expense tracking.
- Customer records.
- Payments, bank accounts and UPI details.
- PDF generation, signatures/stamps and print settings.
- CSV/Excel import/export.
- JSON backup and restore.
- Offline PWA and local OCR functionality.
- Existing CORS protections, sanitization and security tests.

Do not rewrite existing GST logic without regression tests. Tax rules must be configurable where appropriate, but must retain the existing application's supported compliance functionality.

---

## 4. Main application modules and navigation

Add or extend the application navigation with these sections:

### Admin & Masters
- Business profile and document settings
- Product categories and subcategories
- Product master
- Brand/manufacturer master
- Product model master
- Technical specifications and catalogue references
- Purchase cost and selling-price management
- GST/HSN/SAC configuration
- Labour, installation, transport and other charges
- Discount and approval policies
- Areas, cities, PIN codes and service territories
- Users, roles and permissions
- Warehouses and engineer/van stock locations
- Quotation templates and terms

### Sales & POS
- POS billing
- Quotations
- Sales orders, where required
- Tax invoices and other supported documents
- Payments and customer outstanding balances
- Sales returns and credit notes

### Inventory & Purchases
- Product stock overview
- Stock ledger/movements
- Opening stock
- Purchase orders and purchase bills
- Goods receipt
- Warehouse/branch transfers
- Engineer van stock
- Stock adjustments and returns
- Low-stock/reorder alerts

### Technical Quotation
- Application/area selection
- Equipment type selection
- Technical input form
- Catalogue-based model recommendations
- Components/accessories list
- Cost and selling-price calculation
- Quotation preview, approval and PDF output

### Customers & Installed Equipment
- Customer search and profile
- Customer sites/locations
- Installed equipment register
- Installation and commissioning documents
- Equipment warranty and AMC
- Equipment service history timeline

### Service & Engineers
- Service requests/complaints
- Service assignment and scheduling
- Engineer dashboard
- Engineer visit records
- Parts and consumables used
- Labour/travel charges where applicable
- Service completion report
- Follow-up visits and service history

### Reports & Exports
- Sales and invoice reports
- Quotation register
- Product and stock reports
- Stock movement report
- Purchases and supplier reports
- Customer and outstanding reports
- Installed equipment register
- Service requests and service history
- Engineer workload/performance reports
- Parts-consumption reports
- Warranty/AMC reports
- Audit log export

---

## 5. Admin-managed product, model and price master

The primary business owner/admin controls the configuration. Routine price, tax, product and model changes must be possible from the admin interface without editing source code.

### Product master fields

- Product ID (stable internal ID)
- SKU/item code (unique where applicable)
- Product name and description
- Category and subcategory
- Brand/manufacturer
- Unit of measure (Nos, Pcs, Set, Kg, Metre, Litre, etc.)
- HSN/SAC and tax classification
- Product type (stock item, non-stock/service item, charge or configurable item)
- Track inventory: yes/no
- Minimum/reorder quantity
- Main image and attachments
- Active/inactive/archived status

### Model master fields

- Model ID
- Linked product/category
- Brand/manufacturer
- Manufacturer model number
- Model description
- Technical attributes appropriate to the model family
- Capacity and unit, where documented
- Temperature range, where documented
- Refrigerant, voltage, electrical data and other relevant specifications, where documented
- Compatibility and application rules
- Catalogue/document reference, source file and page number
- Data verification state: unverified, verified or needs review
- Active/inactive status

Use structured fields for common technical attributes and a controlled flexible specification structure for model-family-specific data. Avoid putting all technical values into an unstructured text description.

### Price and cost management

Keep these separate:

- Supplier purchase cost
- Latest purchase cost
- Average/valuation cost, if implemented
- Default selling price
- Dealer/customer-specific price list, if required
- Optional minimum selling price
- Labour/installation charges
- Transport and other charge rules
- Discount rules and approval thresholds
- Price effective-from/effective-to dates

Store price changes with who changed them, when, previous value, new value and reason. Admin can edit prices whenever needed.

**Price snapshot rule:** New quotations use the currently active price configuration. Existing issued quotations and finalized invoices retain the values used when they were created. Draft quotations may be refreshed from current prices through an explicit “Recalculate using current prices” action, with a clear confirmation and audit entry.

### Admin operations

Provide Add, View, Edit, Duplicate, Import, Export, Activate, Deactivate and Archive actions. Do not permanently delete products/models referenced by invoices, quotations, stock movements, installations or service history. Preserve references and historical records.

---

## 6. GST, pricing and quotation calculation rules

Reuse and test the existing GST calculation utilities before extending them.

Admin must be able to configure the applicable tax classification/rate for products and service charges, with appropriate effective dates and permissions. Do not assume every refrigeration product has the same GST rate.

Support the tax treatments the application legitimately needs, including applicable CGST/SGST and IGST treatment based on transaction place-of-supply and business configuration. Preserve the HSN/SAC and tax snapshot on finalized documents. Tax configuration must be checked against current Indian GST requirements by the business/accountant before production use.

### Calculation requirements

- Purchase cost is not the selling price.
- Product price, quantity, discount, charge, taxable value, tax and total must be stored/calculated distinctly.
- Support inclusive and exclusive tax pricing consistently with the existing billing implementation.
- Support line-level and document-level discounts according to permission policy.
- Support labour, installation, transport, piping, accessories and other admin-configured charge items.
- Tax treatment for each charge must be configured rather than assumed.
- Apply consistent currency precision and rounding.
- Record the calculation inputs and snapshots needed to reproduce an issued quotation/invoice.
- Do not permit a normal salesperson to modify master GST settings.

### Automatic quotation workflow

1. Select an existing customer or create a new customer.
2. Select an existing customer site or add a new site.
3. Select application/area and equipment type.
4. Enter the technical requirements, such as dimensions, target temperature, application and other required inputs.
5. Run the verified model-selection rules.
6. Display compatible documented models and required components/accessories.
7. Retrieve current admin-configured prices and applicable tax settings.
8. Calculate quantities, equipment values, labour, installation, transport, discounts, taxes and grand total.
9. Generate a draft quotation with a unique quotation number.
10. Admin/authorized user reviews, edits or approves it.
11. Generate and download/print a professional PDF.
12. Convert accepted quotation to invoice/sales order without re-entering items.

A quotation must not reduce physical stock. It may optionally reserve stock if an explicit reservation feature is implemented. Before sale confirmation, recheck availability.

### Manual overrides

Authorized users may override selected model, quantity, price, discount or charge where the business allows it. Require a reason for sensitive overrides, enforce discount/price limits, log the change and preserve the original generated values for audit.

---

## 7. Cold-room model-selection engine

Use the supplied technical source material as data sources:

- Emerson Ready Reckoner for Cold Rooms.
- Daikin Cold Room Catalogue.

Extract model tables and selection rules into structured records with source document and page references. Preserve original model identifiers, units, conditions and terminology.

Capture the required inputs for each supported application, potentially including:

- Application area/use
- Equipment type (for example, chiller, freezer or bulk milk chiller, where supported by source data)
- Room length, width and height with unit
- Calculated room volume
- Target room temperature
- Required product/ambient/design conditions where specified in the source
- Refrigerant and electrical constraints where relevant
- Additional application-specific technical inputs

Selection behaviour:

- Run only verified/configured rules.
- Show why a model was suggested and cite the source document/page in the UI or quotation technical notes.
- Show the assumptions and inputs used.
- Do not assume a model is suitable solely because one capacity number is larger than a calculated load.
- Do not extrapolate beyond the documented tables unless a qualified technical user explicitly approves a rule.
- If information is missing, input is outside the supported table or multiple options remain ambiguous, show “Technical review required”.
- Permit a qualified/authorized technical user to approve or override the recommendation with a reason.
- Keep engineering selection separate from price and stock lookup.

**Important:** Catalogue-derived model suggestions are decision support, not a substitute for a qualified refrigeration design review.

---

## 8. Shared inventory and stock movement rules

POS sales, purchases and service must use the same inventory service and stock ledger.

### Locations

Support configurable stock locations:

- Main warehouse
- Branch/secondary warehouse
- Engineer van/tool stock
- Other authorized stock locations

### Stock events

Record stock changes for:

- Opening stock
- Purchase receipt
- Confirmed POS sale/invoice
- Sales return/credit note (after return inspection and disposition)
- Service parts consumption
- Warehouse/branch/van transfer
- Stock adjustment
- Damaged/obsolete/write-off stock
- Reversal/correction

### Non-negotiable rules

1. A draft quotation does not reduce physical stock.
2. A draft invoice does not reduce physical stock unless the existing implementation explicitly uses a controlled committed state; document and test the chosen rule.
3. A confirmed sale deducts stock exactly once.
4. A valid purchase receipt increases stock exactly once.
5. Confirmed parts usage on a service visit deducts stock from the selected warehouse or engineer van.
6. A transfer deducts from source and adds to destination atomically.
7. Returns only increase saleable stock after inspection; damaged returns must be separately classified.
8. Cancellation/correction creates an authorized reversing movement. Never silently delete historical stock movements.
9. Every movement records product, quantity, unit, source/destination location, event type, date/time, user, reason, and linked invoice/purchase/service/transfer reference.
10. Use atomic database transactions and concurrency controls so two users cannot consume the same last unit.
11. Do not allow negative stock unless an authorized, explicitly configured override is used and audited.
12. Stock adjustments require permission and a reason.
13. Reconcile displayed balances against the movement ledger and provide an audit/rebuild mechanism.

### Example acceptance scenario

Opening stock: 10 units.

- Confirmed POS sale of 2 → 8 remain.
- Confirmed service usage of 1 → 7 remain.
- Purchase receipt of 5 → 12 remain.
- Approved return of 1 saleable unit → 13 remain.

A draft quotation or unconfirmed service visit must not change these quantities.

---

## 9. Customer, sites and installed-equipment history

A single owner/company can have multiple sites. Each site can contain multiple installed equipment units. A single equipment unit can have many service requests and visits.

### Required relationship

`Customer → Customer Sites → Installed Equipment → Service Requests → Service Visits → Parts Used`

### Customer record

- Customer ID
- Owner/company name
- Phone/email and multiple contacts
- Billing address
- GSTIN and billing information where relevant
- Notes and status

### Site/location record

- Site ID and customer ID
- Site name (factory, warehouse, shop, branch, etc.)
- Full address, area, city, state and PIN code
- Site contact person and phone
- Access notes and status

### Installed equipment record

- Stable Equipment ID
- Customer ID and Site ID
- Linked product and model
- Serial number (unique where available)
- Installation/commissioning date
- Installation engineer/team
- Original quotation and invoice references
- Warranty details and coverage evidence
- AMC/contract links
- Equipment status (active, relocated, retired, sold/transferred, etc.)
- Documents, installation photos and commissioning report

### Customer search behaviour

Search by customer/company name, phone number or customer ID. The result should show one customer profile, not duplicate customer records for each site.

Inside the customer profile:

1. Show all registered sites/locations.
2. Show equipment count per location.
3. Let the user select a site and see all installed units at that site.
4. Let the user select one unit by equipment ID, model or serial number.
5. Show that unit's complete chronological history.
6. Also show a consolidated summary of all sites/equipment/service for the customer.

### Equipment history timeline

Show:

- Installation/commissioning date and installer
- Original quotation and invoice
- Model and serial number
- Warranty start/end and conditions
- AMC coverage and expiry
- Complaints and service requests
- Engineer assignments and visit dates
- Diagnosis/root cause and rectification
- Parts consumed/replaced
- Service charges and payment records where applicable
- Completion reports, photos, readings, signatures and feedback
- Relocation/ownership/status changes

When equipment is moved to another site, retain its previous site and effective dates. Do not erase the history.

### Automatic equipment registration

When an accepted quotation/sale is installed and commissioned, provide a workflow to create the installed-equipment records from the sold product lines. Capture serial numbers and installation details. Do not assume every sale is an installation; require the appropriate installation/commissioning confirmation.

For existing customers, permit authorized import/manual registration of historical equipment. Mark unknown dates/serial numbers as unknown; do not invent them.

---

## 10. Service management and engineer workflow

Use the supplied Service Completion Report as the field reference. Preserve its relevant terminology and fields while allowing admin-configured additions.

### Service request

- Service request number
- Customer, site and site contact
- Specific installed Equipment ID
- Complaint date/time and description
- Priority and service category
- Warranty/AMC status at time of request
- Assigned engineer/team
- Status and next action

### Service visit

- Visit number and service request ID
- Assigned/actual engineer
- Appointment, arrival and departure timestamps
- Customer-reported issue
- Observations and diagnosis/root cause
- Rectification/work performed
- Indoor/outdoor/model/serial details if relevant
- Refrigerant type and quantity, where applicable
- Parts/consumables used
- Technician notes and attachments
- Customer feedback and signature
- Engineer signature and authorized sign-off

### Suggested statuses

`Open → Assigned → In Progress → Waiting for Parts / On Hold → Completed → Closed`

Support rescheduling, reassignment, multiple visits and follow-up visits. A completed visit must not automatically close a request if further work is pending.

### Engineer assignment

- Engineer profile, employee/contact details and active status
- Assigned areas/territories
- Skills or equipment categories, if maintained
- Workload and assigned service jobs
- Service visit history
- Parts/van stock location

Area can help filter and suggest engineers, but allow an authorized manager to assign/reassign manually.

### Service parts and billing

- Engineer selects the part and quantity used.
- System checks stock at the selected source location (engineer van or warehouse).
- Confirmed parts usage creates a service-linked stock movement and reduces that location's stock.
- If the part is returned unused, create a return/reversal transaction.
- Check warranty/AMC coverage and approval before charging the customer.
- Do not bill the customer merely because a part was consumed.
- If chargeable, create appropriate service invoice lines for parts, labour, travel or other charges.
- Preserve the link from invoice line to service request and equipment.

### Service completion PDF

Provide a downloadable/printable report based on the supplied Service Completion Report, including customer/site, service request, engineer, equipment, installation/warranty details, complaint and rectification times, root cause, corrective work, parts/refrigerant used, customer feedback and signatures where captured.

---

## 11. Users, admin control and permissions

The business owner/admin is the central manager of the system configuration. Additional users such as sales staff, inventory staff, service managers, engineers and accountants may be created as needed.

Suggested roles:

- Super Admin/Owner
- Admin
- Salesperson
- Inventory Manager
- Service Manager
- Engineer/Technician
- Accountant
- Read-only Viewer

Implement configurable permissions by module and action:

- View
- Create
- Edit
- Approve
- Cancel/reverse
- Archive/deactivate
- Export
- Manage settings/users/permissions

Enforce permissions in backend API routes/services, not only by hiding frontend buttons.

Admin can manage users, product/model masters, pricing, GST settings, areas, warehouses, engineers, quotation settings and service settings.

Record audit events for sensitive changes, including user, action, entity/record ID, timestamp, reason and before/after values where appropriate. Do not log passwords, authentication secrets or sensitive tokens.

If the intended deployment is one shared office computer, keep the local-only setup straightforward. If multiple computers/devices need access, support a deliberate trusted-LAN configuration with authentication, firewall guidance and explicit allowed origins. Never weaken CORS to wildcard `*` or expose the local server publicly by default.

---

## 12. Excel/CSV imports and exports

Provide authorized Excel (`.xlsx`) or CSV exports for:

- Product and model master
- Product price list and tax classifications
- Customers and customer contacts
- Customer sites
- Installed equipment register
- Current stock by warehouse/van
- Stock movement ledger
- Purchase register
- Quotations and quotation line items
- Sales invoices and line items
- Payments and outstanding balances
- Service requests
- Engineers and assignments
- Service visits and completion details
- Parts consumed by service/engineer
- Warranty and AMC records
- Audit logs, subject to permissions

### Export functionality

- Filter by date range, area, site, customer, product, model, engineer, warehouse, status and other relevant criteria.
- Respect role permissions and assigned-area restrictions.
- Use clear headings, correctly formatted dates/numbers/currency and totals where appropriate.
- Provide a complete detail export as well as useful summary reports.

### Import functionality

- Provide downloadable templates and example rows.
- Validate required fields, IDs, product/model references, dates, quantities and tax classifications.
- Preview rows and show row-specific errors before import.
- Detect duplicate IDs/SKUs/serial numbers according to configured rules.
- Require an explicit confirmation before committing.
- Use controlled stock-opening/adjustment transactions; never let Excel silently overwrite inventory balances or finalized invoices.
- Protect against spreadsheet formula injection when exporting untrusted text.

---

## 13. Reports and dashboard

Dashboard should show role-appropriate information, such as:

- Today's sales, collections and outstanding amount
- Quotation count/value by status
- Low-stock/reorder items
- Inventory valuation, if the valuation method is configured
- Purchases and supplier balances
- Open service requests and overdue requests
- Engineer workload and completed visits
- Parts consumed by service/engineer
- Installed equipment and warranty/AMC expiries
- Customer/site/equipment history

Do not calculate profit using selling price minus an arbitrary or missing cost. Use a clearly defined cost method and show when cost data is incomplete.

---

## 14. Suggested data model / entities

Implement normalized tables (or equivalent well-defined collections if a migration is not approved) with stable IDs and enforced references. Suggested entities:

### Identity and configuration

- `users`
- `roles`
- `permissions`
- `user_roles`
- `role_permissions`
- `business_settings`
- `document_sequences`
- `areas`
- `warehouses`

### Customers and suppliers

- `customers`
- `customer_contacts`
- `customer_sites`
- `suppliers`

### Product and pricing

- `product_categories`
- `brands`
- `products`
- `product_models`
- `model_specifications`
- `model_compatibility_rules`
- `catalogue_sources`
- `tax_rates` / `tax_categories`
- `product_prices`
- `charge_items`
- `price_change_history`

### Inventory and purchase

- `inventory_balances` (derived/maintained safely from ledger)
- `stock_movements`
- `stock_reservations` (optional)
- `purchase_orders`
- `purchase_order_items`
- `purchase_bills`
- `purchase_bill_items`
- `stock_transfers`
- `stock_transfer_items`
- `stock_adjustments`

### Quotations and sales

- `quotations`
- `quotation_items`
- `quotation_technical_inputs`
- `quotation_model_recommendations`
- `sales_orders` (if required)
- `sales`
- `sale_items`
- `payments`
- `payment_allocations`
- `credit_notes` / return records

### Installation and service

- `installed_equipment`
- `equipment_installations`
- `equipment_location_history`
- `equipment_documents`
- `warranties`
- `amc_contracts`
- `engineers`
- `engineer_area_assignments`
- `engineer_assignments`
- `service_requests`
- `service_visits`
- `service_parts_used`
- `service_charges`

### Audit and files

- `audit_logs`
- `attachments`
- `import_jobs`
- `import_errors`

Use foreign keys, unique constraints, indexes and appropriate numeric precision for money/quantities. Define deletion/archive rules. Historical business transactions must not be orphaned.

---

## 15. Required acceptance tests

### Existing billing regression

- Existing invoice types still work.
- GST calculation tests remain valid.
- Invoice numbering and PDF generation remain functional.
- Purchase bills and credit notes retain expected behaviour.
- Backup and restore can restore old data and new data.

### Admin and pricing

- Admin adds a model and it appears in the correct product category.
- Admin changes selling price and new quotations use the new price.
- Previously issued quotations/invoices remain unchanged.
- Unauthorized users cannot change price/GST/model master settings.
- Archiving a referenced model does not break old records.

### Quotations

- User enters supported technical requirements and gets eligible catalogue-based suggestions.
- Missing/out-of-range inputs produce a technical-review warning, not a fabricated model.
- Quotation pulls configured prices and tax rules.
- Quantity, discount, charge, tax and total calculations are tested.
- Draft quotation does not deduct stock.
- Accepted quotation can be converted without duplicate/re-entered line items.

### Inventory

Given 10 units in one warehouse:

- Confirmed POS sale of 2 leaves 8.
- Confirmed service usage of 1 leaves 7.
- Purchase receipt of 5 leaves 12.
- Approved saleable return of 1 leaves 13.
- Draft quotation and unconfirmed service visit leave stock unchanged.
- Transfer moves stock between locations without changing total stock.
- Duplicate request/retry does not deduct stock twice.
- Failed transaction does not partially update balances or ledger.
- Concurrent sales cannot oversell available stock.

### Customer and equipment history

- One customer can have at least five sites.
- Each site can contain multiple installed-equipment records.
- Searching the owner returns one customer profile with all sites.
- Selecting a site lists all equipment at that site.
- Selecting one equipment unit shows only its own history, not another unit's history.
- The customer summary shows consolidated equipment/service history across sites.
- Moving equipment preserves previous location history.

### Service and engineer stock

- Service request is linked to a specific customer, site and equipment unit.
- Engineer assignment appears in the engineer's permitted work list.
- Engineer records a visit and completion report.
- Parts usage deducts stock from the selected van/warehouse exactly once.
- Service part usage links back to the service request, visit, engineer and stock movement.
- Warranty/AMC coverage is visible and chargeability is not assumed.

### Excel and security

- Exports respect role permissions and filters.
- Invalid imports show clear row errors and do not partially corrupt data.
- Excel cannot bypass stock movement rules.
- Backend endpoints reject unauthorized operations.
- CORS remains restricted; no wildcard origin is introduced.
- Local backup/restore can recover the complete application data.

---

## 16. Implementation phases and deliverables

### Phase 1 — Repository audit and design

Deliver:
- Existing feature inventory and code map
- Current data schema and read/write flow
- Reuse/gap analysis
- Proposed database ER diagram
- Migration/backup/rollback plan
- Catalogue data-extraction plan
- Prioritized implementation backlog

Do not make destructive changes in this phase.

### Phase 2 — Data layer and admin foundation

Implement:
- Approved persistence architecture and migrations
- Existing-data migration with verification
- Authentication and roles/permissions
- Customer, area, warehouse and supplier masters
- Product/category/model master
- Tax, pricing and charge settings
- Audit trail

### Phase 3 — Inventory engine

Implement:
- Opening stock and purchase receipt
- Stock ledger and balances
- POS stock deduction integration
- Returns, transfers and adjustments
- Warehouse and engineer stock locations
- Low-stock reports and concurrency/idempotency controls

### Phase 4 — Technical model selection and quotation

Implement:
- Structured catalogue import with source references
- Validated technical inputs and selection rules
- Model recommendation review/override
- Admin-driven pricing and tax lookup
- Quotation calculation, approval, PDF and conversion to invoice

### Phase 5 — Customer sites and installed equipment

Implement:
- Customer multi-site profile
- Installed equipment register
- Installation/commissioning workflow
- Warranty/AMC and document links
- Equipment history timeline

### Phase 6 — Service and engineer operations

Implement:
- Service requests and scheduling
- Area/engineer assignments
- Engineer visit report
- Parts usage linked to inventory ledger
- Engineer van stock
- Service completion PDF
- Service billing where applicable

### Phase 7 — Reports, Excel and hardening

Implement:
- Excel/CSV imports and exports
- Dashboard/reporting
- Security review
- Regression and acceptance tests
- Backup/restore testing
- User guide and deployment guide

At the end of every phase, report changed files, migrations, tests run, test results, unresolved issues and instructions to run the application.

---

## 17. Coding-agent starting instruction

**Start with Phase 1 only.** Inspect the actual repository and current user data structures. Do not immediately generate all modules or rewrite the project. Return:

1. What is already implemented and reusable.
2. What needs modification or new development.
3. The exact files likely to change/add.
4. The recommended data architecture and migration approach.
5. The proposed entity-relationship diagram.
6. Risks to offline operation, privacy, existing billing and data integrity.
7. A phased task list with dependencies and acceptance tests.

After the audit, proceed phase by phase. Keep the application runnable. Make small, testable changes, preserve user data and do not claim a feature or test is complete until it has actually been implemented and verified.
