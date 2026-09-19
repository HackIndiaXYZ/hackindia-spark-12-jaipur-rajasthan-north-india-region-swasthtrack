"use client";

import Link from "next/link";
import { Mail, MessageSquare, Heart, ArrowLeft, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/page-title";

export default function ContactPage() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-subtle hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard (डैशबोर्ड)
        </Link>
      </div>

      <PageTitle
        eyebrow="Support & Feedback (संपर्क एवं सहायता)"
        title="Contact Us"
        description="We'd love to hear from you. Have a question, suggestion, or need help with the app?"
      />

      {/* CREATOR & MISSION CARD — the one hero surface on this page */}
      <Card tone="premium" className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control grad-spring text-gold-ink shadow-e1 font-semibold text-lg">
            PK
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-ink">Pawan Kumar</h2>
            <p className="text-xs font-medium text-gold-ink">Creator of SwasthTrack</p>
            <p className="text-xs sm:text-sm text-ink-muted italic pt-1">
              &ldquo;Made with ❤️ for the people who spent their lives taking care of us.&rdquo;
            </p>
          </div>
        </div>
      </Card>

      {/* CONTACT CHANNELS */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* General Support */}
        <Card className="p-5 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-control bg-surface-sunken text-ink-muted">
                <Mail className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold text-ink">General Support</h3>
            </div>
            <p className="text-xs text-ink-muted leading-relaxed">
              For any app issues, account login questions, or general assistance, feel free to reach out directly.
            </p>
          </div>

          <div className="mt-5 pt-4 border-t border-line">
            <a
              href="mailto:me.guptapawan@gmail.com"
              className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-ink px-4 py-2.5 text-xs font-semibold text-ink-inverse hover:opacity-90 transition-opacity shadow-2xs"
            >
              <Mail className="h-3.5 w-3.5" />
              Email Support
            </a>
            <p className="mt-1.5 text-center text-xs text-ink-subtle font-mono">
              me.guptapawan@gmail.com
            </p>
          </div>
        </Card>

        {/* Feedback & Suggestions */}
        <Card className="p-5 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-control bg-brand-soft text-brand-ink">
                <MessageSquare className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-semibold text-ink">Have a Suggestion?</h3>
            </div>
            <p className="text-xs text-ink-muted leading-relaxed">
              Your feedback can help make SwasthTrack simpler, safer, and more useful for families caring for their parents.
            </p>
          </div>

          <div className="mt-5 pt-4 border-t border-line">
            <a
              href="mailto:me.guptapawan@gmail.com?subject=SwasthTrack%20Feedback"
              className="inline-flex w-full items-center justify-center gap-2 rounded-control bg-brand px-4 py-2.5 text-xs font-semibold text-ink-inverse hover:bg-brand-strong transition-colors shadow-2xs"
            >
              <Send className="h-3.5 w-3.5" />
              Send Feedback
            </a>
            <p className="mt-1.5 text-center text-xs text-ink-subtle font-mono">
              Subject: SwasthTrack Feedback
            </p>
          </div>
        </Card>
      </div>

      {/* PHILOSOPHY FOOTNOTE */}
      <div className="rounded-card border border-line bg-surface-sunken p-5 text-center space-y-1.5">
        <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-ink">
          <Heart className="h-4 w-4 fill-rose-500 text-rose-500" />
          <span>Built with care for families who care for each other.</span>
        </div>
        <p className="text-xs text-ink-subtle">
          SwasthTrack is an independent family health companion created by Pawan Kumar.
        </p>
      </div>
    </div>
  );
}
