import { supabase } from "@/integrations/supabase/client";
import type { ChatMsg } from "./streamChat";

export type ChatSession = {
  id: string;
  title: string;
  updated_at: string;
};

export async function listSessions(): Promise<ChatSession[]> {
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id,title,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createSession(title = "New chat"): Promise<ChatSession> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({ title, user_id: userId })
    .select("id,title,updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function loadMessages(sessionId: string): Promise<ChatMsg[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role,content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}

export async function saveMessage(sessionId: string, msg: ChatMsg) {
  const { error } = await supabase
    .from("chat_messages")
    .insert({ session_id: sessionId, role: msg.role, content: msg.content });
  if (error) throw error;
}

export async function renameSession(sessionId: string, title: string) {
  const { error } = await supabase
    .from("chat_sessions")
    .update({ title })
    .eq("id", sessionId);
  if (error) throw error;
}

export async function deleteSession(sessionId: string) {
  const { error } = await supabase.from("chat_sessions").delete().eq("id", sessionId);
  if (error) throw error;
}