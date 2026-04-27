import React, { useEffect, useState } from "react";
import PageShell from "../../components/PageShell";
import Sidebar from "../../components/Sidebar";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext"; // ITER9
import HelpRequestButton from "../../components/HelpRequestButton"; // ITER12
import toast from "react-hot-toast";
import { MessageSquare, Check, Share2, CornerDownLeft } from "lucide-react";

interface Message {
  id: number;
  subject: string;
  body: string;
  senderName: string | null;
  senderEmail: string | null;
  isHandled: boolean;
  createdAt: string;
  forwardedToSuperAdmin: boolean;
  replyText: string | null; // ITER12
  repliedAt: string | null; // ITER12
  sender: { email: string; username: string } | null;
}

export default function AdminMessages() {
  const { accessToken } = useAuth();
  const { t } = useI18n(); // ITER9
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterHandled, setFilterHandled] = useState<"all" | "handled" | "pending">("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<number | null>(null); // ITER12
  const [replyDraft, setReplyDraft] = useState(""); // ITER12
  const [sendingReply, setSendingReply] = useState(false); // ITER12

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  async function loadMessages() {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/admin/messages", { headers: authHeaders });
      if (!res.ok) throw new Error();
      setMessages(await res.json());
    } catch {
      toast.error("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMessages(); }, [accessToken]);

  async function handleForward(id: number) {
    try {
      const res = await fetch(`/api/admin/messages/${id}/forward`, { method: "POST", headers: authHeaders });
      if (!res.ok) throw new Error();
      toast.success(t("forwardSuccess"));
      setMessages(prev => prev.map(m => m.id === id ? { ...m, forwardedToSuperAdmin: true } : m));
    } catch {
      toast.error(t("messageError"));
    }
  }

  // ITER12: Reply to employee message
  async function handleReply(id: number) {
    if (!replyDraft.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/admin/messages/${id}/reply`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ replyText: replyDraft }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setMessages(prev => prev.map(m => m.id === id ? { ...m, replyText: updated.replyText, repliedAt: updated.repliedAt, isHandled: true } : m));
      setReplyingTo(null);
      setReplyDraft("");
      toast.success(t("replySuccess"));
    } catch {
      toast.error(t("messageError"));
    } finally {
      setSendingReply(false);
    }
  }

  async function toggleHandled(id: number) {
    try {
      const res = await fetch(`/api/admin/messages/${id}/handled`, {
        method: "PUT",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error();
      setMessages(prev => prev.map(m => m.id === id ? { ...m, isHandled: !m.isHandled } : m));
    } catch {
      toast.error("Erreur");
    }
  }

  const filtered = messages.filter(m => {
    if (filterHandled === "handled" && !m.isHandled) return false;
    if (filterHandled === "pending" && m.isHandled) return false;
    return true;
  });

  const pending = messages.filter(m => !m.isHandled).length;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t("messages")}</h1> {/* ITER9 */}
              <p className="text-sm text-gray-500 mt-1">{t("employeeMessages")}</p> {/* ITER9 */}
            </div>
            {pending > 0 && (
              <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
                {pending} non traité{pending > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-3 mb-6">
            <select value={filterHandled} onChange={e => setFilterHandled(e.target.value as "all" | "handled" | "pending")}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
              {/* ITER9: i18n */}
            <option value="all">{t("allMessages")}</option>
              <option value="pending">{t("notHandled")}</option>
              <option value="handled">{t("handled")}</option>
            </select>
          </div>

          {loading ? (
            <p className="text-gray-500">{t("loading")}</p> // ITER9
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">{t("noMessages")}</p> {/* ITER9 */}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(msg => (
                <div key={msg.id}
                  className={`bg-white rounded-xl border ${msg.isHandled ? "border-gray-200 opacity-75" : "border-amber-200"} overflow-hidden`}>
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpanded(expanded === msg.id ? null : msg.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${msg.isHandled ? "bg-gray-300" : "bg-amber-400"}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-gray-900">{msg.subject}</span>
                          {!msg.isHandled && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">Non traité</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {msg.senderName || msg.sender?.email || "Anonyme"} •{" "}
                          {new Date(msg.createdAt).toLocaleDateString("fr-FR", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); toggleHandled(msg.id); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          msg.isHandled
                            ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            : "bg-green-100 text-green-700 hover:bg-green-200"
                        }`}
                      >
                        <Check size={12} />
                        {/* ITER9: i18n */}
                        {msg.isHandled ? t("putBackPending") : t("markHandled")}
                      </button>
                    </div>
                  </div>
                  {expanded === msg.id && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
                        <div><span className="font-medium">{t("senderLabel")} :</span> {msg.senderName || "N/A"}</div>
                        <div><span className="font-medium">{t("emailAddress")} :</span> {msg.senderEmail || msg.sender?.email || "N/A"}</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
                        {msg.body}
                      </div>
                      {/* ITER12: Reply thread */}
                      {msg.replyText && (
                        <div className="bg-indigo-50 rounded-lg p-3 text-sm text-indigo-800 whitespace-pre-wrap border-l-4 border-indigo-300">
                          <div className="text-xs text-indigo-500 font-medium mb-1">
                            {t("replyText")} — {msg.repliedAt ? new Date(msg.repliedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                          </div>
                          {msg.replyText}
                        </div>
                      )}
                      {replyingTo === msg.id ? (
                        <div className="space-y-2" onClick={e => e.stopPropagation()}>
                          <textarea
                            value={replyDraft}
                            onChange={e => setReplyDraft(e.target.value)}
                            rows={3}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            placeholder={t("replyPlaceholder")}
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => { setReplyingTo(null); setReplyDraft(""); }}
                              className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                              {t("cancel")}
                            </button>
                            <button
                              onClick={() => handleReply(msg.id)}
                              disabled={sendingReply || !replyDraft.trim()}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                            >
                              <CornerDownLeft size={12} />
                              {sendingReply ? t("sending") : t("send")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={e => { e.stopPropagation(); setReplyingTo(msg.id); setReplyDraft(""); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium hover:bg-indigo-100"
                          >
                            <CornerDownLeft size={12} />
                            {t("replyMessage")}
                          </button>
                          {/* ITER11: Transférer au Super Admin */}
                          {msg.forwardedToSuperAdmin ? (
                            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-medium">
                              <Share2 size={12} />
                              {t("forwarded")}
                            </span>
                          ) : (
                            <button
                              onClick={e => { e.stopPropagation(); handleForward(msg.id); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 text-gray-700 text-xs font-medium hover:bg-gray-100"
                            >
                              <Share2 size={12} />
                              {t("forwardToSA")}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </PageShell>
      <HelpRequestButton /> {/* ITER12 */}
    </div>
  );
}
