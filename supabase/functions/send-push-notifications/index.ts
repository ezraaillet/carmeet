import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type NotificationEvent = {
  id: string;
  recipient_user_id: string;
  notification_type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  attempts: number;
};

type PushToken = {
  user_id: string;
  expo_push_token: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
const supabase = createClient(supabaseUrl, serviceRoleKey);

function isAuthorized(request: Request) {
  const authorization = request.headers.get("authorization");
  return Boolean(
    serviceRoleKey && authorization === `Bearer ${serviceRoleKey}`,
  );
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "POST required" }, { status: 405 });
  }

  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: events, error: eventError } = await supabase
    .from("notification_events")
    .select(
      "id, recipient_user_id, notification_type, title, body, data, attempts",
    )
    .is("sent_at", null)
    .lt("attempts", 5)
    .order("created_at", { ascending: true })
    .limit(100);

  if (eventError) {
    return Response.json({ error: eventError.message }, { status: 500 });
  }

  const pendingEvents = (events ?? []) as NotificationEvent[];
  if (pendingEvents.length === 0) {
    return Response.json({ processed: 0 });
  }

  const recipientIds = Array.from(
    new Set(pendingEvents.map((event) => event.recipient_user_id)),
  );
  const { data: tokens, error: tokenError } = await supabase
    .from("push_tokens")
    .select("user_id, expo_push_token")
    .eq("enabled", true)
    .in("user_id", recipientIds);

  if (tokenError) {
    return Response.json({ error: tokenError.message }, { status: 500 });
  }

  const tokensByUser = new Map<string, PushToken[]>();
  ((tokens ?? []) as PushToken[]).forEach((token) => {
    const current = tokensByUser.get(token.user_id) ?? [];
    current.push(token);
    tokensByUser.set(token.user_id, current);
  });

  const messages = pendingEvents.flatMap((event) =>
    (tokensByUser.get(event.recipient_user_id) ?? []).map((token) => ({
      to: token.expo_push_token,
      sound: "default",
      title: event.title,
      body: event.body,
      data: {
        ...event.data,
        notification_type: event.notification_type,
      },
    })),
  );

  const eventIds = pendingEvents.map((event) => event.id);
  await supabase
    .from("notification_events")
    .update({ attempts: pendingEvents.reduce((max, event) => Math.max(max, event.attempts), 0) + 1 })
    .in("id", eventIds);

  if (messages.length === 0) {
    await supabase
      .from("notification_events")
      .update({ sent_at: new Date().toISOString() })
      .in("id", eventIds);
    return Response.json({ processed: pendingEvents.length, delivered: 0 });
  }

  const invalidTokens: string[] = [];
  for (let offset = 0; offset < messages.length; offset += 100) {
    const messageChunk = messages.slice(offset, offset + 100);
    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(expoAccessToken
          ? { Authorization: `Bearer ${expoAccessToken}` }
          : {}),
      },
      body: JSON.stringify(messageChunk),
    });

    const responseBody = await expoResponse.text();
    if (!expoResponse.ok) {
      await supabase
        .from("notification_events")
        .update({ last_error: responseBody.slice(0, 1000) })
        .in("id", eventIds);
      return Response.json(
        { error: "Expo push delivery failed", details: responseBody },
        { status: 502 },
      );
    }

    const ticketResponse = JSON.parse(responseBody) as {
      data?: Array<{
        status?: string;
        details?: { error?: string };
      }>;
    };
    messageChunk.forEach((message, index) => {
      if (ticketResponse.data?.[index]?.details?.error === "DeviceNotRegistered") {
        invalidTokens.push(message.to);
      }
    });
  }

  if (invalidTokens.length > 0) {
    await supabase
      .from("push_tokens")
      .update({ enabled: false })
      .in("expo_push_token", invalidTokens);
  }

  await supabase
    .from("notification_events")
    .update({ sent_at: new Date().toISOString(), last_error: null })
    .in("id", eventIds);

  return Response.json({
    processed: pendingEvents.length,
    delivered: messages.length,
  });
});
