"use client";

import Link from "next/link";
import {
  Heart,
  HeartPulse,
  Pill,
  Utensils,
  Footprints,
  Moon,
  Scale,
  ShieldAlert,
  Users,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageTitle } from "@/components/ui/page-title";

export default function AboutPage() {
  const features = [
    {
      title: "Blood Pressure Tracking",
      hindi: "रक्तचाप निगरानी",
      desc: "Log daily morning and evening BP readings, monitor trends, and view systolic/diastolic patterns.",
      icon: HeartPulse,
      color: "text-rose-600 bg-rose-50 border-rose-100",
    },
    {
      title: "Medicine Schedule",
      hindi: "दवाइयों का समय",
      desc: "0-lag instant status tracking (Taken, Late, Missed) with before/after meal reminders and daily adherence scorecards.",
      icon: Pill,
      color: "text-emerald-600 bg-emerald-50 border-emerald-100",
    },
    {
      title: "Indian Food & Calories",
      hindi: "भारतीय भोजन व कैलोरी",
      desc: "Database of 2,600+ regional Indian items with portion sizing, oil adjustments, and real-time calorie calculation.",
      icon: Utensils,
      color: "text-amber-600 bg-amber-50 border-amber-100",
    },
    {
      title: "Weight & Target Goals",
      hindi: "वजन व लक्ष्य",
      desc: "Track weight progression against physician-recommended targets with BMI estimation and trend charts.",
      icon: Scale,
      color: "text-sky-600 bg-sky-50 border-sky-100",
    },
    {
      title: "Activity & Steps",
      hindi: "कदम व गतिविधि",
      desc: "Log daily walking steps, distance in km, and burned calories with non-judgmental, gentle movement goals.",
      icon: Footprints,
      color: "text-emerald-600 bg-emerald-50 border-emerald-100",
    },
    {
      title: "Sleep & Recovery",
      hindi: "नींद व विश्राम",
      desc: "Record sleep duration, bedtime routines, and sleep quality to ensure deep, rejuvenating rest.",
      icon: Moon,
      color: "text-indigo-600 bg-indigo-50 border-indigo-100",
    },
    {
      title: "Caregiver Family Hub",
      hindi: "केयरगिवर डैशबोर्ड",
      desc: "Children and family members can securely monitor routine adherence, check for missing logs, and stay connected.",
      icon: Users,
      color: "text-purple-600 bg-purple-50 border-purple-100",
    },
    {
      title: "Doctor Shareable Reports",
      hindi: "डॉक्टर रिपोर्ट्स",
      desc: "Export clean weekly/monthly summary reports and CSV spreadsheets ready for medical check-up visits.",
      icon: Sparkles,
      color: "text-teal-600 bg-teal-50 border-teal-100",
    },
  ];

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
        eyebrow="Our Story & Mission (हमारा उद्देश्य)"
        title="About SwasthTrack"
        description="A dedicated health and family-care companion designed to help families track and support everyday wellness together."
      />

      {/* CORE EMOTIONAL MISSION BANNER — the one hero surface on this page */}
      <Card tone="premium" className="p-6 sm:p-8 shine-sweep">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-gold-line bg-gold-soft px-3 py-1 text-xs font-semibold text-gold-ink">
            <Heart className="h-3.5 w-3.5 fill-gold-ink text-gold-ink" />
            <span>The Heart of SwasthTrack</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-ink tracking-tight leading-snug">
            &ldquo;Once, our parents took care of every little thing for us.
            Now, it&apos;s our turn to take care of them.&rdquo;
          </h2>

          <p className="text-sm sm:text-base text-ink-muted leading-relaxed font-medium">
            SwasthTrack was born from a simple, personal reality: our parents spent their entire lives putting our well-being first. As they grow older, we want to help them maintain healthy daily routines — their blood pressure, timely medicines, balanced meals, gentle walks, and peaceful rest — even when we cannot always be physically in the same room.
          </p>
        </div>
      </Card>

      {/* WHY SWASTHTRACK */}
      <div className="space-y-3">
        <h3 className="text-base sm:text-lg font-semibold text-ink">
          Why SwasthTrack? (स्वस्थट्रैक क्यों?)
        </h3>
        <div className="rounded-card border border-line bg-surface p-5 sm:p-6 space-y-3 text-xs sm:text-sm text-ink-muted leading-relaxed">
          <p>
            Most fitness apps are built for gym athletes or calorie counters, making them complicated, overwhelming, and inaccessible for elderly parents.
          </p>
          <p>
            SwasthTrack is designed with a completely different mindset:
          </p>
          <ul className="list-disc list-inside space-y-1.5 font-medium text-ink">
            <li><strong>Elderly-friendly readability</strong>: High-contrast fonts, clear Hindi labels, and large 1-tap touch targets.</li>
            <li><strong>Desi Indian food database</strong>: 2,600+ regional Indian items (roti, dal, khichdi, sabzi, chai) with authentic portion sizes.</li>
            <li><strong>Zero-lag medicine tracking</strong>: Simple one-tap marking for daily prescriptions.</li>
            <li><strong>Caregiver transparency</strong>: Giving family members peace of mind with real-time visibility into daily routine completion.</li>
          </ul>
        </div>
      </div>

      {/* COMPLETE FEATURE SET */}
      <div className="space-y-4">
        <h3 className="text-base sm:text-lg font-semibold text-ink">
          Comprehensive Health Tracking Suite
        </h3>
        <div className="grid gap-3.5 sm:grid-cols-2">
          {features.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className="rounded-card border border-line bg-surface p-4 sm:p-5 shadow-2xs space-y-2 hover:border-line-strong transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-control border ${feat.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-ink">{feat.title}</h4>
                    <p className="text-xs font-semibold text-ink-subtle font-hindi">{feat.hindi}</p>
                  </div>
                </div>
                <p className="text-xs text-ink-muted leading-relaxed">{feat.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* MEDICAL DISCLAIMER NOTICE */}
      <div className="rounded-card border border-attention-line bg-attention-soft p-5 text-xs text-attention flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 shrink-0 text-attention mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-sm">Important Health Tool Notice</p>
          <p className="leading-relaxed text-attention">
            SwasthTrack is a supportive health tracking and habit-consistency tool. It is not a hospital, emergency service, or medical diagnosis platform. All health decisions and prescription adjustments should always be made under the direct guidance of qualified medical professionals.
          </p>
          <Link
            href="/medical-disclaimer"
            className="inline-block pt-1 font-semibold text-attention underline hover:opacity-80 transition-opacity"
          >
            Read our full Medical Disclaimer →
          </Link>
        </div>
      </div>

      {/* CREATOR FOOTER */}
      <div className="rounded-card border border-line bg-surface-sunken p-6 text-center space-y-2">
        <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-ink">
          <span>Made with</span>
          <Heart className="h-4 w-4 fill-rose-500 text-rose-500 inline" />
          <span>by Pawan Kumar</span>
        </div>
        <p className="text-xs text-ink-subtle">
          Built with care for families who care for each other.
        </p>
      </div>
    </div>
  );
}
