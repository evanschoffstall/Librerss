DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'User'
      AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE "User"
      ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;
  END IF;
END $$;