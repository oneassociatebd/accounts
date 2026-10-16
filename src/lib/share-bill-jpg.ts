// Shared helper for sending a bill JPG via WhatsApp.
// - When Web Share supports files (mobile or desktop): use navigator.share so
//   WhatsApp receives the image directly without a manual paste step.
// - Desktop fallback: copy the image (PNG) to the OS clipboard and open
//   WhatsApp chat so the user can paste it if direct file-share is unavailable.
// - Final fallback: download the JPG and open the WhatsApp chat.

export type ShareResult = "shared" | "clipboard" | "downloaded" | "cancelled" | "failed";

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function jpgToPng(jpg: Blob): Promise<Blob> {
  const url = URL.createObjectURL(jpg);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("png blob failed"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}


function buildWaUrl(mobile: string, _mobilePlatform: boolean) {
  const m = mobile.replace(/[^\d]/g, "");
  // Always use the whatsapp:// protocol so the installed WhatsApp app
  // (desktop or mobile) opens directly. Avoids web.whatsapp.com errors.
  return `whatsapp://send?phone=${m}&text=`;
}

export async function shareBillJpgViaWhatsApp(opts: {
  blob: Blob;
  filename: string;
  mobile: string;
}): Promise<ShareResult> {
  const { blob, filename, mobile } = opts;
  const onMobile = isMobile();

  const waUrl = buildWaUrl(mobile, onMobile);

  // 1) Mobile: use native share sheet so WhatsApp receives the file directly.
  if (onMobile) {
    const file = new File([blob], filename, { type: "image/jpeg" });
    const nav = typeof navigator !== "undefined" ? navigator : null;
    const canShareFiles =
      nav && typeof nav.canShare === "function" && nav.canShare({ files: [file] });
    if (canShareFiles && typeof nav.share === "function") {
      try {
        await nav.share({ files: [file], title: filename });
        return "shared";
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
        // fall through
      }
    }
  }

  // 2) Desktop: copy PNG to clipboard, open WhatsApp — user pastes with Ctrl+V.
  if (
    !onMobile &&
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof ClipboardItem !== "undefined"
  ) {
    try {
      const png = await jpgToPng(blob);
      const item = new ClipboardItem({ "image/png": png });
      await navigator.clipboard.write([item]);
      window.open(waUrl, "_blank", "noopener,noreferrer");
      return "clipboard";
    } catch {
      // fall through to download
    }
  }

  // 3) Fallback: just open WhatsApp chat (no auto-download — separate download button exists)
  window.open(waUrl, "_blank", "noopener,noreferrer");
  return "failed";
}

export function shareResultToast(r: ShareResult): { ok: boolean; msg: string; duration?: number } {
  switch (r) {
    case "shared":
      return { ok: true, msg: "Share complete", duration: 1500 };
    case "clipboard":
      return {
        ok: true,
        msg: "ছবি কপি হয়েছে — WhatsApp Desktop অ্যাপে Ctrl+V চাপুন",
        duration: 1800,
      };
    case "downloaded":
      return {
        ok: true,
        msg: "JPG ডাউনলোড হয়েছে — WhatsApp চ্যাটে attach করুন",
        duration: 1800,
      };
    case "cancelled":
      return { ok: false, msg: "Share cancelled", duration: 1500 };
    default:
      return {
        ok: false,
        msg: "WhatsApp খুলছে না — WhatsApp Desktop অ্যাপে লগইন করে আবার চেষ্টা করুন",
        duration: 2500,
      };
  }
}
