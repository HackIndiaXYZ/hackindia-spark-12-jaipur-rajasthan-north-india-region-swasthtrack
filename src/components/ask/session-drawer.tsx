"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquareText, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/page";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase/client";

interface SessionRow {
  id: string;
  title: string | null;
  last_active_at: string;
}

/** Past conversations for the active patient (read straight from Supabase; RLS limits rows to the signed-in user). */
export function SessionDrawer({
  isOpen,
  onClose,
  patientId,
  activeId,
  onOpen,
  onNew,
}: {
  isOpen: boolean;
  onClose: () => void;
  patientId: string | null;
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const load = useCallback(async () => {
    if (!patientId) return;
    const { data, error } = await supabase.from("soie_sessions").select("id,title,last_active_at").eq("patient_id", patientId).order("last_active_at", { ascending: false }).limit(40);
    if (error) {
      setFailed(true);
      setRows([]);
      return;
    }
    setFailed(false);
    setRows(data ?? []);
  }, [patientId]);

  useEffect(() => {
    if (!isOpen) return;
    let live = true;
    (async () => {
      await load();
      if (!live) return;
    })();
    return () => {
      live = false;
    };
  }, [isOpen, load]);

  async function remove(id: string) {
    const ok = await confirm({ title: "यह बातचीत हटाएँ?", message: "इसके सवाल-जवाब हमेशा के लिए हट जाएँगे।", confirmLabel: "हटाएँ", tone: "danger" });
    if (!ok) return;
    const { error } = await supabase.from("soie_sessions").delete().eq("id", id);
    if (error) {
      toast({ title: "हटाया नहीं जा सका", tone: "error" });
      return;
    }
    setRows((r) => (r ?? []).filter((x) => x.id !== id));
    if (id === activeId) onNew();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="पुरानी बातचीत"
      hindiTitle="History"
      size="md"
      footer={
        <Button variant="primary" block onClick={() => { onNew(); onClose(); }}>
          नई बातचीत शुरू करें
        </Button>
      }
    >
      {rows === null ? (
        <p className="py-6 text-center text-sm text-ink-muted" role="status">
          लोड हो रहा है…
        </p>
      ) : failed ? (
        <EmptyState icon={MessageSquareText} title="History could not load" hindiTitle="बातचीत की सूची लोड नहीं हो सकी" description="कृपया थोड़ी देर बाद फिर खोलें।" />
      ) : rows.length === 0 ? (
        <EmptyState icon={MessageSquareText} title="No conversations yet" hindiTitle="अभी कोई बातचीत नहीं" description="पहला सवाल पूछते ही यहाँ दिखेगी।" />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-1.5">
              <button
                type="button"
                onClick={() => {
                  onOpen(s.id);
                  onClose();
                }}
                aria-current={s.id === activeId ? "true" : undefined}
                className="pressable min-h-control flex-1 rounded-control px-2 py-2 text-left hover:bg-surface-sunken"
              >
                <span lang="hi" className="line-clamp-2 text-sm font-medium text-ink">
                  {s.title || "बातचीत"}
                </span>
                <span className="block text-2xs text-ink-subtle">{new Date(s.last_active_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </button>
              <IconButton aria-label="बातचीत हटाएँ" onClick={() => remove(s.id)}>
                <Trash2 aria-hidden className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
