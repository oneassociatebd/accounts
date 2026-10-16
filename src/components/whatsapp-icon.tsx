export function WhatsAppSendIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* WhatsApp green chat bubble */}
      <path
        d="M20.5 11.5c0-4.4-3.6-8-8-8s-8 3.6-8 8c0 1.5.4 2.9 1.1 4.1L4.6 19l3.9-1a7.9 7.9 0 0 0 12-5.5Z"
        fill="#25D366"
        stroke="#25D366"
        strokeWidth="0.5"
      />
      {/* Phone handset inside bubble */}
      <path
        d="M14.2 13.2c-.4.5-.9.5-1.3.1l-.4-.4-.4.3c-.2.2-.5.2-.7 0l-.3-.3c-.2-.2-.2-.5 0-.7l.3-.3-.4-.4c-.4-.4-.4-.9 0-1.3l.4-.4c.2-.2.5-.2.7 0l1.4 1.4c.2.2.2.5 0 .7l-.4.4c.3.3 1 .7 1.7.4.3-.1.5-.3.7-.4l.4-.4c.4-.4.9-.4 1.3 0l.4.4c.2.2.2.5 0 .7l-.4.4c-.5.6-1.4.9-2.3 1.1-.8.2-1.7 0-2.5-.4"
        stroke="white"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Send arrow circle overlay */}
      <circle cx="17.5" cy="17.5" r="4" fill="#128C7E" stroke="white" strokeWidth="1" />
      <path
        d="M16.5 17.5l1.5-1.5M16.5 17.5l1.5 1.5M16.5 17.5h3"
        stroke="white"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
