CREATE TABLE IF NOT EXISTS "SignupInvitation" (
  "id" serial PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL,
  "email" varchar(320),
  "created_by_user_id" integer NOT NULL,
  "consumed_by_user_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone
);

ALTER TABLE "SignupInvitation"
  ADD CONSTRAINT "SignupInvitation_created_by_user_id_User_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "SignupInvitation"
  ADD CONSTRAINT "SignupInvitation_consumed_by_user_id_User_id_fk"
  FOREIGN KEY ("consumed_by_user_id") REFERENCES "User"("id") ON DELETE set null ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "signup_invitation_token_hash_idx"
  ON "SignupInvitation" ("token_hash");
CREATE INDEX IF NOT EXISTS "signup_invitation_created_by_idx"
  ON "SignupInvitation" ("created_by_user_id");
CREATE INDEX IF NOT EXISTS "signup_invitation_email_idx"
  ON "SignupInvitation" ("email");
