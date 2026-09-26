let trigger: HTMLLabelElement | null = null

function switchTrigger(): HTMLLabelElement | null {
  if (trigger || typeof document === 'undefined') return trigger
  const label = document.createElement('label')
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.tabIndex = -1
  input.setAttribute('switch', '')
  label.setAttribute('aria-hidden', 'true')
  label.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden'
  label.appendChild(input)
  document.body.appendChild(label)
  trigger = label
  return trigger
}

export function hapticTick() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(8)
    return
  }
  switchTrigger()?.click()
}
