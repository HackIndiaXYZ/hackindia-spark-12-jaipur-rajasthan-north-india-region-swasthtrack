"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, RefreshCw, ScanLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, NumberInput } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { parseDecimalInput, parseIntegerInput } from "@/components/health/format";
import { CropEditor } from "@/components/vision/crop-editor";
import { PhotoPicker } from "@/components/vision/photo-picker";
import type { Box } from "@/lib/vision/gray";
import type { DisplayKind, DisplayReadResult } from "@/lib/vision/display-reader";
import { canvasToGray, cropCanvas, decodePhoto, previewDataUrl, type CropBox } from "@/lib/vision/image";
import { useDisplayReader } from "@/lib/vision/use-display-reader";

export type BPPhotoValues = { systolic: number; diastolic: number; pulse: number | null };
export type WeightPhotoValues = { kg: number };

type Props =
  | { kind: "bp"; isOpen: boolean; onClose: () => void; onResult: (values: BPPhotoValues) => void }
  | { kind: "weight"; isOpen: boolean; onClose: () => void; onResult: (values: WeightPhotoValues) => void };

type Step = "pick" | "crop" | "reading" | "result" | "failed";

const COPY: Record<DisplayKind, { title: string; hindiTitle: string; what: string; tip: string }> = {
  bp: {
    title: "Read the BP machine",
    hindiTitle: "BP मशीन की फोटो",
    what: "BP मशीन की स्क्रीन",
    tip: "स्क्रीन को सीधा, पास से और बिना चमक के लें। ऊपर वाला, नीचे वाला और नब्ज़ तीनों अंक दिखने चाहिए।",
  },
  weight: {
    title: "Read the weighing scale",
    hindiTitle: "वजन मशीन की फोटो",
    what: "वजन मशीन की स्क्रीन",
    tip: "मशीन पर खड़े होकर अंक रुक जाएँ, फिर स्क्रीन की फोटो सीधी और पास से लें।",
  },
};

/** The default crop: the middle of the frame, where the person was asked to keep the screen. */
function defaultBox(width: number, height: number): CropBox {
  return { x: width * 0.1, y: height * 0.22, width: width * 0.8, height: height * 0.52 };
}

/**
 * Photo of a display -> numbers in the form. Steps: take the photo, tighten the box
 * around the screen, read, confirm (every number stays editable). The reading is a
 * suggestion: nothing is saved here.
 */
export function DisplayPhotoDialog(props: Props) {
  // Mounted only while open, so every opening starts at the first step.
  return props.isOpen ? <DisplayPhotoDialogBody {...props} /> : null;
}

function DisplayPhotoDialogBody(props: Props) {
  const { kind, isOpen, onClose } = props;
  const copy = COPY[kind];
  const read = useDisplayReader();

  const [step, setStep] = useState<Step>("pick");
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [box, setBox] = useState<CropBox>({ x: 0, y: 0, width: 1, height: 1 });
  const [crop, setCrop] = useState<HTMLCanvasElement | null>(null);
  const [result, setResult] = useState<DisplayReadResult | null>(null);
  const [error, setError] = useState<string>("");
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [pulse, setPulse] = useState("");
  const [kg, setKg] = useState("");

  async function handlePhoto(file: File) {
    setError("");
    try {
      const canvas = await decodePhoto(file, 1600);
      setPhoto(canvas);
      setPreview(previewDataUrl(canvas, 1200));
      setBox(defaultBox(canvas.width, canvas.height));
      setStep("crop");
    } catch (err) {
      setError(err instanceof Error ? err.message : "फोटो खोली नहीं जा सकी");
    }
  }

  async function runReader(useWholePhoto: boolean) {
    if (!photo) return;
    setStep("reading");
    setError("");
    try {
      const region = useWholePhoto ? photo : cropCanvas(photo, box);
      setCrop(region);
      const res = await read(kind, canvasToGray(region, 1100));
      setResult(res);
      if (!res.reading) {
        setStep("failed");
        return;
      }
      if (res.kind === "bp" && res.reading) {
        setSystolic(String(res.reading.systolic));
        setDiastolic(String(res.reading.diastolic));
        setPulse(res.reading.pulse === null ? "" : String(res.reading.pulse));
      } else if (res.kind === "weight" && res.reading) {
        setKg(String(res.reading.kg));
      }
      setStep("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "फोटो पढ़ी नहीं जा सकी");
      setStep("failed");
    }
  }

  // The crop with the digits that were read drawn as boxes, for the confirmation screen.
  const marked = useMemo(() => {
    if (!crop || !result?.reading) return "";
    const canvas = document.createElement("canvas");
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    // The boxes live in the frame the reader levelled; show the photo turned the same way.
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((result.reading.rotation * Math.PI) / 180);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
    ctx.drawImage(crop, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sx = crop.width / result.reading.width;
    const sy = crop.height / result.reading.height;
    const boxes: Array<Box | null> = result.kind === "bp" ? [result.reading.boxes.systolic, result.reading.boxes.diastolic, result.reading.boxes.pulse] : [result.reading.box];
    ctx.lineWidth = Math.max(2, crop.width / 250);
    ctx.strokeStyle = "#0a6a4a";
    for (const b of boxes) {
      if (!b) continue;
      const pad = 4;
      ctx.strokeRect(b.x0 * sx - pad, b.y0 * sy - pad, (b.x1 - b.x0 + 1) * sx + 2 * pad, (b.y1 - b.y0 + 1) * sy + 2 * pad);
    }
    return previewDataUrl(canvas, 900);
  }, [crop, result]);

  const confidence = result?.reading?.confidence ?? 0;
  const notes = result?.reading?.notes ?? [];

  function useValues() {
    if (props.kind === "bp") {
      const s = parseIntegerInput(systolic);
      const d = parseIntegerInput(diastolic);
      const p = pulse.trim() === "" ? null : parseIntegerInput(pulse);
      if (Number.isNaN(s) || Number.isNaN(d) || (p !== null && Number.isNaN(p))) {
        setError("अंक पूरे लिखें (systolic और diastolic ज़रूरी हैं)");
        return;
      }
      props.onResult({ systolic: s, diastolic: d, pulse: p });
    } else {
      const v = parseDecimalInput(kg);
      if (Number.isNaN(v)) {
        setError("वजन kg में लिखें");
        return;
      }
      props.onResult({ kg: v });
    }
    onClose();
  }

  const footer =
    step === "crop" ? (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={() => setStep("pick")}>
          <RefreshCw aria-hidden className="h-4 w-4" />
          <span lang="hi">दूसरी फोटो</span>
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="secondary" onClick={() => void runReader(true)}>
            <span lang="hi">पूरी फोटो पढ़ें</span>
          </Button>
          <Button variant="primary" onClick={() => void runReader(false)}>
            <ScanLine aria-hidden className="h-4 w-4" />
            <span lang="hi">बॉक्स के अंदर पढ़ें</span>
          </Button>
        </div>
      </div>
    ) : step === "result" ? (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={() => setStep("pick")}>
          <RefreshCw aria-hidden className="h-4 w-4" />
          <span lang="hi">दोबारा फोटो</span>
        </Button>
        <Button variant="primary" onClick={useValues}>
          <Check aria-hidden className="h-4 w-4" />
          <span lang="hi">ये अंक फ़ॉर्म में भरें</span>
        </Button>
      </div>
    ) : step === "failed" ? (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={onClose}>
          <span lang="hi">हाथ से लिखूँगा</span>
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {photo ? (
            <Button variant="secondary" onClick={() => setStep("crop")}>
              <ScanLine aria-hidden className="h-4 w-4" />
              <span lang="hi">बॉक्स ठीक करके फिर पढ़ें</span>
            </Button>
          ) : null}
          <Button variant="primary" onClick={() => setStep("pick")}>
            <RefreshCw aria-hidden className="h-4 w-4" />
            <span lang="hi">दोबारा फोटो लें</span>
          </Button>
        </div>
      </div>
    ) : undefined;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={copy.title} hindiTitle={copy.hindiTitle} size="lg" footer={footer} closeOnBackdrop={step !== "reading"}>
      <div className="space-y-4">
        {error ? (
          <p role="alert" className="rounded-card border border-critical-line bg-critical-soft p-3 text-sm font-medium text-critical">
            {error}
          </p>
        ) : null}

        {step === "pick" ? (
          <>
            <p lang="hi" className="text-sm text-ink-muted">
              {copy.tip}
            </p>
            <PhotoPicker onPhoto={(f) => void handlePhoto(f)} captureLabel={`${copy.what} की फोटो लें`} hint="फोटो फ़ोन पर ही पढ़ी जाती है; कहीं भेजी नहीं जाती।" />
          </>
        ) : null}

        {step === "crop" && photo ? (
          <>
            <p lang="hi" className="text-sm text-ink-muted">
              बॉक्स को खींचकर सिर्फ़ स्क्रीन के अंकों के चारों ओर रखें। कोनों से छोटा-बड़ा करें।
            </p>
            <CropEditor src={preview} naturalWidth={photo.width} naturalHeight={photo.height} box={box} onChange={setBox} label="स्क्रीन के चारों ओर बॉक्स" />
          </>
        ) : null}

        {step === "reading" ? (
          <div role="status" aria-live="polite" className="tile flex items-center gap-3 rounded-card p-4">
            <span className="st-spinner h-6 w-6 shrink-0 rounded-full border-2 border-line border-t-brand" aria-hidden />
            <p lang="hi" className="text-sm text-ink">
              अंक पढ़ रहे हैं…
            </p>
          </div>
        ) : null}

        {step === "failed" ? (
          <div className="tile space-y-2 rounded-card p-4">
            <p lang="hi" className="flex items-center gap-2 text-sm font-semibold text-ink">
              <AlertTriangle aria-hidden className="h-4 w-4 text-attention" />
              अंक साफ़ नहीं पढ़े जा सके
            </p>
            <ul lang="hi" className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
              <li>स्क्रीन को फोटो में बड़ा और सीधा रखें (बॉक्स उसी के चारों ओर)।</li>
              <li>रोशनी की चमक स्क्रीन पर न पड़े; फ़्लैश बंद रखें।</li>
              <li>फोटो हिले नहीं; ज़रूरत हो तो दोबारा लें।</li>
            </ul>
          </div>
        ) : null}

        {step === "result" && result?.reading ? (
          <div className="space-y-4">
            {marked ? (
              // eslint-disable-next-line @next/next/no-img-element -- the person's own photo, just taken
              <img src={marked} alt="पढ़े गए अंकों के चारों ओर हरे बॉक्स" className="block w-full rounded-card" />
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={confidence >= 0.7 ? "positive" : "attention"}>{confidence >= 0.7 ? "साफ़ पढ़ा गया" : "जाँच लें"}</Badge>
              <span lang="hi" className="text-xs text-ink-muted">
                हरे बॉक्स में जो दिखा, वही नीचे भरा है। मशीन से मिलाकर ज़रूरत हो तो सुधारें।
              </span>
            </div>
            {notes.length > 0 ? (
              <ul lang="hi" className="space-y-1 text-xs text-ink-muted">
                {notes.map((n) => (
                  <li key={n}>• {n}</li>
                ))}
              </ul>
            ) : null}
            {kind === "bp" ? (
              <div className="grid grid-cols-3 gap-3">
                <Field label="ऊपर वाला" hint="Systolic">
                  <NumberInput value={systolic} maxLength={3} onChange={(e) => setSystolic(e.target.value)} className="text-center text-xl font-semibold" />
                </Field>
                <Field label="नीचे वाला" hint="Diastolic">
                  <NumberInput value={diastolic} maxLength={3} onChange={(e) => setDiastolic(e.target.value)} className="text-center text-xl font-semibold" />
                </Field>
                <Field label="नब्ज़" hint="Pulse">
                  <NumberInput value={pulse} maxLength={3} onChange={(e) => setPulse(e.target.value)} className="text-center text-xl font-semibold" />
                </Field>
              </div>
            ) : (
              <Field label="वजन (kg)" hint={result.kind === "weight" && result.reading.decimalAssumed ? "दशमलव अपने-आप माना गया है" : undefined}>
                <NumberInput allowDecimal value={kg} maxLength={6} onChange={(e) => setKg(e.target.value)} className="text-center text-2xl font-semibold" />
              </Field>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
