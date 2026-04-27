import React, { useEffect, useState } from "react";
import PageShell from "../../components/PageShell";
import Sidebar from "../../components/Sidebar";
import { useAuth } from "../../contexts/AuthContext";
import { useI18n } from "../../contexts/I18nContext"; // ITER9
import toast from "react-hot-toast";
import { MessageSquare, Check, Filter, Reply } from "lucide-react";

interface Message {
  id: number;
  subject: string;
  body: string;
  senderName: string | null;
  senderEmail: string | null;
  isHandled: boolean;
  createdAt: string;
  replyText: string | null;
  repliedAt: string | null;
  sender: { email: string; username: string; clientId: number | null; client: { name: string } | null };
}

export default function SuperAdminMessages() {
  const { accessToken } = useAuth();
  const { t } = useI18n(); // ITER9
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterHandled, setFilterHandled] = useState<"all" | "handled" | "pending">("all");
  const [filterCompany, setFilterCompany] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  async function loadMessages() {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/super-admin/messages", { headers: authHeaders });
      if (!res.ok) throw new Error();
      setMessages(await res.json());
    } catch {
      toast.error(t("loadingError")); // ITER9
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMessages(); }, [accessToken]);

  async function handleReply(id: number) {
    if (!replyText.trim()) return;
    setReplying(true);
    try {
      const res = await fetch(`/api/super-admin/messages/${id}/reply`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ replyText }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("replySuccess"));
      setReplyingTo(null);
      setReplyText("");
      await loadMessages();
    } catch {
      toast.error(t("loadingError"));
    } finally {
      setReplying(false);
    }
  }

  async function toggleHandled(id: number) {
    try {
      const res = await fetch(`/api/super-admin/messages/${id}/handled`, {
        method: "PUT",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error();
      setMessages(prev => prev.map(m => m.id === id ? { ...m, isHandled: !m.isHandled } : m));
    } catch {
      toast.error(t("loadingError")); // ITER9
    }
  }

  const companies = [...new Set(messages.map(m => m.sender?.client?.name || m.senderName || "").filter(Boolean))];

  const filtered = messages.filter(m => {
    const companyName = m.sender?.client?.name || m.senderName || "";
    if (filterHandled === "handled" && !m.isHandled) return false;
    if (filterHandled === "pending" && m.isHandled) return false;
    if (filterCompany && companyName !== filterCompany) return false;
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
              <h1 className="text-2xl font-bold text-gray-900">{t("myMessages")}</h1> {/* ITER9 */}
              <p className="text-sm text-gray-500 mt-1">{t("clientAdminMessages")}</p> {/* ITER9 */}
            </div>
            {pending > 0 && (
              <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
                {pending} {t("unhandled")}{pending > 1 ? "s" : ""} {/* ITER9 */}
              </span>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-3 mb-6 flex-wrap">
            <select value={filterHandled} onChange={e => setFilterHandled(e.target.value as any)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="all">{t("allMessages")}</option> {/* ITER9 */}
              <option value="pending">{t("pendingMessages")}</option> {/* ITER9 */}
              <option value="handled">{t("handledMessages")}</option> {/* ITER9 */}
            </select>
            <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="">{t("allCompanies")}</option> {/* ITER9 */}
              {companies.map(c => <option key={c} value={c}>{c}</option>)}
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
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">{t("notHandled")}</span> // ITER9
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {msg.sender?.client?.name || msg.senderName || msg.sender?.email} •{" "}
                          {new Date(msg.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
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
                        {msg.isHandled ? t("markPending") : t("markHandled")} {/* ITER9 */}
                      </button>
                    </div>
                  </div>
                  {expanded === msg.id && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
                        <div><span className="font-medium">{t("contactEmail")} :</span> {msg.senderEmail || "N/A"}</div>
                        <div><span className="font-medium">{t("company")} :</span> {msg.sender?.client?.name || msg.senderName || "N/A"}</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
                        {msg.body}
                      </div>
                      {/* ITER11: Réponse déjà envoyée */}
                      {msg.replyText && (
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-800">
                          <p className="font-semibold text-xs text-indigo-500 mb-1">{t("replyText")} :</p>
                          <p className="whitespace-pre-wrap">{msg.replyText}</p>
                        </div>
                      )}
                      {/* ITER11: Formulaire de réponse */}
                      {replyingTo === msg.id ? (
                        <div className="space-y-2">
                          <textarea
                            rows={3}
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            placeholder={t("replyPlaceholder")}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                          />
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => { setReplyingTo(null); setReplyText(""); }}
                              className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs hover:bg-gray-50">{t("cancel")}</button>
                            <button onClick={() => handleReply(msg.id)} disabled={replying || !replyText.trim()}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium disabled:opacity-50">
                              <Reply size={12} />
                              {replying ? t("replying") : t("send")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); setReplyingTo(msg.id); setReplyText(""); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium hover:bg-indigo-100">
                          <Reply size={12} />
                          {t("replyMessage")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </PageShell>
    </div>
  );
}
