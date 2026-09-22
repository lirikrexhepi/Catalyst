import claudeLogo from '../../assets/logo/claude-icon-logo.png';
import antigravityLogo from '../../assets/logo/antigravity-icon-logo.png';
import opencodeDarkLogo from '../../assets/logo/opencode-icon-logo-dark.png';
import opencodeLightLogo from '../../assets/logo/opencode-icon-logo-light.png';

export const PROVIDER_ICONS: Record<string, string | undefined> = {
  claude: claudeLogo,
  antigravity: antigravityLogo,
  opencode: opencodeLightLogo,
};

export const providerIcon = (driver: string, isLight?: boolean): string | undefined => {
  const light =
    isLight !== undefined
      ? isLight
      : typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light';

  if (driver === 'opencode') {
    return light ? opencodeDarkLogo : opencodeLightLogo;
  }
  return PROVIDER_ICONS[driver];
};

