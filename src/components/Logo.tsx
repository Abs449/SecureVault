/** SecureVault brand mark: a keyhole in a rounded square. Source: assets/logo.svg */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden="true" className="shrink-0">
      <rect width="128" height="128" rx="30" fill="var(--accent)" />
      <circle cx="64" cy="53" r="19" fill="#fff" />
      <path d="M55.5 62h17l6.2 31.2a4 4 0 0 1-3.9 4.8H53.2a4 4 0 0 1-3.9-4.8z" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="text-[15px] font-semibold tracking-tight text-fg">SecureVault</span>
    </span>
  );
}
