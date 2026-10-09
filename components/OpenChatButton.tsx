"use client";

export default function OpenChatButton({
  accentColor,
  label = "Chat with us",
}: {
  accentColor: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("gym-ai-open-chat"))}
      className="rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
      style={{ backgroundColor: accentColor }}
    >
      {label}
    </button>
  );
}
