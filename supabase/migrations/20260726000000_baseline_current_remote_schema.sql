


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."relationship_status" AS ENUM (
    'pending',
    'accepted',
    'rejected',
    'blocked'
);


ALTER TYPE "public"."relationship_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_friend_request"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_req record;
begin
  select *
  into v_req
  from public.friend_requests
  where id = p_request_id;

  if not found then
    raise exception 'Friend request not found';
  end if;

  if v_req.to_user_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;

  update public.friend_requests
  set status = 'accepted'
  where id = p_request_id;

  insert into public.friendships (
    user_id,
    friend_id,
    requested_by,
    status,
    created_at,
    updated_at
  )
  values (
    v_req.from_user_id,
    v_req.to_user_id,
    v_req.from_user_id,
    'accepted',
    now(),
    now()
  )
  on conflict do nothing;
end;
$$;


ALTER FUNCTION "public"."accept_friend_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_friend_request"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_req record;
begin
  select *
  into v_req
  from public.friend_requests
  where id = p_request_id;

  if not found then
    raise exception 'Friend request not found';
  end if;

  if v_req.to_user_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;

  update public.friend_requests
  set status = 'rejected'
  where id = p_request_id;
end;
$$;


ALTER FUNCTION "public"."reject_friend_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."cars" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "year" integer,
    "make" "text" NOT NULL,
    "model" "text" NOT NULL,
    "trim" "text",
    "color" "text",
    "body_style" "text",
    "drivetrain" "text",
    "transmission" "text",
    "horsepower" integer,
    "description" "text",
    "photo_url" "text",
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cars" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friend_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_user_id" "uuid",
    "to_user_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."friend_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "user_id" "uuid" NOT NULL,
    "friend_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "status" "public"."relationship_status" DEFAULT 'pending'::"public"."relationship_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "canonical_a" "uuid" GENERATED ALWAYS AS (LEAST("user_id", "friend_id")) STORED,
    "canonical_b" "uuid" GENERATED ALWAYS AS (GREATEST("user_id", "friend_id")) STORED,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    CONSTRAINT "friendships_check" CHECK (("user_id" <> "friend_id"))
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "user_id" "uuid" NOT NULL,
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "heading" double precision,
    "speed" double precision,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meet_attendees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meet_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "meet_attendees_status_check" CHECK (("status" = ANY (ARRAY['going'::"text", 'interested'::"text"])))
);


ALTER TABLE "public"."meet_attendees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "cover_image_url" "text",
    "location_name" "text" NOT NULL,
    "address" "text",
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "is_public" boolean DEFAULT true NOT NULL,
    "max_attendees" integer,
    "status" "text" DEFAULT 'upcoming'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "meets_status_check" CHECK (("status" = ANY (ARRAY['upcoming'::"text", 'cancelled'::"text", 'completed'::"text"]))),
    CONSTRAINT "meets_time_check" CHECK ((("end_time" IS NULL) OR ("end_time" >= "start_time")))
);


ALTER TABLE "public"."meets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_customizations" (
    "user_id" "uuid" NOT NULL,
    "badge" "text",
    "theme" "text",
    "accent_color" "text",
    "featured_car_id" "uuid",
    "spotlight_enabled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profile_customizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "display_name" "text",
    "photo_url" "text",
    "location_visibility" "text" DEFAULT 'friends'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "onboarded" boolean DEFAULT false NOT NULL,
    "bio" "text",
    "banner_url" "text",
    "city" "text",
    "state" "text",
    "instagram_handle" "text",
    "tiktok_handle" "text",
    "youtube_handle" "text",
    "profile_visibility" "text" DEFAULT 'public'::"text",
    "is_profile_complete" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "twitter_handle" "text",
    "snapchat_handle" "text",
    CONSTRAINT "profiles_location_visibility_check" CHECK (("location_visibility" = ANY (ARRAY['everyone'::"text", 'friends'::"text", 'none'::"text"]))),
    CONSTRAINT "profiles_profile_visibility_check" CHECK (("profile_visibility" = ANY (ARRAY['public'::"text", 'friends'::"text", 'private'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan" "text" DEFAULT 'free'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "provider" "text",
    "provider_customer_id" "text",
    "provider_subscription_id" "text",
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_memberships_plan_check" CHECK (("plan" = ANY (ARRAY['free'::"text", 'premium'::"text"]))),
    CONSTRAINT "user_memberships_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'cancelled'::"text", 'past_due'::"text", 'trialing'::"text"])))
);


ALTER TABLE "public"."user_memberships" OWNER TO "postgres";


ALTER TABLE ONLY "public"."cars"
    ADD CONSTRAINT "cars_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."meet_attendees"
    ADD CONSTRAINT "meet_attendees_meet_id_user_id_key" UNIQUE ("meet_id", "user_id");



ALTER TABLE ONLY "public"."meet_attendees"
    ADD CONSTRAINT "meet_attendees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meets"
    ADD CONSTRAINT "meets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_customizations"
    ADD CONSTRAINT "profile_customizations_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."user_memberships"
    ADD CONSTRAINT "user_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_memberships"
    ADD CONSTRAINT "user_memberships_user_id_key" UNIQUE ("user_id");



CREATE UNIQUE INDEX "friendships_canonical_unique" ON "public"."friendships" USING "btree" ("canonical_a", "canonical_b");



CREATE INDEX "idx_friendships_canonical_a" ON "public"."friendships" USING "btree" ("canonical_a");



CREATE INDEX "idx_friendships_canonical_b" ON "public"."friendships" USING "btree" ("canonical_b");



CREATE UNIQUE INDEX "idx_friendships_canonical_unique" ON "public"."friendships" USING "btree" ("canonical_a", "canonical_b");



CREATE INDEX "idx_friendships_friend_id" ON "public"."friendships" USING "btree" ("friend_id");



CREATE INDEX "idx_friendships_requested_by" ON "public"."friendships" USING "btree" ("requested_by");



CREATE INDEX "idx_friendships_status" ON "public"."friendships" USING "btree" ("status");



CREATE INDEX "idx_friendships_user_id" ON "public"."friendships" USING "btree" ("user_id");



CREATE INDEX "idx_locations_updated_at" ON "public"."locations" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_meet_attendees_meet_id" ON "public"."meet_attendees" USING "btree" ("meet_id");



CREATE INDEX "idx_meet_attendees_status" ON "public"."meet_attendees" USING "btree" ("status");



CREATE INDEX "idx_meet_attendees_user_id" ON "public"."meet_attendees" USING "btree" ("user_id");



CREATE INDEX "idx_meets_created_by" ON "public"."meets" USING "btree" ("created_by");



CREATE INDEX "idx_meets_is_public" ON "public"."meets" USING "btree" ("is_public");



CREATE INDEX "idx_meets_lat_lng" ON "public"."meets" USING "btree" ("latitude", "longitude");



CREATE INDEX "idx_meets_start_time" ON "public"."meets" USING "btree" ("start_time");



CREATE INDEX "idx_meets_status" ON "public"."meets" USING "btree" ("status");



CREATE UNIQUE INDEX "ux_friendships_pair" ON "public"."friendships" USING "btree" ("canonical_a", "canonical_b");



CREATE OR REPLACE TRIGGER "set_friendships_updated_at" BEFORE UPDATE ON "public"."friendships" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_meet_attendees_updated_at" BEFORE UPDATE ON "public"."meet_attendees" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_meets_updated_at" BEFORE UPDATE ON "public"."meets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."cars"
    ADD CONSTRAINT "cars_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_friend_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meet_attendees"
    ADD CONSTRAINT "meet_attendees_meet_id_fkey" FOREIGN KEY ("meet_id") REFERENCES "public"."meets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meet_attendees"
    ADD CONSTRAINT "meet_attendees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meets"
    ADD CONSTRAINT "meets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_customizations"
    ADD CONSTRAINT "profile_customizations_featured_car_id_fkey" FOREIGN KEY ("featured_car_id") REFERENCES "public"."cars"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_customizations"
    ADD CONSTRAINT "profile_customizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_memberships"
    ADD CONSTRAINT "user_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Public meets are viewable" ON "public"."meets" FOR SELECT USING (("is_public" = true));



CREATE POLICY "Users can create meets" ON "public"."meets" FOR INSERT WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can create their own membership" ON "public"."user_memberships" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own cars" ON "public"."cars" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own meets" ON "public"."meets" FOR DELETE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can delete their own membership" ON "public"."user_memberships" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own cars" ON "public"."cars" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can join meets" ON "public"."meet_attendees" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can leave meets" ON "public"."meet_attendees" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own customizations" ON "public"."profile_customizations" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their attendance" ON "public"."meet_attendees" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own cars" ON "public"."cars" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own meets" ON "public"."meets" FOR UPDATE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can update their own membership" ON "public"."user_memberships" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view attendees" ON "public"."meet_attendees" FOR SELECT USING (true);



CREATE POLICY "Users can view cars" ON "public"."cars" FOR SELECT USING (true);



CREATE POLICY "Users can view profile customizations" ON "public"."profile_customizations" FOR SELECT USING (true);



CREATE POLICY "Users can view their own membership" ON "public"."user_memberships" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."cars" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."friend_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friend_requests_insert_own" ON "public"."friend_requests" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "from_user_id"));



CREATE POLICY "friend_requests_read_own" ON "public"."friend_requests" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "from_user_id") OR ("auth"."uid"() = "to_user_id")));



ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friendships delete participants" ON "public"."friendships" FOR DELETE USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "friend_id")));



CREATE POLICY "friendships insert requester" ON "public"."friendships" FOR INSERT WITH CHECK ((("requested_by" = "auth"."uid"()) AND (("auth"."uid"() = "user_id") OR ("auth"."uid"() = "friend_id"))));



CREATE POLICY "friendships select participants" ON "public"."friendships" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "friend_id")));



CREATE POLICY "friendships update participants" ON "public"."friendships" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "friend_id")));



ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "locations insert own" ON "public"."locations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "locations read accepted friends" ON "public"."locations" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."friendships" "f"
  WHERE (("f"."status" = 'accepted'::"public"."relationship_status") AND ((("f"."user_id" = "auth"."uid"()) AND ("f"."friend_id" = "locations"."user_id")) OR (("f"."friend_id" = "auth"."uid"()) AND ("f"."user_id" = "locations"."user_id")))))) AND (COALESCE(( SELECT "p"."location_visibility"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "locations"."user_id")), 'friends'::"text") <> 'none'::"text")));



CREATE POLICY "locations read everyone" ON "public"."locations" FOR SELECT USING ((( SELECT "p"."location_visibility"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "locations"."user_id")) = 'everyone'::"text"));



CREATE POLICY "locations read self" ON "public"."locations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "locations update own" ON "public"."locations" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."meet_attendees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_customizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles read all" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "profiles update own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "profiles_select_own" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."user_memberships" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."friendships";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."locations";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."accept_friend_request"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_friend_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_friend_request"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reject_friend_request"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_friend_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_friend_request"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."cars" TO "anon";
GRANT ALL ON TABLE "public"."cars" TO "authenticated";
GRANT ALL ON TABLE "public"."cars" TO "service_role";



GRANT ALL ON TABLE "public"."friend_requests" TO "anon";
GRANT ALL ON TABLE "public"."friend_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."friend_requests" TO "service_role";



GRANT ALL ON TABLE "public"."friendships" TO "anon";
GRANT ALL ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."meet_attendees" TO "anon";
GRANT ALL ON TABLE "public"."meet_attendees" TO "authenticated";
GRANT ALL ON TABLE "public"."meet_attendees" TO "service_role";



GRANT ALL ON TABLE "public"."meets" TO "anon";
GRANT ALL ON TABLE "public"."meets" TO "authenticated";
GRANT ALL ON TABLE "public"."meets" TO "service_role";



GRANT ALL ON TABLE "public"."profile_customizations" TO "anon";
GRANT ALL ON TABLE "public"."profile_customizations" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_customizations" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_memberships" TO "anon";
GRANT ALL ON TABLE "public"."user_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."user_memberships" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































