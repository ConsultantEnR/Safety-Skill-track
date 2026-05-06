// ITER7: Page Messages participant — liste + envoi de messages vers l'Admin Client
import React, { useEffect, useState } from "react";
import PageShell from "../../components/PageShell";
import { useAuth } from "../../contexts/AuthContext";
import ParticipantSidebar from "./Sidebar";
import { resolveAssetUrl } from "../../lib/runtime";
import toast from "react-hot-toast";
import { MessageSquare, Plus, X, Send, ChevronDown, ChevronUp } from "lucide-react";

interface Message {
  id: number;
  subject: string;
  body: string;
  isHandled: boolean;
  createdAt: string;
  senderName?: string | null;
  testName?: string | null;
  subSubThemeName?: string | null;
  replyText?: string | null;
  repliedAt?: string | null;
}

interface Profile {
  firstName: string;
  lastName: string;
  client: {
    name: string;
    primaryColor: string;
    accentColor: string;
    logoUrl: string | null;
  };
}

interface TestAssignment {
  id: number;
  test: { id: number; name: string };
}

export default function ParticipantMessages() {
  const { accessToken } = useAuth();

  const [profile, setProfile]           = useState<Profile | null>(null);
  const [messages, setMessages]         = useState<Message[]>([]);
  const [assignments, setAssignments]   = useState<TestAssignment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [expanded, setExpanded]         = useState<number | null>(null);

  // ITER7: Modal nouveau message
  const [showModal, setShowModal]         = useState(false);
  const [subject, setSubject]             = useState("");
  const [testName, setTestName]           = useState("");
  const [subTheme, setSubTheme]           = useState("");
  const [body, setBody]                   = useState("");
  const [sending, setSending]             = useState(false);

  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      fetch("/api/participant/profile", { headers: authHeaders }).then(r => r.json()),
      fetch("/api/participant/messages", { headers: authHeaders }).then(r => r.ok ? r.json() : []),
      fetch("/api/participant/tests",    { headers: authHeaders }).then(r => r.ok ? r.json() : []),
    ])
      .then(([prof, msgs, tests]) => {
        setProfile(prof);
        setMessages(Array.isArray(msgs) ? msgs : []);
        setAssignments(Array.isArray(tests) ? tests : []);
      })
      .catch(() => toast.error("Erreur de chargement"))
      .finally(() => setLoading(false));
  }, [accessToken]);

  const primaryColor = profile?.client?.primaryColor || "#27295A";
  const accentColor  = profile?.client?.accentColor  || "#FCC00E";
  const logoUrl      = resolveAssetUrl(profile?.client?.logoUrl) || null;
  const companyName  = profile?.client?.name         || "";

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || !subject.trim()) {
      toast.error("Le sujet et le message sont obligatoires");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/participant/messages", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          subject,
          testName:        testName || undefined,
          subSubThemeName: subTheme || undefined,
          body,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Message envoyé à votre administrateur !");
      // Recharge la liste
      const updated = await fetch("/api/participant/messages", { headers: authHeaders });
      if (updated.ok) setMessages(await updated.json());
      // Reset formulaire + ferme modal
      setSubject(""); setTestName(""); setSubTheme(""); setBody("");
      setShowModal(false);
    } catch {
      toast.error("Erreur lors de l'envoi du message");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <div className="flex-1 flex items-center justify-center text-gray-400">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <ParticipantSidebar
        primaryColor={primaryColor}
        accentColor={accentColor}
        logoUrl={logoUrl}
        companyName={companyName}
        firstName={profile?.firstName}
        lastName={profile?.lastName}
      />

      <PageShell>
        {/* En-tête */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mes messages</h1>
            <p className="text-sm text-gray-500 mt-1">Échanges avec votre administrateur</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold shadow hover:opacity-90 transition-opacity"
            style={{ backgroundColor: primaryColor }}
          >
            <Plus size={16} />
            Nouveau message
          </button>
        </div>

        {/* Liste des messages */}
        {messages.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">Aucun message pour le moment</p>
            <p className="text-gray-400 text-sm mt-1">
              Cliquez sur "Nouveau message" pour contacter votre administrateur.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`bg-white rounded-xl border overflow-hidden transition-all ${
                  msg.isHandled ? "border-gray-200 opacity-90" : "border-blue-200"
                }`}
              >
                {/* En-tête du message */}
                <button
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
                  onClick={() => setExpanded(expanded === msg.id ? null : msg.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${msg.isHandled ? "bg-gray-300" : "bg-blue-400"}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-gray-900">{msg.subject}</span>
                        {!msg.isHandled && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">En attente</span>
                        )}
                        {msg.isHandled && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">Traité</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(msg.createdAt).toLocaleDateString("fr-FR", {
                          day: "2-digit", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                        {msg.testName && ` · ${msg.testName}`}
                      </p>
                    </div>
                  </div>
                  {expanded === msg.id
                    ? <ChevronUp size={16} className="text-gray-400 shrink-0" />
                    : <ChevronDown size={16} className="text-gray-400 shrink-0" />
                  }
                </button>

                {/* Corps du message */}
                {expanded === msg.id && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                    {msg.subSubThemeName && (
                      <p className="text-xs text-gray-500 mb-2">
                        <span className="font-medium">Compétence :</span> {msg.subSubThemeName}
                      </p>
                    )}
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap">
                      {msg.body}
                    </div>
                    {msg.replyText && (
                      <div className="bg-indigo-50 rounded-lg p-3 text-sm text-indigo-800 whitespace-pre-wrap border-l-4 border-indigo-300">
                        <div className="text-xs text-indigo-500 font-medium mb-1 flex items-center gap-1">
                          ↩ Réponse de votre administrateur
                          {msg.repliedAt && (
                            <span className="font-normal text-indigo-400 ml-1">
                              — {new Date(msg.repliedAt).toLocaleDateString("fr-FR", {
                                day: "2-digit", month: "short", year: "numeric",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </span>
                          )}
                        </div>
                        {msg.replyText}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </PageShell>

      {/* ITER7: Modal nouveau message */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold text-gray-800">Nouveau message</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSend} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sujet *</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  placeholder="Ex : Problème avec un test"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Test concerné</label>
                <select
                  value={testName}
                  onChange={e => setTestName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white"
                >
                  <option value="">— Sélectionner un test (optionnel)</option>
                  {assignments.map(a => (
                    <option key={a.id} value={a.test.name}>{a.test.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Compétence / sous-thème</label>
                <input
                  type="text"
                  value={subTheme}
                  onChange={e => setSubTheme(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  placeholder="Ex : Sécurité incendie (optionnel)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message *</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  required
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                  placeholder="Décrivez votre question ou problème..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 transition-opacity"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Send size={14} />
                  {sending ? "Envoi..." : "Envoyer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
