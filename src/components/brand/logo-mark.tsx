import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The SwasthTrack mark: parents sheltered under one roof, held in two caring
 * hands, with the heartbeat at the centre. It is a transparent PNG with no
 * frame of its own, so it sits straight on the ivory canvas or a gilt card.
 * (The wordmark and the full lockup are /brand/wordmark.svg and
 * /brand/logo-full.png.)
 *
 * Give it a size with classes (`h-10 w-10`) and the matching `sizes` hint so
 * the browser fetches a crisp but not oversized image.
 */
export function LogoMark({
  className,
  sizes,
  priority,
  alt = "",
}: {
  className?: string;
  sizes: string;
  priority?: boolean;
  /** Leave empty when the name is written next to it. */
  alt?: string;
}) {
  return (
    <Image
      src="/brand/logo-mark.png"
      alt={alt}
      width={256}
      height={256}
      sizes={sizes}
      priority={priority}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
