import { Heart, Mail, MessageSquare, Send } from "lucide-react";
import { LegalPage } from "@/components/legal/legal-page";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ContactPage() {
  return (
    <LegalPage
      eyebrow="Support & feedback"
      title="Contact us"
      hindiTitle="संपर्क और सहायता"
      description="A question, a suggestion, or need help with the app? We would love to hear from you."
      width="max-w-3xl"
    >
      <Card tone="premium" className="p-6">
        <div className="flex items-start gap-4">
          <span className="grad-spring grid h-12 w-12 shrink-0 place-items-center rounded-control text-lg font-semibold text-gold-ink shadow-e1">
            PK
          </span>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-ink">Pawan Kumar</h2>
            <p className="text-xs font-medium text-gold-ink">Creator of SwasthTrack</p>
            <p className="pt-1 text-sm italic text-ink-muted">
              &ldquo;Made with ❤️ for the people who spent their lives taking care of us.&rdquo;
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-control bg-surface-sunken text-ink-muted">
                <Mail aria-hidden className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold text-ink">General support</h2>
            </div>
            <p className="text-sm leading-relaxed text-ink-muted">
              For app problems, sign-in questions or any other help, write to us directly.
            </p>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <a href="mailto:me.guptapawan@gmail.com" className={buttonClasses({ variant: "secondary", block: true })}>
              <Mail aria-hidden className="h-4 w-4" />
              Email support
            </a>
            <p className="mt-1.5 break-all text-center font-mono text-xs text-ink-subtle">me.guptapawan@gmail.com</p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-control bg-brand-soft text-brand-ink">
                <MessageSquare aria-hidden className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold text-ink">Have a suggestion?</h2>
            </div>
            <p className="text-sm leading-relaxed text-ink-muted">
              Your feedback helps make SwasthTrack simpler, safer and more useful for families caring for their parents.
            </p>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <a
              href="mailto:me.guptapawan@gmail.com?subject=SwasthTrack%20Feedback"
              className={buttonClasses({ variant: "primary", block: true })}
            >
              <Send aria-hidden className="h-4 w-4" />
              Send feedback
            </a>
            <p className="mt-1.5 text-center text-xs text-ink-subtle">Subject: SwasthTrack Feedback</p>
          </div>
        </Card>
      </div>

      <p className="rounded-card border border-attention-line bg-attention-soft p-4 text-sm text-ink-muted">
        <span lang="hi">
          यह सपोर्ट ईमेल मेडिकल इमरजेंसी के लिए नहीं है। आपात स्थिति में तुरंत 112 / 108 पर कॉल करें।
        </span>
      </p>

      <div className="space-y-1.5 rounded-card border border-line bg-surface-sunken p-5 text-center">
        <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-ink">
          <Heart aria-hidden className="h-4 w-4 fill-bp text-bp" />
          <span>Built with care for families who care for each other.</span>
        </div>
        <p className="text-xs text-ink-subtle">SwasthTrack is an independent family health companion created by Pawan Kumar.</p>
      </div>
    </LegalPage>
  );
}
