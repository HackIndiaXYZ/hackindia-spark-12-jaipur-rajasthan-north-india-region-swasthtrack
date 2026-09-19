"use client";

import Link from "next/link";
import { FileText, ArrowLeft, ShieldAlert, Mail } from "lucide-react";
import { PageTitle } from "@/components/ui/page-title";

export default function TermsOfUsePage() {
  const lastUpdated = "August 2026";

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
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
        eyebrow="Terms & Conditions (उपयोग की शर्तें)"
        title="Terms of Use"
        description={`Please read these terms carefully before using SwasthTrack. Last updated: ${lastUpdated}.`}
      />

      <div className="rounded-card border border-line bg-surface p-6 sm:p-8 space-y-6 text-xs sm:text-sm text-ink-muted leading-relaxed">
        {/* 1. Acceptance */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-600" />
            1. Acceptance of Terms
          </h2>
          <p>
            By accessing or using the SwasthTrack web application, you agree to be bound by these Terms of Use and our Privacy Policy. If you do not agree to these terms, please do not use the application.
          </p>
        </section>

        {/* 2. Description of Service */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">2. Description of Service</h2>
          <p>
            SwasthTrack is a family-oriented digital health tracking companion designed to help individuals and family caregivers log, monitor, and review daily wellness habits—including blood pressure, prescribed medications, meals, physical activity, weight, and sleep.
          </p>
          <div className="rounded-card border border-attention-line bg-attention-soft p-3.5 text-xs text-attention font-medium flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-attention shrink-0 mt-0.5" />
            <span>
              <strong>Crucial Distinction:</strong> SwasthTrack is not a hospital, diagnostic laboratory, pharmacy, or licensed medical provider. It does not offer clinical medical diagnoses, emergency care, or prescription dispensing.
            </span>
          </div>
        </section>

        {/* 3. User Responsibilities & Account Security */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">3. User Responsibilities & Data Accuracy</h2>
          <p>
            You are responsible for maintaining the accuracy of the health readings, prescriptions, and dosages you enter into the application. We recommend cross-verifying entries with your physical medical prescriptions and blood pressure monitors.
          </p>
          <ul className="list-disc list-inside space-y-1 pl-1 text-ink font-medium">
            <li>You are responsible for keeping your login credentials secure.</li>
            <li>You must not use the application for any unlawful, fraudulent, or abusive purposes.</li>
          </ul>
        </section>

        {/* 4. Caregiver Authorization */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">4. Family Caregiver Access</h2>
          <p>
            When you link a caregiver account or join a patient profile as a family caregiver, you acknowledge that you are authorized by the patient or their legal guardian to view their routine health data for supportive family care purposes.
          </p>
        </section>

        {/* 5. Medical Advice Disclaimer */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">5. No Medical Advice</h2>
          <p>
            All information, scores (such as the Wellness Score), analytics, and predictive trends provided by SwasthTrack are strictly educational and informational. They should never replace professional consultation with a qualified doctor. Always consult your physician before changing medications or lifestyle routines.
          </p>
        </section>

        {/* 6. Intellectual Property */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">6. Intellectual Property</h2>
          <p>
            The software, user interface design, branding, algorithms, and documentation of SwasthTrack are the intellectual property of Pawan Kumar and are protected by applicable intellectual property laws.
          </p>
        </section>

        {/* 7. Limitation of Liability */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">7. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable law, SwasthTrack and its creators shall not be liable for any indirect, incidental, or consequential damages resulting from the use or inability to use the platform, including inaccurate data entry or reliance on tracking metrics for medical decisions.
          </p>
        </section>

        {/* 8. Modifications & Termination */}
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-ink">8. Service Changes & Termination</h2>
          <p>
            We reserve the right to modify, improve, or update features of SwasthTrack to better serve our users. You may terminate your use of the application at any time.
          </p>
        </section>

        {/* 9. Contact Info */}
        <section className="space-y-2 pt-2 border-t border-line">
          <h2 className="text-base font-semibold text-ink flex items-center gap-2">
            <Mail className="h-4 w-4 text-emerald-600" />
            9. Contact & Inquiries
          </h2>
          <p>
            For any legal inquiries, terms clarifications, or support requests:
          </p>
          <div className="rounded-card border border-line bg-surface-sunken p-3.5 text-xs font-mono text-ink">
            <p><strong>Creator</strong>: Pawan Kumar</p>
            <p><strong>Email</strong>: <a href="mailto:me.guptapawan@gmail.com" className="text-emerald-700 underline font-semibold">me.guptapawan@gmail.com</a></p>
          </div>
        </section>
      </div>
    </div>
  );
}
