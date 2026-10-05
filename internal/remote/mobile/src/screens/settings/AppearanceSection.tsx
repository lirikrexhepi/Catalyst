import { Moon, SunMedium, SunMoon } from '../../icons'
import { GlassSegmented } from '../../ui'
import { ICON_STROKE } from '../../components/chrome/BarButton'
import { setThemePref, useThemePref, type ThemePref } from '../../theme'
import { APP_ICONS } from '../../appIcons'
import { setAppIcon, useAppIcon } from '../../appIcon'

const OPTIONS = [
  { value: 'dark', label: 'Dark', icon: <Moon size={20} strokeWidth={ICON_STROKE} /> },
  { value: 'light', label: 'Light', icon: <SunMedium size={20} strokeWidth={ICON_STROKE} /> },
  { value: 'auto', label: 'Auto', icon: <SunMoon size={20} strokeWidth={ICON_STROKE} /> },
] as const

export function AppearanceSection() {
  const pref = useThemePref()
  const appIcon = useAppIcon()
  return (
    <div className="settings-appearance-col">
      <div className="settings-appearance">
        <GlassSegmented<ThemePref>
          options={OPTIONS}
          value={pref}
          onChange={setThemePref}
          height={44}
          padding={0}
          gap={6}
          fill="var(--glass-control)"
          lensFill="rgba(var(--ink), 0.2)"
        />
        <span className="settings-appearance-label">{OPTIONS.find((o) => o.value === pref)?.label}</span>
      </div>
      <div className="appicon-grid" role="group" aria-label="App icon">
        {APP_ICONS.map((icon) => {
          const active = icon.id === appIcon
          return (
            <button
              key={icon.id}
              type="button"
              title={icon.label}
              aria-label={icon.label}
              aria-pressed={active}
              onClick={() => setAppIcon(icon.id)}
              className={active ? 'appicon-cell active' : 'appicon-cell'}
            >
              <img src={icon.src} alt="" draggable={false} className="appicon-img" />
            </button>
          )
        })}
      </div>
      <span className="settings-appearance-label">App icon</span>
    </div>
  )
}
