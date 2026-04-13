CREATE INDEX IF NOT EXISTS "idx_account_search_fts"
ON "Account"
USING GIN (
  to_tsvector(
    'simple',
    concat_ws(
      ' ',
      COALESCE("accountName", ''),
      COALESCE("businessName", ''),
      COALESCE(city, ''),
      COALESCE("mainCategory", ''),
      COALESCE("subCategory", ''),
      COALESCE("contactPerson", ''),
      COALESCE("businessContact", '')
    )
  )
);

CREATE INDEX IF NOT EXISTS "idx_task_search_fts"
ON "Task"
USING GIN (
  to_tsvector(
    'simple',
    concat_ws(
      ' ',
      COALESCE(id, ''),
      COALESCE(details, ''),
      COALESCE(contact, ''),
      COALESCE("externalRef", '')
    )
  )
);
