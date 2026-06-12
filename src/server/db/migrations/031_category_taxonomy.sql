-- Replace personal-only category taxonomy with a clean mixed personal+business
-- taxonomy grouped under parents.
--
-- SAFETY GUARDS: migration aborts (is a no-op) if any of the following is true:
--   - transactions reference a category_id
--   - classification_rules reference a category_id
--   - budgets reference a category_id
--
-- In that case categories are left untouched and must be migrated manually.

-- ── Step 1: delete old categories only when nothing references them ────────────

DELETE FROM categories
WHERE (SELECT COUNT(*) FROM transactions      WHERE category_id IS NOT NULL) = 0
  AND (SELECT COUNT(*) FROM classification_rules WHERE category_id IS NOT NULL) = 0
  AND (SELECT COUNT(*) FROM budgets           WHERE category_id IS NOT NULL) = 0;

-- ── Step 2: seed parent groups (only for workspaces now empty) ────────────────
-- Using INSERT OR IGNORE so a re-run is safe.

INSERT OR IGNORE INTO categories
  (workspace_id, parent_id, name, kind, color, icon, budget_mode, description)
SELECT w.id, NULL, p.name, p.kind, p.color, p.icon, 'tracking', p.description
FROM workspaces w
-- Only seed workspaces that have no categories (i.e., were just cleared above,
-- or are a fresh workspace that somehow skipped seeding).
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE workspace_id = w.id)
CROSS JOIN (
  -- Income parents
  SELECT 'Operating Revenue' AS name, 'income' AS kind, '#C0D582' AS color,
         'trending-up' AS icon,
         'Sales, service fees, and event income.' AS description
  UNION ALL
  SELECT 'Passive Income',  'income', '#7B85C9', 'percent',
         'Dividends and interest.'
  UNION ALL
  SELECT 'Adjustments',     'income', '#7DC8B3', 'rotate-ccw',
         'Refunds and credits — not counted as operating revenue.'
  UNION ALL
  SELECT 'Capital & Financing', 'income', '#A2ABBB', 'arrow-left-right',
         'Owner deposits, loans in, and inter-account transfers in.'
  -- Expense parents
  UNION ALL
  SELECT 'Cost of Revenue', 'expense', '#E7A875', 'utensils-crossed',
         'Direct costs of delivering the product or service.'
  UNION ALL
  SELECT 'People',          'expense', '#85B59A', 'users',
         'Payroll, salaries, and contractor payments.'
  UNION ALL
  SELECT 'Operations',      'expense', '#7D90CA', 'settings',
         'Rent, utilities, equipment, repairs, transportation, and insurance.'
  UNION ALL
  SELECT 'Sales & Admin',   'expense', '#AB9DDB', 'settings-2',
         'Marketing, software, professional services, bank fees, and taxes.'
  UNION ALL
  SELECT 'Personal',        'expense', '#D692BF', 'sparkles',
         'Personal spending: groceries, dining, shopping, health, travel, and more.'
  UNION ALL
  SELECT 'Money Movement',  'expense', '#A2ABBB', 'arrow-left-right',
         'Transfers, loan repayments, investments, and other balance-sheet flows.'
) AS p;

-- ── Step 3: seed leaf categories ──────────────────────────────────────────────

INSERT OR IGNORE INTO categories
  (workspace_id, parent_id, name, kind, color, icon, budget_mode, description)
SELECT w.id,
       (SELECT c.id FROM categories c
        WHERE c.workspace_id = w.id AND c.parent_id IS NULL AND c.name = leaf.parent_name
        LIMIT 1),
       leaf.name, leaf.kind, leaf.color, leaf.icon, 'budgeted', leaf.description
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM categories
  WHERE workspace_id = w.id AND parent_id IS NOT NULL
)
CROSS JOIN (
  -- ── Income leaves ──────────────────────────────────────────────────────────
  -- Operating Revenue
  SELECT 'Operating Revenue' AS parent_name,
         'Sales & Revenue'   AS name,    'income' AS kind,
         '#85B59A' AS color, 'banknote'  AS icon,
         'Customer payments, invoices, and business sales.' AS description
  UNION ALL
  SELECT 'Operating Revenue','Service Income','income',
         '#94A0DD','briefcase',
         'Consulting, professional services, and recurring service fees.'
  UNION ALL
  SELECT 'Operating Revenue','Event & Venue Income','income',
         '#D692BF','ticket',
         'Ticket sales, venue hire, and event-related revenue.'
  -- Passive Income
  UNION ALL
  SELECT 'Passive Income','Dividends','income',
         '#7BB36B','trending-up',
         'Stock and fund dividends.'
  UNION ALL
  SELECT 'Passive Income','Interest Income','income',
         '#6EBFB5','percent',
         'Bank interest and bond income.'
  -- Adjustments
  UNION ALL
  SELECT 'Adjustments','Refunds & Credits','income',
         '#65C1D1','rotate-ccw',
         'Expense reversals, supplier credits, and customer refunds received. financial_nature=refund.'
  -- Capital & Financing
  UNION ALL
  SELECT 'Capital & Financing','Owner Deposit','income',
         '#C0D582','arrow-down-circle',
         'Owner capital injection into the business.'
  UNION ALL
  SELECT 'Capital & Financing','Loan Received','income',
         '#C29B6F','landmark',
         'Bank loans, credit lines, and other borrowings received.'
  UNION ALL
  SELECT 'Capital & Financing','Transfer In','income',
         '#A2AAC2','arrow-left-right',
         'Internal transfers arriving from another account or entity.'
  UNION ALL
  SELECT 'Capital & Financing','Other Income','income',
         '#C9C9C9','circle-help',
         'Income that does not fit another category. Assign to needs_review.'

  -- ── Expense leaves ─────────────────────────────────────────────────────────
  -- Cost of Revenue
  UNION ALL
  SELECT 'Cost of Revenue','Food & Beverage Suppliers','expense',
         '#E89B80','utensils-crossed',
         'Wholesale food and drink purchases for resale or service.'
  UNION ALL
  SELECT 'Cost of Revenue','Packaging & Materials','expense',
         '#DCB87A','box',
         'Packaging, disposables, and raw materials used in production.'
  -- People
  UNION ALL
  SELECT 'People','Payroll & Salaries','expense',
         '#81B482','users',
         'Employee salaries, wages, and payroll-related costs.'
  UNION ALL
  SELECT 'People','Contractors & Freelancers','expense',
         '#AB9DDB','user-check',
         'Freelancer invoices and contractor payments.'
  -- Operations
  UNION ALL
  SELECT 'Operations','Rent & Property','expense',
         '#D3A96F','home',
         'Office, warehouse, or venue rent and property-related costs.'
  UNION ALL
  SELECT 'Operations','Utilities & Energy','expense',
         '#B8A98F','zap',
         'Electricity, water, gas, internet, and phone bills.'
  UNION ALL
  SELECT 'Operations','Equipment & Assets','expense',
         '#65AFD2','wrench',
         'Machinery, tools, hardware, and capital equipment purchases.'
  UNION ALL
  SELECT 'Operations','Repairs & Maintenance','expense',
         '#A57B5B','hammer',
         'Repairs, servicing, and maintenance of equipment or premises.'
  UNION ALL
  SELECT 'Operations','Transportation & Fuel','expense',
         '#7D90CA','tram-front',
         'Fuel, vehicle costs, deliveries, and business travel transport.'
  UNION ALL
  SELECT 'Operations','Insurance','expense',
         '#E59A99','shield',
         'Business and asset insurance premiums.'
  -- Sales & Admin
  UNION ALL
  SELECT 'Sales & Admin','Marketing & Advertising','expense',
         '#E499A4','megaphone',
         'Paid ads, campaigns, events marketing, and promotional materials.'
  UNION ALL
  SELECT 'Sales & Admin','Software & Subscriptions','expense',
         '#AB9DDB','refresh-cw',
         'SaaS tools, apps, and recurring digital service fees.'
  UNION ALL
  SELECT 'Sales & Admin','Professional Services','expense',
         '#94A0DD','scale',
         'Legal, accounting, consulting, and other professional fees.'
  UNION ALL
  SELECT 'Sales & Admin','Bank Fees & Interest','expense',
         '#B8A98F','receipt',
         'Account fees, wire charges, card fees, and loan interest paid.'
  UNION ALL
  SELECT 'Sales & Admin','Taxes & Levies','expense',
         '#C29B6F','landmark',
         'VAT, income tax, municipal levies, and other government charges.'
  UNION ALL
  SELECT 'Sales & Admin','Office & Supplies','expense',
         '#DBC27F','paperclip',
         'Stationery, office consumables, cleaning, and small supplies.'
  -- Personal
  UNION ALL
  SELECT 'Personal','Groceries','expense',
         '#81B482','shopping-basket',
         'Supermarkets, food markets, and grocery stores.'
  UNION ALL
  SELECT 'Personal','Restaurants & Dining','expense',
         '#E89B80','utensils-crossed',
         'Restaurants, cafes, takeout, and food delivery.'
  UNION ALL
  SELECT 'Personal','Shopping & Retail','expense',
         '#DCB87A','shopping-bag',
         'Clothing, electronics, household goods, and general retail.'
  UNION ALL
  SELECT 'Personal','Entertainment','expense',
         '#E499A4','ticket',
         'Cinemas, concerts, sports, streaming, and leisure activities.'
  UNION ALL
  SELECT 'Personal','Health & Medical','expense',
         '#75BCA3','heart-pulse',
         'Pharmacies, clinics, doctors, dentists, and medical equipment.'
  UNION ALL
  SELECT 'Personal','Travel','expense',
         '#64B8D2','plane',
         'Flights, hotels, car rentals, and holiday expenses.'
  UNION ALL
  SELECT 'Personal','Personal Care','expense',
         '#D5A4D7','sparkles',
         'Hair, beauty, spa, cosmetics, and grooming.'
  UNION ALL
  SELECT 'Personal','Education','expense',
         '#94A0DD','graduation-cap',
         'Tuition, courses, books, and school supplies.'
  UNION ALL
  SELECT 'Personal','Home & Bills','expense',
         '#A4C386','home',
         'Personal home rent, utilities, repairs, and household bills.'
  -- Money Movement
  UNION ALL
  SELECT 'Money Movement','Internal Transfer','expense',
         '#A2AAC2','arrow-left-right',
         'Transfers between accounts within the same entity. Not P&L.'
  UNION ALL
  SELECT 'Money Movement','Loan Repayment','expense',
         '#C29B6F','landmark',
         'Principal and interest repayment on loans or credit lines.'
  UNION ALL
  SELECT 'Money Movement','Credit Card Payment','expense',
         '#DBC27F','credit-card',
         'Monthly credit card settlement payments (working capital movement).'
  UNION ALL
  SELECT 'Money Movement','Investment Made','expense',
         '#7B85C9','trending-up',
         'Securities purchased, funds deposited, or capital deployed.'
  UNION ALL
  SELECT 'Money Movement','Owner Draw','expense',
         '#E7A875','arrow-up-circle',
         'Owner withdrawals and distributions from the business.'
  UNION ALL
  SELECT 'Money Movement','Working Capital','expense',
         '#A4C386','coins',
         'Short-term cash movements: inventory, receivables, and payables.'
  UNION ALL
  SELECT 'Money Movement','Unknown / Needs Review','expense',
         '#C9C9C9','circle-help',
         'Unclassified transactions that require manual review.'
) AS leaf;
