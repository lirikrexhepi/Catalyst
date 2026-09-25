import claudeLogo from '../assets/logo/claude-icon-logo.png'
import antigravityLogo from '../assets/logo/antigravity-icon-logo.png'
import opencodeDarkLogo from '../assets/logo/opencode-icon-logo-dark.png'
import opencodeLightLogo from '../assets/logo/opencode-icon-logo-light.png'

export const PROVIDER_ICONS: Record<string, string | undefined> = {
  claude: claudeLogo,
  'claude-code': claudeLogo,
  antigravity: antigravityLogo,
  opencode: opencodeLightLogo,
}

export const providerIcon = (driver: string, isLight = false): string | undefined => {
  if (driver === 'opencode') {
    return isLight ? opencodeDarkLogo : opencodeLightLogo
  }
  return PROVIDER_ICONS[driver]
}
