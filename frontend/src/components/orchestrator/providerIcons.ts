import claudeLogo from '../../assets/logo/claude-icon-logo.png';
import antigravityLogo from '../../assets/logo/antigravity-icon-logo.png';

// Codex and OpenCode have no artwork yet; they intentionally resolve to
// undefined so the UI falls back to a lettermark instead of borrowing another
// vendor's logo.
export const PROVIDER_ICONS: Record<string, string | undefined> = {
  claude: claudeLogo,
  antigravity: antigravityLogo,
};

export const providerIcon = (driver: string): string | undefined => PROVIDER_ICONS[driver];
