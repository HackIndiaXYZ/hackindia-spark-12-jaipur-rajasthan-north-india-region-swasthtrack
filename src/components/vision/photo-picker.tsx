"use client";

import { useId, useRef, type ChangeEvent } from "react";
import { Camera, Images } from "lucide-react";
import { Button } from "@/components/ui/button";

type PhotoPickerProps = {
  onPhoto: (file: File) => void;
  busy?: boolean;
  /** Label of the camera button (Hindi). */
  captureLabel?: string;
  /** Label of the gallery button (Hindi). */
  galleryLabel?: string;
  hint?: string;
};

/**
 * Two big buttons: take a photo (opens the phone's camera straight away) or pick
 * one from the gallery. Both are plain file inputs, which work in every mobile
 * browser without any camera permission dialog of our own.
 */
export function PhotoPicker({ onPhoto, busy = false, captureLabel = "फोटो लें", galleryLabel = "गैलरी से चुनें", hint }: PhotoPickerProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const id = useId();

  function handle(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // The same file can be chosen twice in a row.
    e.target.value = "";
    if (file) onPhoto(file);
  }

  return (
    <div className="space-y-3">
      <input ref={cameraRef} id={`${id}-camera`} type="file" accept="image/*" capture="environment" className="sr-only" onChange={handle} disabled={busy} />
      <input ref={galleryRef} id={`${id}-gallery`} type="file" accept="image/*" className="sr-only" onChange={handle} disabled={busy} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="primary" size="lg" block loading={busy} onClick={() => cameraRef.current?.click()}>
          <Camera aria-hidden className="h-5 w-5" />
          <span lang="hi">{captureLabel}</span>
        </Button>
        <Button variant="secondary" size="lg" block disabled={busy} onClick={() => galleryRef.current?.click()}>
          <Images aria-hidden className="h-5 w-5" />
          <span lang="hi">{galleryLabel}</span>
        </Button>
      </div>
      {hint ? (
        <p lang="hi" className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
