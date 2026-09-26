import { providerIcon } from '../providerIcons'

interface ProviderIconProps {
  driver: string
  name?: string
  size: number
}

export function ProviderIcon({ driver, name, size }: ProviderIconProps) {
  const src = providerIcon(driver)
  if (src) return <img src={src} alt="" width={size} height={size} className="provider-icon" draggable={false} />
  return (
    <span className="provider-icon provider-icon-fallback" style={{ width: size, height: size, fontSize: size * 0.46 }} aria-hidden>
      {(name || driver).charAt(0).toUpperCase()}
    </span>
  )
}
